#!/usr/bin/env node

import { kentikPortalConfigFromEnv, requireKentikPortalAuth } from "../src/config.mjs";
import { buildSeededTopXData, sanitizeKentikDemoCatalog } from "../src/demo-seed.mjs";
import { KentikPortalClient } from "../src/kentik-portal-client.mjs";
import { parseArgs, writeJsonFile } from "../src/io.mjs";

const usage = `
Kentik demo seed

Reads Kentik portal dashboard and saved-view metadata, sanitizes it, and emits a
topXdata-like synthetic fixture for offline Forward package generation.

Usage:
  node scripts/seed-kentik-demo-data.mjs
  node scripts/seed-kentik-demo-data.mjs --catalog-out dist/kentik-demo-catalog.json --flows-out dist/kentik-topxdata.seeded-demo.json

Options:
  --catalog-out path   Sanitized dashboard catalog output. Default: dist/kentik-demo-catalog.json
  --flows-out path     Synthetic topXdata fixture output. Default: dist/kentik-topxdata.seeded-demo.json
  --count number       Number of seeded flow rows. Default: 8
`;

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage);
    return;
  }

  const config = await kentikPortalConfigFromEnv();
  requireKentikPortalAuth(config);

  const client = new KentikPortalClient(config);
  await client.login();
  const rawCatalog = await client.fetchDemoCatalog();
  const catalog = sanitizeKentikDemoCatalog(rawCatalog);
  const topXData = buildSeededTopXData(catalog, { count: args.count });

  const catalogOut = args["catalog-out"] || "dist/kentik-demo-catalog.json";
  const flowsOut = args["flows-out"] || "dist/kentik-topxdata.seeded-demo.json";
  await writeJsonFile(catalogOut, catalog);
  await writeJsonFile(flowsOut, topXData);

  process.stdout.write(
    JSON.stringify(
      {
        catalogOut,
        flowsOut,
        dashboards: catalog.dashboards.length,
        savedViews: catalog.savedViews.length,
        seededRows: topXData.results[0].data.length,
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
