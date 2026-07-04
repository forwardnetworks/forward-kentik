#!/usr/bin/env node

import { createHash, randomUUID, verify as cryptoVerify } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";

const DEFAULT_CHECKS_PATH = "forward-intent-checks.json";
const DEFAULT_MANIFEST_FILE_NAME = "forward-kentik-manifest.json";
const DEFAULT_BATCH_SIZE = 500;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_MAX_PACKAGE_AGE_MINUTES = 24 * 60;
const DEFAULT_TIMEOUT_MS = 30_000;
const PACKAGE_SCHEMA_VERSION = "forward-kentik/v0.1";
const PACKAGE_TYPE = "forward-intent-import";
const REQUIRED_KEY_PREFIX = "kentik-key:";
const TRANSIENT_STATUS_CODES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const ALLOWED_CHECK_TYPES = new Set(["Existential"]);
const LOCAL_HTTP_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);

const usage = `
Forward Integration for Kentik package importer

Required environment when not using --validate-only:
  FORWARD_BASE_URL       Example: https://forward.example.com
  FORWARD_USER           Forward username
  FORWARD_PASSWORD       Forward password or token accepted by the tenant
  FORWARD_NETWORK_ID     Target Forward network ID

Usage:
  node scripts/forward-import-package.mjs --checks dist/forward-intent-checks.json --manifest dist/forward-kentik-manifest.json
  node scripts/forward-import-package.mjs --checks dist/forward-intent-checks.json --manifest dist/forward-kentik-manifest.json --apply
  node scripts/forward-import-package.mjs --package-url https://package.example.com/forward-kentik/latest/ --report forward-import-report.json

Options:
  --apply              Create missing checks. Changed and stale checks are report-only by default.
  --apply-updates      Replace approved changed generated checks. Requires --apply,
                       --require-signature, and --require-approval-file.
  --batch-size 500     Batch size for /checks?bulk.
  --change-window-id id
                       Require approval file to match this change window ID.
  --checks path        Local Forward NewNetworkCheck[] JSON.
  --checks-url url     Pull checks from a read-only HTTPS URL.
  --deactivate-stale   Delete approved stale generated checks. Requires --apply,
                       --require-signature, and --require-approval-file.
  --fail-on-drift      Exit non-zero when changed or stale Kentik-managed checks are found.
  --manifest path      Validate the package manifest before importing.
  --manifest-url url   Pull manifest from a read-only HTTPS URL.
  --max-deactivations 0
                       Maximum approved stale checks to delete.
  --max-package-age-minutes 1440
                       Reject manifests older than this age.
  --max-retries 3      Retry count for transient Forward API responses.
  --max-updates 0      Maximum approved changed checks to replace.
  --metrics path       Write Prometheus-style import metrics to a text file.
  --package-url url    Pull manifest and checks from a base URL.
  --public-key path    Verify detached package signature with PEM public key.
  --require-approval-file path
                       Exact approval artifact for changed/stale kentik keys.
  --require-signature  Reject package unless signature and public key verify.
  --report path        Write the reconciliation report to a JSON file.
  --signature path     Detached package signature.
  --status-artifact path
                       Write sanitized read-only ingest status JSON.
  --skip-location-preflight
                       Advanced: skip Forward location lookup before --apply.
  --skip-host-preflight
                       Legacy alias for --skip-location-preflight.
  --timeout-ms 30000   Per Forward/package HTTP request timeout.
  --validate-only      Validate package shape without contacting Forward.

Default mode is dry-run. Apply policy is create-missing-only. Non-local package
URLs must use HTTPS.
`;

const SUPPORTED_ARGS = new Set([
  "_",
  "apply",
  "apply-updates",
  "batch-size",
  "change-window-id",
  "checks",
  "checks-url",
  "deactivate-stale",
  "fail-on-drift",
  "help",
  "manifest",
  "manifest-url",
  "max-deactivations",
  "max-package-age-minutes",
  "max-retries",
  "max-updates",
  "metrics",
  "package-url",
  "public-key",
  "require-approval-file",
  "require-signature",
  "report",
  "signature",
  "status-artifact",
  "skip-location-preflight",
  "skip-host-preflight",
  "timeout-ms",
  "validate-only",
]);

const parseArgs = (argv) => {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) {
      args._.push(value);
      continue;
    }
    const key = value.slice(2);
    if (
      key === "apply" ||
      key === "apply-updates" ||
      key === "deactivate-stale" ||
      key === "fail-on-drift" ||
      key === "help" ||
      key === "require-signature" ||
      key === "skip-location-preflight" ||
      key === "skip-host-preflight" ||
      key === "validate-only"
    ) {
      args[key] = true;
      continue;
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }
    args[key] = next;
    index += 1;
  }
  return args;
};

