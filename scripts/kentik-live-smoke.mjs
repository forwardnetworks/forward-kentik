#!/usr/bin/env node

import { kentikConfigFromEnv, requireKentikAuth } from "../src/config.mjs";
import { KentikClient } from "../src/kentik-client.mjs";
import { runKentikQuerySmoke } from "../src/kentik-smoke.mjs";
import { parseArgs, readJsonFile, writeJsonFile } from "../src/io.mjs";

const usage = `
Kentik live smoke

Required auth:
  KENTIK_TOKEN_FILE, KENTIK_TOKEN, and optionally KENTIK_EMAIL.
  The token file may contain token, email, and password lines. Password is ignored.

Usage:
  node scripts/kentik-live-smoke.mjs --query docs/examples/top-flows-query.json --out fixtures/live-topxdata.json

Options:
  --query path     Kentik Query Data request JSON.
  --out path       Optional output path for raw Kentik response.
`;

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage);
    return;
  }

  const queryPath = args.query || "docs/examples/top-flows-query.json";
  const query = await readJsonFile(queryPath);
  const config = await kentikConfigFromEnv();
  requireKentikAuth(config);

  const summary = await runKentikQuerySmoke({
    client: new KentikClient(config),
    query,
    queryPath,
    out: args.out,
    writeJson: writeJsonFile,
  });
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
};

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
