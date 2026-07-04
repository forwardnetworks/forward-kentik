import assert from "node:assert/strict";
import test from "node:test";
import {
  buildStatusArtifact,
  fingerprintCheck,
  formatPrometheusMetrics,
  hostSpecifiersForCheck,
  locationSpecifiersForCheck,
  preflightLocations,
  reconcileChecks,
  selectApprovedMutations,
  validateApproval,
  validateManifest,
  validatePlannedChecks,
  verifyPackageSignature,
} from "../scripts/forward-import-package.mjs";
import { artifactJsonText, sha256Hex } from "../src/forward-package.mjs";
import { generateReleaseSigningKeyPair } from "../scripts/generate-release-signing-keypair.mjs";
import { signText } from "../scripts/sign-release-checksums.mjs";

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
    integrity: {
      algorithm: "sha256",
      intentChecksSha256: sha256Hex(artifactJsonText(checks)),
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
  assert.doesNotThrow(() => validateManifest(manifest, checks, { checksText: artifactJsonText(checks) }));
  assert.throws(() =>
    validateManifest(
      { ...manifest, integrity: { algorithm: "sha256", intentChecksSha256: "0".repeat(64) } },
      checks,
      { checksText: artifactJsonText(checks) },
    ),
  );
});

test("formats metrics and sanitized status artifacts", () => {
  const report = {
    runId: "run-1",
    mode: "dry-run",
    status: "completed",
    finishedAt: "2026-07-04T00:00:00.000Z",
    durationMs: 1234,
    package: {
      packageId: "kentik-forward-test",
      checksSha256: "a".repeat(64),
    },
    networkId: "network-1",
    snapshotId: "snapshot-1",
    plannedChecks: 3,
    counts: {
      create: 1,
      unchanged: 1,
      changed: 1,
      stale: 0,
    },
    locationPreflight: {
      checked: { HostFilter: 2, DeviceFilter: 1 },
      missing: { HostFilter: ["192.0.2.1"], DeviceFilter: [] },
      unchecked: { InterfaceFilter: [] },
    },
  };

  const metrics = formatPrometheusMetrics(report);
  assert.match(metrics, /forward_kentik_import_planned_checks 3/);
  assert.match(metrics, /forward_kentik_import_missing_locations 1/);
  assert.match(metrics, /forward_kentik_import_duration_seconds 1.234/);

  const status = buildStatusArtifact(report);
  assert.equal(status.schemaVersion, "forward-kentik-ingest-status/v0.1");
  assert.equal(status.locationReadiness.missing.HostFilter, 1);
  assert.deepEqual(status.warnings, ["changed-checks", "missing-locations"]);
});

test("validates approval artifacts and selects approved mutations", () => {
  const planned = [makeCheck("one", "one"), makeCheck("two", "two")];
  const existingChanged = { id: "existing-two", ...makeCheck("two", "two", "8443") };
  const stale = { id: "stale-id", ...makeCheck("stale", "stale") };
  const reconciliation = reconcileChecks(planned, [makeCheck("one", "one"), existingChanged, stale]);
  const approval = {
    schemaVersion: "forward-kentik-approval/v0.1",
    packageId: "kentik-forward-test",
    changeWindowId: "CHG-1",
    expiresAt: "2999-01-01T00:00:00.000Z",
    approvedBy: "operator@example.com",
    reason: "test approval",
    approvedChangedKeys: ["kentik-key:two"],
    approvedStaleKeys: ["kentik-key:stale"],
  };

  assert.doesNotThrow(() =>
    validateApproval(approval, {
      changeWindowId: "CHG-1",
      packageId: "kentik-forward-test",
      now: new Date("2026-07-04T00:00:00.000Z"),
    }),
  );
  const selected = selectApprovedMutations({
    approval,
    applyUpdates: true,
    deactivateStale: true,
    maxDeactivations: 1,
    maxUpdates: 1,
    reconciliation,
  });
  assert.equal(selected.updates.length, 1);
  assert.equal(selected.deactivations.length, 1);
  assert.throws(() =>
    selectApprovedMutations({
      approval: { ...approval, approvedChangedKeys: ["kentik-key:missing"], approvedStaleKeys: [] },
      applyUpdates: true,
      deactivateStale: false,
      maxDeactivations: 0,
      maxUpdates: 1,
      reconciliation,
    }),
  );
});

test("verifies exact package signatures", () => {
  const keys = generateReleaseSigningKeyPair();
  const checksText = artifactJsonText([makeCheck("one", "one")]);
  const manifestText = artifactJsonText({ schemaVersion: "forward-kentik/v0.1" });
  const signature = signText({ privateKeyPem: keys.privateKeyPem, text: `${manifestText}\n${checksText}` });
  assert.equal(verifyPackageSignature({ checksText, manifestText, publicKeyPem: keys.publicKeyPem, signature }), true);
  assert.equal(
    verifyPackageSignature({
      checksText: artifactJsonText([makeCheck("two", "two")]),
      manifestText,
      publicKeyPem: keys.publicKeyPem,
      signature,
    }),
    false,
  );
});
