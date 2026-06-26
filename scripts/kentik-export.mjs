#!/usr/bin/env node

import path from "node:path";
import { buildForwardDataConnectorConfig } from "../src/data-connector.mjs";
import { buildForwardPackage, validateForwardPackage } from "../src/forward-package.mjs";
import { parseArgs, readJsonFile, writeJsonFile } from "../src/io.mjs";
import { applyLocationMap, locationMappingStats, validateLocationMap } from "../src/location-map.mjs";
import { normalizeKentikPayload } from "../src/normalize.mjs";

const usage = `
Forward Kentik export

Usage:
  node scripts/kentik-export.mjs
  node scripts/kentik-export.mjs --input fixtures/kentik-topxdata.demo.json --out dist

Options:
  --input path                  Kentik Query API response JSON.
  --out path                    Output directory. Default: dist
  --include-low-confidence      Include low-confidence rows when structurally eligible.
  --location-map path           Optional Kentik-to-Forward location mapping JSON.
  --package-url url             Optional: generate NQE Data Connector config for artifact visibility.
`;

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage);
    return;
  }

  const input = args.input || "fixtures/kentik-topxdata.demo.json";
  const out = args.out || "dist";
  const payload = await readJsonFile(input);
  let flows = normalizeKentikPayload(payload);
  let locationMap = null;
  if (args["location-map"]) {
    locationMap = await readJsonFile(args["location-map"]);
    validateLocationMap(locationMap);
    flows = applyLocationMap(flows, locationMap);
  }
  const forwardPackage = buildForwardPackage(flows, {
    includeLowConfidence: Boolean(args["include-low-confidence"]),
  });
  const failures = validateForwardPackage(forwardPackage);
  if (failures.length > 0) {
    throw new Error(`Generated package failed validation:\n${failures.join("\n")}`);
  }

  await writeJsonFile(path.join(out, "observed-flows.json"), flows);
  await writeJsonFile(path.join(out, "forward-intent-checks.json"), forwardPackage.checks);
  await writeJsonFile(path.join(out, "forward-kentik-manifest.json"), forwardPackage.manifest);
  await writeJsonFile(path.join(out, "forward-kentik-report.json"), forwardPackage.report);
  if (args["package-url"]) {
    await writeJsonFile(
      path.join(out, "forward-data-connector.json"),
      buildForwardDataConnectorConfig({ baseUrl: args["package-url"] }),
    );
  }

  process.stdout.write(
    JSON.stringify(
      {
        input,
        out,
        observedFlows: flows.length,
        generatedChecks: forwardPackage.checks.length,
        skipped: forwardPackage.report.skipped.length,
        locationMap: args["location-map"] || null,
        locationMapping: locationMappingStats(flows),
        optionalDataConnector: args["package-url"] ? path.join(out, "forward-data-connector.json") : null,
      },
      null,
      2,
    ),
  );
  process.stdout.write("\n");
};

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