const validateArgs = (args) => {
  const unsupportedArgs = Object.keys(args).filter((key) => !SUPPORTED_ARGS.has(key));
  if (unsupportedArgs.length > 0) {
    throw new Error(`Unsupported option(s): ${unsupportedArgs.map((key) => `--${key}`).join(", ")}`);
  }
  if (args.checks && args["checks-url"]) {
    throw new Error("Use either --checks or --checks-url, not both.");
  }
  if (args.manifest && args["manifest-url"]) {
    throw new Error("Use either --manifest or --manifest-url, not both.");
  }
  if (args["package-url"] && (args.checks || args.manifest)) {
    throw new Error("Use --checks-url or --manifest-url to override files when --package-url is set.");
  }
};

const validatePolicyArgs = (args) => {
  const hasMutationFlag = Boolean(args["apply-updates"] || args["deactivate-stale"]);
  if (hasMutationFlag && !args.apply) {
    throw new Error("--apply-updates and --deactivate-stale require --apply.");
  }
  if (hasMutationFlag && !args["require-signature"]) {
    throw new Error("--apply-updates and --deactivate-stale require --require-signature.");
  }
  if (hasMutationFlag && !args["require-approval-file"]) {
    throw new Error("--apply-updates and --deactivate-stale require --require-approval-file.");
  }
  if (args["require-signature"] && (!args.signature || !args["public-key"])) {
    throw new Error("--require-signature requires --signature and --public-key.");
  }
};

const requiredEnv = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const readJsonWithText = async (filePath) => {
  const text = await readFile(filePath, "utf8");
  return { value: JSON.parse(text), text };
};
const readText = async (filePath) => readFile(filePath, "utf8");
const isUrlLocator = (locator) => /^https?:\/\//i.test(locator);
const joinUrl = (baseUrl, fileName) => `${baseUrl.replace(/\/+$/, "")}/${fileName}`;
const sha256Hex = (text) => createHash("sha256").update(text, "utf8").digest("hex");
const packageSignatureText = ({ checksText, manifestText }) => `${manifestText}\n${checksText}`;

const validatePackageUrl = (locator) => {
  const url = new URL(locator);
  if (url.protocol === "https:") {
    return;
  }
  if (url.protocol === "http:" && LOCAL_HTTP_HOSTS.has(url.hostname)) {
    return;
  }
  throw new Error(`Package URL must use HTTPS unless it is localhost: ${locator}`);
};

