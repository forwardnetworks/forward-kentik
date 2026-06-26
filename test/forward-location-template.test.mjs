import assert from "node:assert/strict";
import test from "node:test";
import { buildLocationMapTemplate, uniqueSites } from "../src/forward-location-template.mjs";

const flows = [
  { srcSite: "branch-a", dstSite: "dc-east" },
  { srcSite: "branch-b", dstSite: "internet" },
];

test("extracts unique sites from observed flows", () => {
  assert.deepEqual(uniqueSites(flows), ["branch-a", "branch-b", "dc-east", "internet"]);
});

test("builds a reviewed location map template from Forward devices", () => {
  const map = buildLocationMapTemplate({
    flows,
    devices: [
      { name: "east-dc-core" },
      { name: "internet-edge" },
      { name: "branch-a-router" },
      { name: "branch-b-router" },
    ],
  });

  assert.equal(map.reviewRequired, true);
  assert.deepEqual(map.src["branch-a"], { type: "DeviceFilter", value: "branch-a-router" });
  assert.deepEqual(map.dst.internet, { type: "DeviceFilter", value: "internet-edge" });
});

test("fails when Forward network has no devices", () => {
  assert.throws(() => buildLocationMapTemplate({ flows, devices: [] }));
});
