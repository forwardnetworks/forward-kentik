import { createHash } from "node:crypto";
import { flowEligibility } from "./normalize.mjs";

const PROTOCOL_NUMBER = {
  icmp: "1",
  tcp: "6",
  udp: "17",
};

export const toIntegrationKey = (flow) =>
  [
    "kentik",
    slug(flow.application || "unknown-app"),
    slug(flow.srcSite || "unknown-src-site"),
    slug(flow.dstSite || "unknown-dst-site"),
    slug(flow.srcIp),
    slug(flow.dstIp),
    flow.protocol,
    flow.dstPort || "none",
  ]
    .filter(Boolean)
    .join(":");

export const toForwardIntentCheck = (flow) => {
  const eligibility = flowEligibility(flow);
  if (!eligibility.eligible) {
    throw new Error(`Flow is not eligible: ${eligibility.reasons.join(", ")}`);
  }

  const headers = [
    {
      type: "PacketFilter",
      values: {
        ip_proto: [PROTOCOL_NUMBER[flow.protocol]],
      },
    },
  ];

  if (flow.protocol === "tcp" || flow.protocol === "udp") {
    headers.push({
      type: "PacketFilter",
      values: {
        tp_dst: [String(flow.dstPort)],
      },
    });
  }

  const key = toIntegrationKey(flow);
  const label = flow.application || `${flow.protocol}/${flow.dstPort || "any"}`;
  const tags = [
    "kentik",
    "observed-flow",
    `kentik-key:${key}`,
    `protocol:${flow.protocol}`,
    hasMappedLocation(flow) ? "forward-location-mapped" : undefined,
    flow.dstPort ? `port:${flow.dstPort}` : undefined,
    flow.application ? `app:${slug(flow.application)}` : undefined,
    flow.srcSite ? `src-site:${slug(flow.srcSite)}` : undefined,
    flow.dstSite ? `dst-site:${slug(flow.dstSite)}` : undefined,
  ].filter(Boolean);

  const fromLocation = flow.forwardLocations?.from || {
    type: "HostFilter",
    value: flow.srcIp,
  };
  const toLocation = flow.forwardLocations?.to || {
    type: "HostFilter",
    value: flow.dstIp,
  };

  return {
    definition: {
      checkType: "Existential",
      filters: {
        from: {
          location: fromLocation,
          headers,
        },
        to: {
          location: toLocation,
        },
        flowTypes: ["VALID"],
      },
      headerFieldsWithDefaults: ["url"],
      noiseTypes: [],
      returnPath: "ANY",
    },
    enabled: true,
    name: `[Kentik] ${label}: ${flow.srcIp} -> ${flow.dstIp} ${flow.protocol}/${flow.dstPort || "any"}`,
    note: [
      "Generated from Kentik flow evidence",
      `integrationKey=${key}`,
      `sourceEvidenceId=${flow.sourceEvidenceId}`,
      flow.deviceName ? `device=${flow.deviceName}` : undefined,
      flow.bytes ? `bytes=${flow.bytes}` : undefined,
      flow.flowCount ? `flows=${flow.flowCount}` : undefined,
      flow.forwardLocationMapping?.from ? `forwardFrom=${flow.forwardLocationMapping.from}` : undefined,
      flow.forwardLocationMapping?.to ? `forwardTo=${flow.forwardLocationMapping.to}` : undefined,
      `confidence=${flow.confidence}`,
    ]
      .filter(Boolean)
      .join("; "),
    priority: toPriority(flow),
    tags,
  };
};

export const buildForwardPackage = (flows, options = {}) => {
  const checks = [];
  const skipped = [];

  for (const flow of flows) {
    const eligibility = flowEligibility(flow);
    if (!eligibility.eligible || (!options.includeLowConfidence && flow.confidence === "low")) {
      skipped.push({
        sourceEvidenceId: flow.sourceEvidenceId,
        srcIp: flow.srcIp,
        dstIp: flow.dstIp,
        reasons: eligibility.reasons.length > 0 ? eligibility.reasons : ["low confidence"],
      });
      continue;
    }
    checks.push(toForwardIntentCheck(flow));
  }

  const manifest = {
    schemaVersion: "forward-kentik/v0.1",
    packageType: "forward-intent-import",
    packageId: packageId(checks),
    generatedAt: new Date().toISOString(),
    source: {
      platform: "kentik",
      app: "forward-kentik",
      writePolicy: "kentik-never-writes-forward",
    },
    artifacts: {
      manifest: "forward-kentik-manifest.json",
      intentChecks: "forward-intent-checks.json",
      observedFlows: "observed-flows.json",
      report: "forward-kentik-report.json",
    },
    observedFlows: {
      count: flows.length,
      eligible: checks.length,
      skipped: skipped.length,
    },
    intentChecks: {
      count: checks.length,
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

  return {
    manifest,
    checks,
    report: {
      generatedAt: manifest.generatedAt,
      observedFlows: flows.length,
      generatedChecks: checks.length,
      locationMapping: locationMappingReport(flows),
      skipped,
      checkNames: checks.map((check) => check.name),
    },
  };
};

export const validateForwardPackage = ({ manifest, checks }) => {
  const failures = [];
  if (manifest?.schemaVersion !== "forward-kentik/v0.1") {
    failures.push("manifest schemaVersion must be forward-kentik/v0.1");
  }
  if (!Array.isArray(checks)) {
    failures.push("checks must be an array");
    return failures;
  }

  const names = new Set();
  const keys = new Set();
  for (const [index, check] of checks.entries()) {
    if (check.definition?.checkType !== "Existential") {
      failures.push(`check ${index} is not Existential`);
    }
    if (!check.name) {
      failures.push(`check ${index} is missing name`);
    }
    if (names.has(check.name)) {
      failures.push(`duplicate check name: ${check.name}`);
    }
    names.add(check.name);

    const keyTags = (check.tags || []).filter((tag) => tag.startsWith("kentik-key:"));
    if (keyTags.length !== 1) {
      failures.push(`check ${check.name || index} must have exactly one kentik-key tag`);
    } else if (keys.has(keyTags[0])) {
      failures.push(`duplicate kentik-key tag: ${keyTags[0]}`);
    }
    keys.add(keyTags[0]);
  }
  if (manifest?.intentChecks?.count !== checks.length) {
    failures.push("manifest intentChecks.count does not match checks length");
  }
  return failures;
};

const packageId = (checks) => {
  const digest = createHash("sha256")
    .update(JSON.stringify(checks.map((check) => check.tags).sort()))
    .digest("hex")
    .slice(0, 12);
  return `kentik-forward-${digest}`;
};

const toPriority = (flow) => {
  const bytes = flow.bytes || 0;
  if (bytes >= 1_000_000_000) {
    return "HIGH";
  }
  if (bytes >= 100_000_000) {
    return "MEDIUM";
  }
  return "LOW";
};

const hasMappedLocation = (flow) => Boolean(flow.forwardLocations?.from || flow.forwardLocations?.to);

const locationMappingReport = (flows) => ({
  fromMapped: flows.filter((flow) => flow.forwardLocations?.from).length,
  toMapped: flows.filter((flow) => flow.forwardLocations?.to).length,
  bothMapped: flows.filter((flow) => flow.forwardLocations?.from && flow.forwardLocations?.to).length,
});

const slug = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.:_-]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