const readJsonFromLocator = async (locator, label) => {
  if (!isUrlLocator(locator)) {
    return readJsonWithText(locator);
  }

  validatePackageUrl(locator);
  const response = await fetch(locator, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${label} fetch failed with ${response.status}: ${text.slice(0, 500)}`);
  }
  try {
    return { value: JSON.parse(text), text };
  } catch (error) {
    throw new Error(`${label} did not contain valid JSON: ${error.message}`, { cause: error });
  }
};

const resolvePackageLocators = (args) => {
  if (args["package-url"]) {
    return {
      checks: args["checks-url"] || joinUrl(args["package-url"], DEFAULT_CHECKS_PATH),
      manifest: args["manifest-url"] || joinUrl(args["package-url"], DEFAULT_MANIFEST_FILE_NAME),
    };
  }

  return {
    checks: args["checks-url"] || args.checks || DEFAULT_CHECKS_PATH,
    manifest: args["manifest-url"] || args.manifest,
  };
};

const chunk = (items, size) => {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const sortObject = (value) => {
  if (Array.isArray(value)) {
    return value.map(sortObject);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortObject(child)]),
    );
  }
  return value;
};

const stableJson = (value) => JSON.stringify(sortObject(value));

const parseResponseBody = (text) => {
  if (text.length === 0) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const retryDelayMs = (attempt, retryAfter) => {
  if (retryAfter) {
    const parsed = Number.parseFloat(retryAfter);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed * 1000;
    }
  }
  return Math.min(250 * 2 ** attempt, 4000);
};

export const kentikKeys = (check) => (check.tags || []).filter((tag) => tag.startsWith(REQUIRED_KEY_PREFIX));
export const reconciliationKey = (check) => kentikKeys(check)[0] || check.name || "";

const sortedTags = (check) => [...(check.tags || [])].sort();

export const canonicalizeCheck = (check) => ({
  definition: check.definition,
  enabled: check.enabled !== false,
  name: check.name || "",
  note: check.note || "",
  priority: check.priority || "NOT_SET",
  tags: sortedTags(check),
});

export const fingerprintCheck = (check) =>
  createHash("sha256").update(stableJson(canonicalizeCheck(check))).digest("hex");

const changedFields = (planned, existing) =>
  Object.keys(canonicalizeCheck(planned)).filter((field) => {
    const plannedValue = canonicalizeCheck(planned)[field];
    const existingValue = canonicalizeCheck(existing)[field];
    return stableJson(plannedValue) !== stableJson(existingValue);
  });

const indexExistingChecks = (existingChecks) => {
  const byKey = new Map();
  const byName = new Map();

  for (const check of existingChecks) {
    for (const key of kentikKeys(check)) {
      byKey.set(key, check);
    }
    if (check.name) {
      byName.set(check.name, check);
    }
  }

  return { byKey, byName };
};

const summarizeCheck = (check) => ({
  fingerprint: fingerprintCheck(check),
  id: check.id,
  key: reconciliationKey(check),
  name: check.name || "",
});

export const reconcileChecks = (plannedChecks, existingChecks) => {
  const { byKey, byName } = indexExistingChecks(existingChecks);
  const plannedKeys = new Set();
  const plannedNames = new Set();
  const create = [];
  const unchanged = [];
  const changed = [];

  for (const planned of plannedChecks) {
    const key = reconciliationKey(planned);
    const existing = (key && byKey.get(key)) || (planned.name && byName.get(planned.name));

    if (key) {
      plannedKeys.add(key);
    }
    if (planned.name) {
      plannedNames.add(planned.name);
    }

    if (!existing) {
      create.push({ ...summarizeCheck(planned), check: planned });
      continue;
    }

    const plannedFingerprint = fingerprintCheck(planned);
    const existingFingerprint = fingerprintCheck(existing);
    if (plannedFingerprint === existingFingerprint) {
      unchanged.push({ existingId: existing.id, ...summarizeCheck(planned) });
      continue;
    }

    changed.push({
      existingId: existing.id,
      fields: changedFields(planned, existing),
      key,
      name: planned.name || existing.name || "",
      planned: { fingerprint: plannedFingerprint, check: planned },
      existing: { fingerprint: existingFingerprint, check: existing },
    });
  }

  const stale = existingChecks
    .filter((check) => kentikKeys(check).length > 0)
    .filter((check) => {
      const keys = kentikKeys(check);
      return keys.every((key) => !plannedKeys.has(key)) && (!check.name || !plannedNames.has(check.name));
    })
    .map(summarizeCheck);

  return { create, unchanged, changed, stale };
};

const makeClient = ({ baseUrl, user, password, maxRetries, timeoutMs }) => {
  const auth = Buffer.from(`${user}:${password}`).toString("base64");
  const root = baseUrl.replace(/\/+$/, "");

  return async (method, apiPath, options = {}) => {
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      let response;
      try {
        response = await fetch(`${root}/api${apiPath}`, {
          method,
          headers: {
            Authorization: `Basic ${auth}`,
            Accept: "application/json",
            "User-Agent": "forward-kentik-importer/0.1",
            ...(options.body ? { "Content-Type": "application/json" } : {}),
            ...options.headers,
          },
          body: options.body ? JSON.stringify(options.body) : undefined,
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        if (attempt < maxRetries) {
          await sleep(retryDelayMs(attempt));
          continue;
        }
        throw new Error(`${method} /api${apiPath} failed: ${error.message}`, { cause: error });
      }

      const text = await response.text();
      if (response.ok) {
        return response.status === 204 ? null : parseResponseBody(text);
      }

      if (TRANSIENT_STATUS_CODES.has(response.status) && attempt < maxRetries) {
        await sleep(retryDelayMs(attempt, response.headers.get("retry-after")));
        continue;
      }

      throw new Error(`${method} /api${apiPath} failed with ${response.status}: ${text.slice(0, 500)}`);
    }

    throw new Error(`${method} /api${apiPath} failed after retry budget was exhausted.`);
  };
};

export const locationSpecifiersForCheck = (check) => {
  const specifiers = {
    HostFilter: [],
    DeviceFilter: [],
    InterfaceFilter: [],
    SubnetLocationFilter: [],
  };
  for (const endpoint of [check.definition?.filters?.from, check.definition?.filters?.to]) {
    const location = endpoint?.location;
    if (!Object.hasOwn(specifiers, location?.type)) {
      continue;
    }
    if (typeof location.value === "string" && location.value.trim()) {
      specifiers[location.type].push(location.value.trim());
    }
    if (Array.isArray(location.values)) {
      specifiers[location.type].push(...location.values.filter((value) => typeof value === "string" && value.trim()));
    }
  }
  return Object.fromEntries(
    Object.entries(specifiers).map(([type, values]) => [type, [...new Set(values)].sort()]),
  );
};

export const hostSpecifiersForCheck = (check) => locationSpecifiersForCheck(check).HostFilter;

export const preflightLocations = async ({ api, networkId, checks }) => {
  const specifiers = { HostFilter: [], DeviceFilter: [], InterfaceFilter: [], SubnetLocationFilter: [] };
  for (const check of checks) {
    const checkSpecifiers = locationSpecifiersForCheck(check);
    for (const type of Object.keys(specifiers)) {
      specifiers[type].push(...checkSpecifiers[type]);
    }
  }
  for (const type of Object.keys(specifiers)) {
    specifiers[type] = [...new Set(specifiers[type])].sort();
  }

  const missing = {
    HostFilter: [],
    DeviceFilter: [],
    SubnetLocationFilter: [],
  };

  for (const specifier of specifiers.HostFilter) {
    const result = await api("GET", `/networks/${networkId}/hosts/${encodeURIComponent(specifier)}`);
    const hosts = Array.isArray(result?.hosts) ? result.hosts : [];
    if (hosts.length === 0) {
      missing.HostFilter.push(specifier);
    }
  }

  if (specifiers.DeviceFilter.length > 0) {
    const deviceResult = await api("GET", `/networks/${networkId}/devices`);
    const devices = Array.isArray(deviceResult) ? deviceResult : deviceResult?.devices || [];
    const deviceNames = new Set(
      devices.flatMap((device) => [device?.name, device?.displayName, device?.deviceName]).filter(Boolean),
    );
    missing.DeviceFilter.push(...specifiers.DeviceFilter.filter((specifier) => !deviceNames.has(specifier)));
  }

  return {
    checked: {
      HostFilter: specifiers.HostFilter.length,
      DeviceFilter: specifiers.DeviceFilter.length,
      SubnetLocationFilter: specifiers.SubnetLocationFilter.length,
    },
    unchecked: {
      InterfaceFilter: specifiers.InterfaceFilter,
    },
    missing,
  };
};

export const preflightHosts = async ({ api, networkId, checks }) => {
  const result = await preflightLocations({ api, networkId, checks });
  return { checked: result.checked.HostFilter, missing: result.missing.HostFilter };
};

const toPositiveInteger = (value, label) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
};

const toNonNegativeInteger = (value, label) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return parsed;
};

const requireString = (value) => typeof value === "string" && value.trim().length > 0;

const elapsedMs = (startedAt) => Date.now() - startedAt.getTime();

const missingLocationCount = (locationPreflight) =>
  (locationPreflight?.missing?.HostFilter?.length || 0) +
  (locationPreflight?.missing?.DeviceFilter?.length || 0) +
  (locationPreflight?.missing?.SubnetLocationFilter?.length || 0);

const escapeMetricLabel = (value) =>
  String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("\n", "\\n")
    .replaceAll('"', '\\"');

export const formatPrometheusMetrics = (report) => {
  const counts = report.counts || {};
  const lines = [
    "# HELP forward_kentik_import_planned_checks Planned Kentik-managed checks.",
    "# TYPE forward_kentik_import_planned_checks gauge",
    `forward_kentik_import_planned_checks ${report.plannedChecks || 0}`,
    "# HELP forward_kentik_import_create_checks Checks planned for creation.",
    "# TYPE forward_kentik_import_create_checks gauge",
    `forward_kentik_import_create_checks ${counts.create || 0}`,
    "# HELP forward_kentik_import_unchanged_checks Checks already matching the package.",
    "# TYPE forward_kentik_import_unchanged_checks gauge",
    `forward_kentik_import_unchanged_checks ${counts.unchanged || 0}`,
    "# HELP forward_kentik_import_changed_checks Existing managed checks with generated-field drift.",
    "# TYPE forward_kentik_import_changed_checks gauge",
    `forward_kentik_import_changed_checks ${counts.changed || 0}`,
    "# HELP forward_kentik_import_stale_checks Existing managed checks not present in current package.",
    "# TYPE forward_kentik_import_stale_checks gauge",
    `forward_kentik_import_stale_checks ${counts.stale || 0}`,
    "# HELP forward_kentik_import_missing_locations Host/device locations missing from Forward readiness checks.",
    "# TYPE forward_kentik_import_missing_locations gauge",
    `forward_kentik_import_missing_locations ${missingLocationCount(report.locationPreflight)}`,
    "# HELP forward_kentik_import_duration_seconds Importer runtime duration.",
    "# TYPE forward_kentik_import_duration_seconds gauge",
    `forward_kentik_import_duration_seconds ${((report.durationMs || 0) / 1000).toFixed(3)}`,
    "# HELP forward_kentik_import_mode_info Importer mode metadata.",
    "# TYPE forward_kentik_import_mode_info gauge",
    `forward_kentik_import_mode_info{mode="${escapeMetricLabel(report.mode)}",status="${escapeMetricLabel(report.status || "completed")}"} 1`,
  ];
  return `${lines.join("\n")}\n`;
};

export const buildStatusArtifact = (report) => {
  const missingLocations = missingLocationCount(report.locationPreflight);
  const warnings = [];
  if ((report.counts?.changed || 0) > 0) {
    warnings.push("changed-checks");
  }
  if ((report.counts?.stale || 0) > 0) {
    warnings.push("stale-checks");
  }
  if (missingLocations > 0) {
    warnings.push("missing-locations");
  }

  return {
    schemaVersion: "forward-kentik-ingest-status/v0.1",
    runId: report.runId,
    generatedAt: report.finishedAt,
    mode: report.mode,
    status: report.status || "completed",
    packageId: report.package?.packageId || null,
    checksSha256: report.package?.checksSha256 || null,
    networkId: report.networkId || null,
    snapshotId: report.snapshotId || null,
    plannedChecks: report.plannedChecks || 0,
    counts: report.counts || null,
    locationReadiness: report.locationPreflight
      ? {
          checked: report.locationPreflight.checked,
          missing: {
            HostFilter: report.locationPreflight.missing.HostFilter?.length || 0,
            DeviceFilter: report.locationPreflight.missing.DeviceFilter?.length || 0,
            SubnetLocationFilter: report.locationPreflight.missing.SubnetLocationFilter?.length || 0,
          },
          unchecked: {
            InterfaceFilter: report.locationPreflight.unchecked.InterfaceFilter.length,
          },
        }
      : null,
    warnings,
  };
};

export const verifyPackageSignature = ({ checksText, manifestText, publicKeyPem, signature }) =>
  cryptoVerify(
    null,
    Buffer.from(packageSignatureText({ checksText, manifestText }), "utf8"),
    publicKeyPem,
    signature,
  );

export const validateApproval = (approval, { changeWindowId, packageId, now = new Date() } = {}) => {
  const errors = [];
  if (!approval || typeof approval !== "object" || Array.isArray(approval)) {
    throw new Error("Approval artifact must be an object.");
  }
  if (approval.schemaVersion !== "forward-kentik-approval/v0.1") {
    errors.push("approval.schemaVersion must be forward-kentik-approval/v0.1.");
  }
  if (!requireString(approval.packageId)) {
    errors.push("approval.packageId is required.");
  } else if (packageId && approval.packageId !== packageId) {
    errors.push("approval.packageId does not match package.");
  }
  if (changeWindowId && approval.changeWindowId !== changeWindowId) {
    errors.push("approval.changeWindowId does not match --change-window-id.");
  }
  if (!requireString(approval.approvedBy)) {
    errors.push("approval.approvedBy is required.");
  }
  if (!requireString(approval.reason)) {
    errors.push("approval.reason is required.");
  }
  if (!requireString(approval.expiresAt)) {
    errors.push("approval.expiresAt is required.");
  } else {
    const expiresAtMs = Date.parse(approval.expiresAt);
    if (!Number.isFinite(expiresAtMs)) {
      errors.push("approval.expiresAt must be an ISO timestamp.");
    } else if (expiresAtMs <= now.getTime()) {
      errors.push("approval has expired.");
    }
  }

  for (const field of ["approvedChangedKeys", "approvedStaleKeys"]) {
    if (approval[field] !== undefined && !Array.isArray(approval[field])) {
      errors.push(`approval.${field} must be an array.`);
    }
    for (const key of approval[field] || []) {
      if (!String(key).startsWith(REQUIRED_KEY_PREFIX)) {
        errors.push(`approval.${field} contains a key without ${REQUIRED_KEY_PREFIX} prefix.`);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid approval artifact:\n${errors.map((error) => `- ${error}`).join("\n")}`);
  }
};

