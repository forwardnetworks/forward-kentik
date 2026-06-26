import assert from "node:assert/strict";
import test from "node:test";
import {
  fingerprintCheck,
  hostSpecifiersForCheck,
  locationSpecifiersForCheck,
  preflightLocations,
  reconcileChecks,
  validateManifest,
  validatePlannedChecks,
} from "../scripts/forward-import-package.mjs";

const makeCheck = (name, key, port = "443") => ({
  definition: {
    checkType: "Existential",
    filters: {
      from: {
        location: { type: "HostFilter", value: "10.0.0.1" },
        headers: [
          { type: "PacketFilter", values: { ip_proto: ["6"] } },
          { type: "PacketFilter", values: { tp_dst: [port] } },
        ],
      },
      to: {
        location: { type: "HostFilter", value: "192.0.2.10" },
      },
      flowTypes: ["VALID"],
    },
  },
  enabled: true,
  name,
  priority: "LOW",
  tags: ["kentik", `kentik-key:${key}`],
});

test("validates planned Kentik checks", () => {
  assert.doesNotThrow(() => validatePlannedChecks([makeCheck("check", "one")]));
  assert.throws(() => validatePlannedChecks([makeCheck("check", "one"), makeCheck("check", "two")]));
});

test("extracts host specifiers for apply preflight", () => {
  assert.deepEqual(hostSpecifiersForCheck(makeCheck("check", "one")), ["10.0.0.1", "192.0.2.10"]);
});

test("extracts location specifiers for apply preflight", () => {
  const check = makeCheck("check", "one");
  check.definition.filters.from.location = { type: "DeviceFilter", value: "branch-router" };
  assert.deepEqual(locationSpecifiersForCheck(check), {
    HostFilter: ["192.0.2.10"],
    DeviceFilter: ["branch-router"],
    InterfaceFilter: [],
  });
});

test("preflights hosts and devices", async () => {
  const check = makeCheck("check", "one");
  check.definition.filters.from.location = { type: "DeviceFilter", value: "branch-router" };
  const calls = [];
  const api = async (method, apiPath) => {
    calls.push(`${method} ${apiPath}`);
    if (apiPath.includes("/hosts/192.0.2.10")) {
      return { hosts: [{ id: "host-1" }] };
    }
    if (apiPath.endsWith("/devices")) {
      return [{ name: "branch-router" }];
    }
    throw new Error(`unexpected call ${apiPath}`);
  };

  const result = await preflightLocations({ api, networkId: "demo", checks: [check] });
  assert.deepEqual(result.missing, { HostFilter: [], DeviceFilter: [] });
  assert.deepEqual(calls, ["GET /networks/demo/hosts/192.0.2.10", "GET /networks/demo/devices"]);
});

test("reconciles create unchanged changed and stale", () => {
  const plannedOne = makeCheck("one", "one");
  const plannedTwo = makeCheck("two", "two");
  const existingOne = { id: "existing-one", ...structuredClone(plannedOne) };
  const existingTwo = { id: "existing-two", ...makeCheck("two", "two", "8443") };
  const stale = { id: "stale", ...makeCheck("stale", "stale") };
  const reconciliation = reconcileChecks([plannedOne, plannedTwo, makeCheck("three", "three")], [
    existingOne,
    existingTwo,
    stale,
  ]);
  assert.equal(reconciliation.unchanged.length, 1);
  assert.equal(reconciliation.changed.length, 1);
  assert.equal(reconciliation.create.length, 1);
  assert.equal(reconciliation.stale.length, 1);
  assert.equal(fingerprintCheck(plannedOne), fingerprintCheck(existingOne));
});

test("validates manifest", () => {
  const checks = [makeCheck("one", "one")];
  const manifest = {
    schemaVersion: "forward-kentik/v0.1",
    packageType: "forward-intent-import",
    packageId: "kentik-forward-test",
    generatedAt: new Date().toISOString(),
    source: {
      platform: "kentik",
      app: "forward-kentik",
      writePolicy: "kentik-never-writes-forward",
    },
    artifacts: {
      manifest: "forward-kentik-manifest.json",
      intentChecks: "forward-intent-checks.json",
    },
    intentChecks: {
      count: 1,
      checkType: "Existential",
      payloadShape: "NewNetworkCheck[]",
      bulkEndpoint: "/api/snapshots/{snapshotId}/checks?bulk",
      dedupeRequiredBeforePost: true,
    },
    reconciliation: {
      requiredTagPrefix: "kentik-key:",
      defaultApplyPolicy: "create-missing-only",
      changedChecks: "report-only",
      staleChecks: "report-only",
    },
  };
  assert.doesNotThrow(() => validateManifest(manifest, checks));
});
