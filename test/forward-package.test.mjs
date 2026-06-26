import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { buildForwardPackage, toForwardIntentCheck, toIntegrationKey, validateForwardPackage } from "../src/forward-package.mjs";
import { resolveFlowLocations } from "../src/location-map.mjs";
import { normalizeKentikPayload } from "../src/normalize.mjs";

const fixtureFlows = async () => {
  const payload = JSON.parse(await readFile("fixtures/kentik-topxdata.demo.json", "utf8"));
  return normalizeKentikPayload(payload);
};

test("builds stable integration keys", async () => {
  const [flow] = await fixtureFlows();
  assert.equal(
    toIntegrationKey(flow),
    "kentik:checkout:branch-a:dc-east:10.20.10.15:172.16.40.20:tcp:443",
  );
});

test("builds Forward Existential check JSON", async () => {
  const [flow] = await fixtureFlows();
  const check = toForwardIntentCheck(flow);
  assert.equal(check.definition.checkType, "Existential");
  assert.equal(check.definition.filters.from.location.type, "HostFilter");
  assert.equal(check.definition.filters.from.location.value, "10.20.10.15");
  assert.equal(check.definition.filters.to.location.value, "172.16.40.20");
  assert.deepEqual(check.definition.filters.from.headers[0].values.ip_proto, ["6"]);
  assert.deepEqual(check.definition.filters.from.headers[1].values.tp_dst, ["443"]);
  assert.ok(check.tags.includes("kentik"));
  assert.ok(check.tags.some((tag) => tag.startsWith("kentik-key:")));
});

test("builds package and skip report", async () => {
  const flows = await fixtureFlows();
  const forwardPackage = buildForwardPackage(flows);
  assert.equal(forwardPackage.checks.length, 3);
  assert.equal(forwardPackage.report.skipped.length, 1);
  assert.deepEqual(validateForwardPackage(forwardPackage), []);
});

test("uses mapped Forward locations when provided", async () => {
  const [flow] = await fixtureFlows();
  const mapped = resolveFlowLocations(flow, {
    src: {
      "branch-a": { type: "DeviceFilter", value: "branch-router" },
    },
    dst: {
      "dc-east": { type: "DeviceFilter", value: "dc-firewall" },
    },
  });
  const check = toForwardIntentCheck(mapped);
  assert.deepEqual(check.definition.filters.from.location, { type: "DeviceFilter", value: "branch-router" });
  assert.deepEqual(check.definition.filters.to.location, { type: "DeviceFilter", value: "dc-firewall" });
  assert.ok(check.tags.includes("forward-location-mapped"));
  assert.match(check.note, /forwardFrom=src:srcSite=branch-a/);
});