const assertApprovedKeysAreCurrent = ({ approvedKeys, currentKeys, label }) => {
  const unknown = [...approvedKeys].filter((key) => !currentKeys.has(key));
  if (unknown.length > 0) {
    throw new Error(`Approval includes ${unknown.length} ${label} key(s) not present in current dry-run: ${unknown.slice(0, 10).join(", ")}`);
  }
};

export const selectApprovedMutations = ({
  approval,
  applyUpdates,
  deactivateStale,
  maxDeactivations,
  maxUpdates,
  reconciliation,
}) => {
  const approvedChangedKeys = new Set(approval?.approvedChangedKeys || []);
  const approvedStaleKeys = new Set(approval?.approvedStaleKeys || []);
  const currentChangedKeys = new Set(reconciliation.changed.map((item) => item.key).filter(Boolean));
  const currentStaleKeys = new Set(reconciliation.stale.map((item) => item.key).filter(Boolean));
  assertApprovedKeysAreCurrent({ approvedKeys: approvedChangedKeys, currentKeys: currentChangedKeys, label: "changed" });
  assertApprovedKeysAreCurrent({ approvedKeys: approvedStaleKeys, currentKeys: currentStaleKeys, label: "stale" });

  const updates = applyUpdates ? reconciliation.changed.filter((item) => approvedChangedKeys.has(item.key)) : [];
  const deactivations = deactivateStale ? reconciliation.stale.filter((item) => approvedStaleKeys.has(item.key)) : [];
  if (updates.length > maxUpdates) {
    throw new Error(`Approved update count ${updates.length} exceeds --max-updates ${maxUpdates}.`);
  }
  if (deactivations.length > maxDeactivations) {
    throw new Error(`Approved stale deactivation count ${deactivations.length} exceeds --max-deactivations ${maxDeactivations}.`);
  }
  return { deactivations, updates };
};

