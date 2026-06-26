import { createHash } from "node:crypto";

const DEFAULT_FLOW_COUNT = 8;
const PORTS = [443, 53, 8443, 22, 161, 80, 123, 500];
const PROTOCOLS = ["6", "17", "6", "6", "17", "6", "17", "17"];

export const sanitizeKentikDemoCatalog = ({ dashboards = [], savedViews = [] }) => ({
  schemaVersion: "forward-kentik-demo-catalog/v0.1",
  source: "kentik-portal-dashboard-catalog",
  note: "Sanitized dashboard and saved-view metadata. IDs, users, and company identifiers are omitted.",
  dashboards: dashboards.map(sanitizeDashboard).filter(Boolean),
  savedViews: savedViews.map(sanitizeSavedView).filter(Boolean),
});

export const buildSeededTopXData = (catalog, options = {}) => {
  const count = Number(options.count || DEFAULT_FLOW_COUNT);
  const candidates = [...catalog.dashboards, ...catalog.savedViews]
    .filter((item) => item.title || item.name)
    .sort((left, right) => scoreCatalogItem(right) - scoreCatalogItem(left))
    .slice(0, count);

  return {
    results: [
      {
        bucket: "Kentik Demo Dashboard Seed",
        data: candidates.map((item, index) => seededFlowRow(item, index)),
      },
    ],
  };
};

const sanitizeDashboard = (dashboard) => {
  if (!dashboard?.dash_title) {
    return null;
  }
  return {
    type: "dashboard",
    title: cleanText(dashboard.dash_title),
    description: cleanText(dashboard.description),
    category: cleanText(dashboard.category?.category_name || dashboard.category?.name),
    key: stableKey(["dashboard", dashboard.dash_title, dashboard.saved_query_id]),
    query: summarizeQuery(dashboard.query),
  };
};

const sanitizeSavedView = (view) => {
  if (!view?.view_name) {
    return null;
  }
  return {
    type: "saved-view",
    title: cleanText(view.view_name),
    description: cleanText(view.view_description),
    category: cleanText(view.category?.category_name || view.category?.name),
    key: stableKey(["saved-view", view.view_name, view.saved_query_id]),
    query: summarizeQuery(view.savedQuery?.query || view.savedQuery),
  };
};

const summarizeQuery = (query) => {
  if (!query || typeof query !== "object") {
    return {};
  }
  return {
    title: cleanText(query.query_title),
    metric: cleanText(query.metric),
    dimensions: Array.isArray(query.dimension) ? query.dimension.map(cleanText).filter(Boolean) : [],
    vizType: cleanText(query.viz_type),
    queryType: cleanText(query.query_type),
    topx: finiteNumber(query.topx),
    depth: finiteNumber(query.depth),
    lookbackSeconds: finiteNumber(query.lookback_seconds),
    allSelected: typeof query.all_selected === "boolean" ? query.all_selected : undefined,
  };
};

const seededFlowRow = (item, index) => {
  const port = PORTS[index % PORTS.length];
  const proto = PROTOCOLS[index % PROTOCOLS.length];
  const app = slug(item.title || item.name || `demo-${index + 1}`);
  const bytes = 50_000_000 + index * 27_500_000;
  const packets = 15_000 + index * 4_100;
  return {
    IP_src: `10.${20 + index}.10.${15 + index}`,
    IP_dst: index % 3 === 0 ? `172.16.${40 + index}.20` : `198.51.100.${20 + index}`,
    Proto: proto,
    Port_dst: port,
    application: app,
    src_site: `demo-branch-${(index % 4) + 1}`,
    dst_site: index % 3 === 0 ? "demo-dc" : "demo-internet",
    device_name: "kentik-demo-dashboard-seed",
    sum_bytes: bytes,
    sum_packets: packets,
    sum_flows: 100 + index * 23,
    max_bits_per_sec: Math.round((bytes * 8) / 3600),
    first_seen: "2026-06-26T13:00:00Z",
    last_seen: "2026-06-26T14:00:00Z",
    kentik_demo_source: item.type,
    kentik_demo_title: item.title,
    kentik_demo_category: item.category,
  };
};

const scoreCatalogItem = (item) => {
  const text = `${item.title || ""} ${item.description || ""} ${item.category || ""}`.toLowerCase();
  let score = 0;
  for (const term of ["traffic", "netops", "ip", "investigation", "network", "cdn", "pivot"]) {
    if (text.includes(term)) {
      score += 10;
    }
  }
  if (item.query?.metric) {
    score += 2;
  }
  return score;
};

const cleanText = (value) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  return String(value).replace(/\s+/g, " ").trim().slice(0, 200);
};

const finiteNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const stableKey = (parts) =>
  createHash("sha256")
    .update(parts.filter(Boolean).join("|"))
    .digest("hex")
    .slice(0, 16);

const slug = (value) =>
  String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
