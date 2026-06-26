#!/usr/bin/env node

import { kentikConfigFromEnv, requireKentikAuth } from "../src/config.mjs";
import { KentikClient } from "../src/kentik-client.mjs";
import { parseArgs, readJsonFile, writeJsonFile } from "../src/io.mjs";
import { extractKentikRows } from "../src/normalize.mjs";

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

  const client = new KentikClient(config);
  const devices = await client.listDevices();
  const deviceNames = devices
    .map((device) => device.device_name || device.name)
    .filter(Boolean)
    .sort();
  const queryWithDevices = ensureDeviceNames(query, deviceNames);
  const response = await client.queryTopXData(queryWithDevices);
  if (args.out) {
    await writeJsonFile(args.out, response);
  }

  const rows = extractKentikRows(response);
  process.stdout.write(
    JSON.stringify(
      {
        apiUrl: config.apiUrl,
        query: queryPath,
        wrote: args.out || null,
        devices: deviceNames.length,
        injectedDeviceNames: queryWithDevices !== query,
        resultBuckets: Array.isArray(response?.results) ? response.results.length : 0,
        rows: rows.length,
        sampleKeys: rows[0] ? Object.keys(rows[0]).slice(0, 20) : [],
      },
      null,
      2,
    ),
  );
  process.stdout.write("\n");
};

const ensureDeviceNames = (query, deviceNames) => {
  const cloned = structuredClone(query);
  let changed = false;
  for (const item of cloned.queries || []) {
    if (!item.query) {
      continue;
    }
    if (!item.query.device_name || item.query.device_name.length === 0) {
      if (deviceNames.length === 0) {
        throw new Error("Kentik account returned no devices; cannot build a Query API request");
      }
      item.query.device_name = deviceNames.join(",");
      item.query.num_selected = deviceNames.length;
      item.query.all_selected = false;
      changed = true;
    }
  }
  return changed ? cloned : query;
};

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
