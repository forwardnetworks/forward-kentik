#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const runExport = async (outDir) =>
  new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["scripts/kentik-export.mjs", "--input", "fixtures/kentik-topxdata.demo.json", "--out", outDir],
      {
        cwd: root,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`export failed ${code}:\n${stderr || stdout}`));
        return;
      }
      resolve(JSON.parse(stdout));
    });
  });

const readJson = async (filePath) => JSON.parse(await readFile(filePath, "utf8"));

const main = async () => {
  const outDir = await mkdtemp(path.join(os.tmpdir(), "forward-kentik-"));
  const summary = await runExport(outDir);
  assert.equal(summary.observedFlows, 4);
  assert.equal(summary.generatedChecks, 3);
  assert.equal(summary.skipped, 1);

  const checks = await readJson(path.join(outDir, "forward-intent-checks.json"));
  const manifest = await readJson(path.join(outDir, "forward-kentik-manifest.json"));
  const report = await readJson(path.join(outDir, "forward-kentik-report.json"));

  assert.equal(manifest.intentChecks.count, checks.length);
  assert.equal(report.skipped[0].reasons[0], "missing destination port");
  assert.ok(checks.every((check) => check.tags.some((tag) => tag.startsWith("kentik-key:"))));
  assert.ok(checks.some((check) => check.name.includes("checkout")));

  process.stdout.write(
    JSON.stringify(
      {
        outDir,
        observedFlows: summary.observedFlows,
        generatedChecks: checks.length,
        skipped: report.skipped.length,
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
