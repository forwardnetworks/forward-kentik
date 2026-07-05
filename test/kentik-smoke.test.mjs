import assert from "node:assert/strict";
import test from "node:test";
import {
  NoKentikDevicesError,
  ensureDeviceNames,
  runKentikLiveOrSeedSmoke,
  runKentikQuerySmoke,
} from "../src/kentik-smoke.mjs";

const query = {
  queries: [
    {
      query: {
        device_name: "",
        num_selected: 0,
        all_selected: true,
      },
    },
  ],
};

const topXData = {
  results: [
    {
      data: [
        {
          i_src: "10.20.10.15",
          i_dst: "172.16.40.20",
          protocol: "tcp",
          dst_port: "443",
          bytes: 100,
        },
      ],
    },
  ],
};

test("injects device names into Kentik Query API requests", () => {
  const updated = ensureDeviceNames(query, ["edge-1", "edge-2"]);
  assert.notEqual(updated, query);
  assert.equal(updated.queries[0].query.device_name, "edge-1,edge-2");
  assert.equal(updated.queries[0].query.num_selected, 2);
  assert.equal(updated.queries[0].query.all_selected, false);
});

test("throws a typed error when Kentik has no queryable devices", () => {
  assert.throws(() => ensureDeviceNames(query, []), NoKentikDevicesError);
});

test("runs live Query API smoke when devices exist", async () => {
  const writes = [];
  const summary = await runKentikQuerySmoke({
    client: {
      apiUrl: "https://api.kentik.example",
      listDevices: async () => [{ device_name: "edge-1" }],
      queryTopXData: async (request) => {
        assert.equal(request.queries[0].query.device_name, "edge-1");
        return topXData;
      },
    },
    query,
    queryPath: "query.json",
    out: "dist/live.json",
    writeJson: async (filePath, value) => writes.push({ filePath, value }),
  });

  assert.equal(summary.source, "kentik-query-api");
  assert.equal(summary.synthetic, false);
  assert.equal(summary.devices, 1);
  assert.equal(summary.rows, 1);
  assert.equal(writes[0].filePath, "dist/live.json");
});

test("falls back to portal-seeded demo only for the no-devices case", async () => {
  const writes = [];
  const summary = await runKentikLiveOrSeedSmoke({
    client: {
      apiUrl: "https://api.kentik.example",
      listDevices: async () => [],
      queryTopXData: async () => {
        throw new Error("query should not run");
      },
    },
    portalClientFactory: async () => ({
      login: async () => {},
      fetchDemoCatalog: async () => ({
        dashboards: [{ dash_title: "Traffic Overview", category: { category_name: "NetOps" } }],
        savedViews: [],
      }),
    }),
    query,
    queryPath: "query.json",
    out: "dist/live.json",
    catalogOut: "dist/catalog.json",
    count: 1,
    writeJson: async (filePath, value) => writes.push({ filePath, value }),
  });

  assert.equal(summary.source, "kentik-portal-seeded-demo");
  assert.equal(summary.synthetic, true);
  assert.equal(summary.liveError, "Kentik account returned no devices; cannot build a Query API request");
  assert.equal(summary.rows, 1);
  assert.deepEqual(
    writes.map((write) => write.filePath),
    ["dist/catalog.json", "dist/live.json"],
  );
});

test("does not fall back to portal seed on other Kentik failures", async () => {
  await assert.rejects(
    () =>
      runKentikLiveOrSeedSmoke({
        client: {
          apiUrl: "https://api.kentik.example",
          listDevices: async () => {
            throw new Error("Kentik API 401");
          },
        },
        portalClientFactory: async () => {
          throw new Error("portal fallback should not run");
        },
        query,
        queryPath: "query.json",
        out: "dist/live.json",
        catalogOut: "dist/catalog.json",
        count: 1,
      }),
    /Kentik API 401/,
  );
});