const writeRunArtifacts = async ({ metricsPath, report, reportPath, statusArtifactPath }) => {
  if (reportPath) {
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  }
  if (metricsPath) {
    await writeFile(metricsPath, formatPrometheusMetrics(report));
  }
  if (statusArtifactPath) {
    await writeFile(statusArtifactPath, `${JSON.stringify(buildStatusArtifact(report), null, 2)}\n`);
  }
};

const requireObject = (value, label, errors) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${label} must be an object.`);
    return false;
  }
  return true;
};

export const validatePlannedChecks = (checks) => {
  if (!Array.isArray(checks)) {
    throw new Error("forward-intent-checks.json must contain a NewNetworkCheck[] JSON array.");
  }

  const errors = [];
  const keys = new Map();
  const names = new Map();

  checks.forEach((check, index) => {
    const prefix = `check[${index}]`;
    if (!check || typeof check !== "object" || Array.isArray(check)) {
      errors.push(`${prefix} must be an object.`);
      return;
    }

    if (!requireString(check.name)) {
      errors.push(`${prefix}.name is required.`);
    } else if (names.has(check.name)) {
      errors.push(`${prefix}.name duplicates check[${names.get(check.name)}].name.`);
    } else {
      names.set(check.name, index);
    }

    if (!check.definition || typeof check.definition !== "object") {
      errors.push(`${prefix}.definition is required.`);
    } else if (!ALLOWED_CHECK_TYPES.has(check.definition.checkType)) {
      errors.push(`${prefix}.definition.checkType must be one of ${[...ALLOWED_CHECK_TYPES].join(", ")}.`);
    }

    const keyTags = kentikKeys(check);
    if (keyTags.length !== 1) {
      errors.push(`${prefix}.tags must contain exactly one ${REQUIRED_KEY_PREFIX}* tag.`);
    } else if (keys.has(keyTags[0])) {
      errors.push(`${prefix} ${REQUIRED_KEY_PREFIX} tag duplicates check[${keys.get(keyTags[0])}].`);
    } else {
      keys.set(keyTags[0], index);
    }
  });

  if (errors.length > 0) {
    throw new Error(`Invalid Forward intent package:\n${errors.map((error) => `- ${error}`).join("\n")}`);
  }
};

const invalidManifestError = (errors) =>
  new Error(`Invalid Forward intent manifest:\n${errors.map((error) => `- ${error}`).join("\n")}`);

export const validateManifest = (
  manifest,
  plannedChecks,
  { checksText, maxPackageAgeMinutes = DEFAULT_MAX_PACKAGE_AGE_MINUTES } = {},
) => {
  const errors = [];
  if (!requireObject(manifest, "manifest", errors)) {
    throw invalidManifestError(errors);
  }

  if (manifest.schemaVersion !== PACKAGE_SCHEMA_VERSION) {
    errors.push(`manifest.schemaVersion must be ${PACKAGE_SCHEMA_VERSION}.`);
  }
  if (manifest.packageType !== PACKAGE_TYPE) {
    errors.push(`manifest.packageType must be ${PACKAGE_TYPE}.`);
  }
  if (!requireString(manifest.packageId)) {
    errors.push("manifest.packageId is required.");
  }
  if (!requireString(manifest.generatedAt)) {
    errors.push("manifest.generatedAt is required.");
  } else {
    const generatedAtMs = Date.parse(manifest.generatedAt);
    if (!Number.isFinite(generatedAtMs)) {
      errors.push("manifest.generatedAt must be an ISO timestamp.");
    } else {
      const maxAgeMs = maxPackageAgeMinutes * 60 * 1000;
      if (Date.now() - generatedAtMs > maxAgeMs) {
        errors.push(`manifest.generatedAt is older than ${maxPackageAgeMinutes} minutes.`);
      }
    }
  }

  if (requireObject(manifest.source, "manifest.source", errors)) {
    if (manifest.source.platform !== "kentik") {
      errors.push("manifest.source.platform must be kentik.");
    }
    if (manifest.source.writePolicy !== "kentik-never-writes-forward") {
      errors.push("manifest.source.writePolicy must be kentik-never-writes-forward.");
    }
  }

  if (requireObject(manifest.artifacts, "manifest.artifacts", errors)) {
    if (manifest.artifacts.intentChecks !== DEFAULT_CHECKS_PATH) {
      errors.push(`manifest.artifacts.intentChecks must be ${DEFAULT_CHECKS_PATH}.`);
    }
    if (manifest.artifacts.manifest !== DEFAULT_MANIFEST_FILE_NAME) {
      errors.push(`manifest.artifacts.manifest must be ${DEFAULT_MANIFEST_FILE_NAME}.`);
    }
  }

  if (requireObject(manifest.integrity, "manifest.integrity", errors)) {
    if (manifest.integrity.algorithm !== "sha256") {
      errors.push("manifest.integrity.algorithm must be sha256.");
    }
    if (!/^[a-f0-9]{64}$/.test(manifest.integrity.intentChecksSha256 || "")) {
      errors.push("manifest.integrity.intentChecksSha256 must be a SHA-256 hex digest.");
    } else if (checksText && manifest.integrity.intentChecksSha256 !== sha256Hex(checksText)) {
      errors.push("manifest.integrity.intentChecksSha256 does not match the checks artifact.");
    }
  }

  if (requireObject(manifest.intentChecks, "manifest.intentChecks", errors)) {
    if (manifest.intentChecks.count !== plannedChecks.length) {
      errors.push(
        `manifest.intentChecks.count ${manifest.intentChecks.count} does not match package count ${plannedChecks.length}.`,
      );
    }
    if (manifest.intentChecks.payloadShape !== "NewNetworkCheck[]") {
      errors.push("manifest.intentChecks.payloadShape must be NewNetworkCheck[].");
    }
    if (manifest.intentChecks.checkType !== "Existential") {
      errors.push("manifest.intentChecks.checkType must be Existential.");
    }
    if (manifest.intentChecks.bulkEndpoint !== "/api/snapshots/{snapshotId}/checks?bulk") {
      errors.push("manifest.intentChecks.bulkEndpoint must target /checks?bulk.");
    }
    if (manifest.intentChecks.dedupeRequiredBeforePost !== true) {
      errors.push("manifest.intentChecks.dedupeRequiredBeforePost must be true.");
    }
  }

  if (requireObject(manifest.reconciliation, "manifest.reconciliation", errors)) {
    if (manifest.reconciliation.requiredTagPrefix !== REQUIRED_KEY_PREFIX) {
      errors.push(`manifest.reconciliation.requiredTagPrefix must be ${REQUIRED_KEY_PREFIX}.`);
    }
    if (manifest.reconciliation.defaultApplyPolicy !== "create-missing-only") {
      errors.push("manifest.reconciliation.defaultApplyPolicy must be create-missing-only.");
    }
    if (manifest.reconciliation.changedChecks !== "report-only") {
      errors.push("manifest.reconciliation.changedChecks must be report-only.");
    }
    if (manifest.reconciliation.staleChecks !== "report-only") {
      errors.push("manifest.reconciliation.staleChecks must be report-only.");
    }
  }

  if (errors.length > 0) {
    throw invalidManifestError(errors);
  }
};

const main = async () => {
  const startedAt = new Date();
  const runId = randomUUID();
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage);
    return;
  }
  validateArgs(args);
  validatePolicyArgs(args);

  const apply = Boolean(args.apply);
  const applyUpdates = Boolean(args["apply-updates"]);
  const deactivateStale = Boolean(args["deactivate-stale"]);
  const batchSize = args["batch-size"] ? toPositiveInteger(args["batch-size"], "--batch-size") : DEFAULT_BATCH_SIZE;
  const maxDeactivations = args["max-deactivations"]
    ? toNonNegativeInteger(args["max-deactivations"], "--max-deactivations")
    : 0;
  const maxRetries = args["max-retries"]
    ? toNonNegativeInteger(args["max-retries"], "--max-retries")
    : DEFAULT_MAX_RETRIES;
  const maxUpdates = args["max-updates"] ? toNonNegativeInteger(args["max-updates"], "--max-updates") : 0;
  const maxPackageAgeMinutes = args["max-package-age-minutes"]
    ? toPositiveInteger(args["max-package-age-minutes"], "--max-package-age-minutes")
    : DEFAULT_MAX_PACKAGE_AGE_MINUTES;
  const timeoutMs = args["timeout-ms"] ? toPositiveInteger(args["timeout-ms"], "--timeout-ms") : DEFAULT_TIMEOUT_MS;

  const locators = resolvePackageLocators(args);
  const checksArtifact = await readJsonFromLocator(locators.checks, "Forward checks package");
  const plannedChecks = checksArtifact.value;
  validatePlannedChecks(plannedChecks);
  let manifest = null;
  let manifestText = null;
  if (locators.manifest) {
    const manifestArtifact = await readJsonFromLocator(locators.manifest, "Forward package manifest");
    manifest = manifestArtifact.value;
    manifestText = manifestArtifact.text;
    validateManifest(manifest, plannedChecks, { checksText: checksArtifact.text, maxPackageAgeMinutes });
  }

  if (args["require-signature"]) {
    if (!manifestText) {
      throw new Error("--require-signature requires a manifest.");
    }
    const publicKeyPem = await readText(args["public-key"]);
    const signature = await readFile(args.signature);
    if (!verifyPackageSignature({ checksText: checksArtifact.text, manifestText, publicKeyPem, signature })) {
      throw new Error("Package signature verification failed.");
    }
  }

  if (args["validate-only"]) {
    const finishedAt = new Date();
    const report = {
      runId,
      mode: "validate-only",
      status: "valid",
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: elapsedMs(startedAt),
      package: {
        checksSource: locators.checks,
        manifestSource: locators.manifest || null,
        packageId: manifest?.packageId || null,
        checksSha256: sha256Hex(checksArtifact.text),
      },
      plannedChecks: plannedChecks.length,
    };
    await writeRunArtifacts({
      metricsPath: args.metrics,
      report,
      reportPath: args.report,
      statusArtifactPath: args["status-artifact"],
    });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }

  const networkId = requiredEnv("FORWARD_NETWORK_ID");
  const api = makeClient({
    baseUrl: requiredEnv("FORWARD_BASE_URL"),
    user: requiredEnv("FORWARD_USER"),
    password: requiredEnv("FORWARD_PASSWORD"),
    maxRetries,
    timeoutMs,
  });

  const latestSnapshot = await api("GET", `/networks/${networkId}/snapshots/latestProcessed`);
  const snapshotId = latestSnapshot.id;
  const existingChecks = await api("GET", `/snapshots/${snapshotId}/checks?type=Existential`);
  const reconciliation = reconcileChecks(plannedChecks, existingChecks);
  const createChecks = reconciliation.create.map((item) => item.check);
  let locationPreflight = null;
  let approval = null;
  let approvedMutations = { deactivations: [], updates: [] };

  if (args["require-approval-file"]) {
    approval = (await readJsonWithText(args["require-approval-file"])).value;
    validateApproval(approval, { changeWindowId: args["change-window-id"], packageId: manifest?.packageId });
    approvedMutations = selectApprovedMutations({
      approval,
      applyUpdates,
      deactivateStale,
      maxDeactivations,
      maxUpdates,
      reconciliation,
    });
  }

  if (createChecks.length > 0 && !args["skip-host-preflight"] && !args["skip-location-preflight"]) {
    locationPreflight = await preflightLocations({ api, networkId, checks: createChecks });
    const missing = [
      ...locationPreflight.missing.HostFilter.map((specifier) => `HostFilter:${specifier}`),
      ...locationPreflight.missing.DeviceFilter.map((specifier) => `DeviceFilter:${specifier}`),
      ...locationPreflight.missing.SubnetLocationFilter.map((specifier) => `SubnetLocationFilter:${specifier}`),
    ];
    if (apply && missing.length > 0) {
      const preview = missing.slice(0, 20).join(", ");
      throw new Error(
        `Forward location preflight failed: ${missing.length} location value(s) do not resolve in network ${networkId}: ${preview}`,
      );
    }
  }

  if (apply) {
    for (const batch of chunk(createChecks, batchSize)) {
      await api("POST", `/snapshots/${snapshotId}/checks?bulk`, { body: batch });
    }
    if (approvedMutations.updates.length > 0) {
      for (const item of approvedMutations.updates) {
        await api("DELETE", `/snapshots/${snapshotId}/checks/${encodeURIComponent(item.existingId)}`);
      }
      for (const batch of chunk(approvedMutations.updates.map((item) => item.planned.check), batchSize)) {
        await api("POST", `/snapshots/${snapshotId}/checks?bulk`, { body: batch });
      }
    }
    for (const item of approvedMutations.deactivations) {
      await api("DELETE", `/snapshots/${snapshotId}/checks/${encodeURIComponent(item.id)}`);
    }
  }

  const finishedAt = new Date();
  const report = {
    runId,
    mode: apply ? "apply" : "dry-run",
    status: "completed",
    applyPolicy: "create-missing-only",
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: elapsedMs(startedAt),
    settings: { batchSize, maxDeactivations, maxRetries, maxUpdates, timeoutMs },
    package: {
      checksSource: locators.checks,
      manifestSource: locators.manifest || null,
      packageId: manifest?.packageId || null,
      checksSha256: sha256Hex(checksArtifact.text),
    },
    mutationPolicy: {
      applyUpdates,
      deactivateStale,
      approvalFile: args["require-approval-file"] || null,
      changeWindowId: args["change-window-id"] || null,
      requireSignature: Boolean(args["require-signature"]),
      approvedBy: approval?.approvedBy || null,
      approvedChangedKeys: approval?.approvedChangedKeys?.length || 0,
      approvedStaleKeys: approval?.approvedStaleKeys?.length || 0,
      appliedUpdates: apply ? approvedMutations.updates.length : 0,
      appliedDeactivations: apply ? approvedMutations.deactivations.length : 0,
    },
    networkId,
    snapshotId,
    plannedChecks: plannedChecks.length,
    existingKentikManagedChecks: existingChecks.filter((check) => kentikKeys(check).length > 0).length,
    counts: {
      create: reconciliation.create.length,
      unchanged: reconciliation.unchanged.length,
      changed: reconciliation.changed.length,
      stale: reconciliation.stale.length,
    },
    locationPreflight,
    hostPreflight: locationPreflight
      ? { checked: locationPreflight.checked.HostFilter, missing: locationPreflight.missing.HostFilter }
      : null,
    create: reconciliation.create.map((item) => {
      const summary = { ...item };
      delete summary.check;
      return summary;
    }),
    unchanged: reconciliation.unchanged,
    changed: reconciliation.changed.map(({ planned, existing, ...item }) => ({
      ...item,
      plannedFingerprint: planned.fingerprint,
      existingFingerprint: existing.fingerprint,
    })),
    stale: reconciliation.stale,
  };

  await writeRunArtifacts({
    metricsPath: args.metrics,
    report,
    reportPath: args.report,
    statusArtifactPath: args["status-artifact"],
  });

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

  if (args["fail-on-drift"] && (reconciliation.changed.length > 0 || reconciliation.stale.length > 0)) {
    process.exitCode = 2;
  }
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.stderr.write(usage);
    process.exit(1);
  });
}
