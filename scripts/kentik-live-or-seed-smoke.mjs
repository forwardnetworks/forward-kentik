#!/usr/bin/env node

import {
  kentikConfigFromEnv,
  kentikPortalConfigFromEnv,
  requireKentikAuth,
  requireKentikPortalAuth,
} from "../src/config.mjs";
import { KentikClient } from "../src/kentik-client.mjs";
import { KentikPortalClient } from "../src/kentik-portal-client.mjs";
import { runKentikLiveOrSeedSmoke } from "../src/kentik-smoke.mjs";
import { parseArgs, readJsonFile, writeJsonFile } from "../src/io.mjs";

const usage = `
Kentik live-or-seed smoke

Tries Kentik Query API first. If the account has no queryable devices, falls
back to a sanitized portal-dashboard seed fixture.

Required auth:
  KENTIK_EMAIL and KENTIK_TOKEN for live Query API.
  KENTIK_PORTAL_PASSWORD when portal-seed fallback is needed.

Usage:
  node scripts/kentik-live-or-seed-smoke.mjs --query docs/examples/top-flows-query.json --out dist/live-topxdata.json

Options:
  --query path        Kentik Query Data request JSON.
  --out path          Output path for Query API or seeded topXdata JSON. Default: dist/live-topxdata.json
  --catalog-out path  Sanitized portal catalog output. Default: dist/live-kentik-demo-catalog.json
  --count number      Number of portal-seeded rows. Default: 8
`;

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage);
    return;
  }

  const queryPath = args.query || "docs/examples/top-flows-query.json";
  const out = args.out || "dist/live-topxdata.json";
  const catalogOut = args["catalog-out"] || "dist/live-kentik-demo-catalog.json";
  const query = await readJsonFile(queryPath);
  const count = args.count === undefined ? 8 : toPositiveInteger(args.count, "--count");

  const config = await kentikConfigFromEnv();
  requireKentikAuth(config);

  const summary = await runKentikLiveOrSeedSmoke({
    client: new KentikClient(config),
    query,
    queryPath,
    out,
    catalogOut,
    count,
    writeJson: writeJsonFile,
    portalClientFactory: async () => {
      const portalConfig = await kentikPortalConfigFromEnv();
      requireKentikPortalAuth(portalConfig);
      return new KentikPortalClient(portalConfig);
    },
  });

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
};

const toPositiveInteger = (value, label) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
};

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
