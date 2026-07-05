import { buildSeededTopXData, sanitizeKentikDemoCatalog } from "./demo-seed.mjs";
import { extractKentikRows } from "./normalize.mjs";

export const NO_KENTIK_DEVICES_MESSAGE = "Kentik account returned no devices; cannot build a Query API request";

export class NoKentikDevicesError extends Error {
  constructor() {
    super(NO_KENTIK_DEVICES_MESSAGE);
    this.name = "NoKentikDevicesError";
    this.code = "KENTIK_NO_DEVICES";
  }
}

export const isNoKentikDevicesError = (error) =>
  error?.code === "KENTIK_NO_DEVICES" || error?.message === NO_KENTIK_DEVICES_MESSAGE;

export const deviceNamesFromDevices = (devices) =>
  [...new Set(devices.map((device) => device?.device_name || device?.name).filter(Boolean))].sort();

export const ensureDeviceNames = (query, deviceNames) => {
  const cloned = structuredClone(query);
  let changed = false;
  for (const item of cloned.queries || []) {
    if (!item.query) {
      continue;
    }
    if (!item.query.device_name || item.query.device_name.length === 0) {
      if (deviceNames.length === 0) {
        throw new NoKentikDevicesError();
      }
      item.query.device_name = deviceNames.join(",");
      item.query.num_selected = deviceNames.length;
      item.query.all_selected = false;
      changed = true;
    }
  }
  return changed ? cloned : query;
};

export const runKentikQuerySmoke = async ({ client, query, queryPath, out, writeJson = async () => {} }) => {
  const devices = await client.listDevices();
  const deviceNames = deviceNamesFromDevices(devices);
  const queryWithDevices = ensureDeviceNames(query, deviceNames);
  const response = await client.queryTopXData(queryWithDevices);
  if (out) {
    await writeJson(out, response);
  }

  const rows = extractKentikRows(response);
  return {
    source: "kentik-query-api",
    synthetic: false,
    apiUrl: client.apiUrl || null,
    query: queryPath,
    wrote: out || null,
    devices: deviceNames.length,
    injectedDeviceNames: queryWithDevices !== query,
    resultBuckets: Array.isArray(response?.results) ? response.results.length : 0,
    rows: rows.length,
    sampleKeys: rows[0] ? Object.keys(rows[0]).slice(0, 20) : [],
  };
};

export const runKentikPortalSeedSmoke = async ({
  portalClient,
  count,
  catalogOut,
  flowsOut,
  writeJson = async () => {},
}) => {
  await portalClient.login();
  const rawCatalog = await portalClient.fetchDemoCatalog();
  const catalog = sanitizeKentikDemoCatalog(rawCatalog);
  const topXData = buildSeededTopXData(catalog, { count });

  await writeJson(catalogOut, catalog);
  await writeJson(flowsOut, topXData);

  return {
    source: "kentik-portal-seeded-demo",
    synthetic: true,
    warning: "Kentik Query API returned no devices; generated synthetic fixture from sanitized portal catalog.",
    catalogOut,
    wrote: flowsOut,
    dashboards: catalog.dashboards.length,
    savedViews: catalog.savedViews.length,
    rows: topXData.results[0].data.length,
  };
};

export const runKentikLiveOrSeedSmoke = async ({
  client,
  portalClientFactory,
  query,
  queryPath,
  out,
  catalogOut,
  count,
  writeJson,
}) => {
  try {
    return await runKentikQuerySmoke({ client, query, queryPath, out, writeJson });
  } catch (error) {
    if (!isNoKentikDevicesError(error)) {
      throw error;
    }
    if (!portalClientFactory) {
      throw new Error(`${NO_KENTIK_DEVICES_MESSAGE}; portal seed fallback is not configured.`, { cause: error });
    }
    const portalClient = await portalClientFactory();
    const summary = await runKentikPortalSeedSmoke({
      portalClient,
      count,
      catalogOut,
      flowsOut: out,
      writeJson,
    });
    return {
      ...summary,
      liveError: error.message,
    };
  }
};
