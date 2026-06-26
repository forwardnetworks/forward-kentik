import assert from "node:assert/strict";
import test from "node:test";
import { applyLocationMap, normalizeLocation, resolveFlowLocations } from "../src/location-map.mjs";

const flow = {
  srcIp: "10.20.10.15",
  srcSite: "branch-a",
  dstIp: "172.16.40.20",
  dstSite: "dc-east",
  protocol: "tcp",
  dstPort: 443,
};

test("maps flow endpoints by direct source and destination values", () => {
  const mapped = resolveFlowLocations(flow, {
    src: {
      "branch-a": { type: "DeviceFilter", value: "branch-router" },
    },
    dst: {
      "172.16.40.20": { type: "DeviceFilter", value: "dc-firewall" },
    },
  });

  assert.deepEqual(mapped.forwardLocations.from, { type: "DeviceFilter", value: "branch-router" });
  assert.deepEqual(mapped.forwardLocations.to, { type: "DeviceFilter", value: "dc-firewall" });
  assert.equal(mapped.forwardLocationMapping.from, "src:srcSite=branch-a");
  assert.equal(mapped.forwardLocationMapping.to, "dst:dstIp=172.16.40.20");
});

test("maps flow endpoints by rules and defaults", () => {
  const [mapped] = applyLocationMap([flow], {
    rules: [
      {
        match: { srcSite: "branch-a" },
        from: { type: "InterfaceFilter", value: "branch-router Ethernet1" },
      },
    ],
    defaults: {
      to: { type: "DeviceFilter", value: "internet-edge" },
    },
  });

  assert.deepEqual(mapped.forwardLocations.from, { type: "InterfaceFilter", value: "branch-router Ethernet1" });
  assert.deepEqual(mapped.forwardLocations.to, { type: "DeviceFilter", value: "internet-edge" });
});

test("validates location objects", () => {
  assert.deepEqual(normalizeLocation({ type: "HostFilter", value: " 10.0.0.1 " }), {
    type: "HostFilter",
    value: "10.0.0.1",
  });
  assert.throws(() => normalizeLocation({ type: "BadFilter", value: "x" }));
  assert.throws(() => normalizeLocation({ type: "HostFilter", value: "x", values: ["y"] }));
});
