import assert from "node:assert/strict";
import test from "node:test";
import { buildSeededTopXData, sanitizeKentikDemoCatalog } from "../src/demo-seed.mjs";
import { normalizeKentikPayload } from "../src/normalize.mjs";

test("sanitizes dashboard catalog and builds topXdata fixture", () => {
  const catalog = sanitizeKentikDemoCatalog({
    dashboards: [
      {
        company_id: 1,
        user_id: 2,
        dash_title: "Traffic Overview",
        description: "Network traffic summary",
        saved_query_id: 123,
        category: { category_name: "NetOps" },
        query: {
          metric: "bytes",
          dimension: ["IP_src", "IP_dst"],
          viz_type: "table",
          topx: 10,
        },
      },
    ],
    savedViews: [],
  });
  assert.equal(catalog.dashboards.length, 1);
  assert.equal(catalog.dashboards[0].title, "Traffic Overview");
  assert.equal(catalog.dashboards[0].company_id, undefined);

  const topXData = buildSeededTopXData(catalog, { count: 1 });
  const flows = normalizeKentikPayload(topXData);
  assert.equal(flows.length, 1);
  assert.equal(flows[0].srcIp, "10.20.10.15");
  assert.equal(flows[0].protocol, "tcp");
  assert.equal(flows[0].confidence, "high");
});
