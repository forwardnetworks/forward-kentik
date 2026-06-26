#!/usr/bin/env node

import { buildForwardDataConnectorConfig } from "../src/data-connector.mjs";
import { parseArgs, writeJsonFile } from "../src/io.mjs";

const usage = `
Forward Data Connector config generator

Usage:
  node scripts/forward-data-connector-config.mjs --package-url https://example.com/forward-kentik/latest --out dist/forward-data-connector.json

Options:
  --package-url url    Base URL that serves observed-flows.json and report artifacts.
  --name name          Data Connector name. Default: forward-kentik-observed-flows
  --collect            Enable collection in generated config. Default is false.
  --out path           Output path. Default: dist/forward-data-connector.json
`;

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage);
    return;
  }
  if (!args["package-url"]) {
    throw new Error("--package-url is required");
  }
  const config = buildForwardDataConnectorConfig({
    baseUrl: args["package-url"],
    name: args.name,
    collect: Boolean(args.collect),
  });
  const out = args.out || "dist/forward-data-connector.json";
  await writeJsonFile(out, config);
  process.stdout.write(`${JSON.stringify({ out, name: config.name, endpoints: config.endpoints.length }, null, 2)}\n`);
};

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
