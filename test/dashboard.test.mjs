import assert from "node:assert/strict";
import test from "node:test";
import { buildDashboardHtml, dashboardRows } from "../src/dashboard.mjs";

const flow = {
  application: "checkout",
  srcIp: "10.20.10.15",
  dstIp: "172.16.40.20",
  protocol: "tcp",
  dstPort: 443,
  bytes: 184467440,
  forwardLocations: {
    from: { type: "DeviceFilter", value: "branch-router" },
    to: { type: "DeviceFilter", value: "dc-core" },
  },
};

const check = {
  name: "[Kentik] checkout",
  definition: {
    filters: {
      from: { location: { type: "DeviceFilter", value: "branch-router" } },
      to: { location: { type: "DeviceFilter", value: "dc-core" } },
    },
  },
};

test("builds dashboard rows from mapped flows and checks", () => {
  const [row] = dashboardRows([flow], [check]);
  assert.equal(row.application, "checkout");
  assert.equal(row.from, "DeviceFilter: branch-router");
  assert.equal(row.to, "DeviceFilter: dc-core");
  assert.equal(row.status, "Ready");
});

test("renders exposure-style dashboard html", () => {
  const html = buildDashboardHtml({
    flows: [flow],
    checks: [check],
    manifest: { generatedAt: "2026-06-26T12:00:00.000Z" },
    report: {
      observedFlows: 1,
      generatedChecks: 1,
      locationMapping: { fromMapped: 1, toMapped: 1, bothMapped: 1 },
    },
    importReport: { counts: { create: 1, unchanged: 0, changed: 0 } },
  });
  assert.match(html, /Kentik Intent Candidate Correlation/);
  assert.match(html, /kentik-logo/);
  assert.match(html, /forward-logo/);
  assert.match(html, /Export package/);
  assert.match(html, /Push into Forward/);
  assert.match(html, /checkout/);
});
