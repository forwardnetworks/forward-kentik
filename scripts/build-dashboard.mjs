#!/usr/bin/env node

import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildDashboardHtml } from "../src/dashboard.mjs";
import { parseArgs, readJsonFile, writeJsonFile } from "../src/io.mjs";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const usage = `
Build Forward Kentik dashboard

Usage:
  node scripts/build-dashboard.mjs --dist dist --out dist/dashboard/index.html

Options:
  --dist path         Artifact directory. Default: dist
  --out path          Dashboard HTML output. Default: dist/dashboard/index.html
  --import-report path
                      Optional Forward import dry-run/apply report JSON.
`;

export const buildDashboardFile = async (options = {}) => {
  const dist = options.dist || "dist";
  const out = options.out || path.join(dist, "dashboard", "index.html");
  const importReportPath = options.importReport;
  const flows = await readJsonFile(path.join(dist, "observed-flows.json"));
  const checks = await readJsonFile(path.join(dist, "forward-intent-checks.json"));
  const manifest = await readJsonFile(path.join(dist, "forward-kentik-manifest.json"));
  const report = await readJsonFile(path.join(dist, "forward-kentik-report.json"));
  const importReport = importReportPath ? JSON.parse(await readFile(importReportPath, "utf8")) : null;
  const html = buildDashboardHtml({ flows, checks, manifest, report, importReport });
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, html, "utf8");
  await writeJsonFile(path.join(path.dirname(out), "dashboard-summary.json"), {
    generatedAt: new Date().toISOString(),
    dist,
    out,
    flows: flows.length,
    checks: checks.length,
    mappedChecks: report.locationMapping?.bothMapped || 0,
    importReport: importReportPath || null,
  });
  return { out, summary: path.join(path.dirname(out), "dashboard-summary.json") };
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage);
    return;
  }
  const result = await buildDashboardFile({
    dist: args.dist || "dist",
    out: args.out,
    importReport: args["import-report"],
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
