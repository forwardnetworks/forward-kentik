#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildForwardPackage, validateForwardPackage } from "../src/forward-package.mjs";
import { writeJsonFile } from "../src/io.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const importerPath = path.join(root, "scripts/forward-import-package.mjs");
const DEFAULT_FLOW_COUNT = 1001;

const readRequestBody = async (request) =>
  new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });

const jsonResponse = (response, statusCode, payload) => {
  response.writeHead(statusCode, { "Content-Type": "application/json" });
  response.end(JSON.stringify(payload));
};

const withResultFields = (check, index) => ({
  ...structuredClone(check),
  id: `scale-check-${index + 1}`,
  createdAt: "2026-07-04T00:00:00Z",
  executedAt: "2026-07-04T00:01:00Z",
  status: "PASS",
});

const startFakeForward = async (state) =>
  new Promise((resolve) => {
    const server = createServer(async (request, response) => {
      const url = new URL(request.url || "/", "http://127.0.0.1");

      if (request.method === "GET" && url.pathname === "/api/networks/scale-network/snapshots/latestProcessed") {
        jsonResponse(response, 200, { id: "snapshot-scale" });
        return;
      }

      if (request.method === "GET" && url.pathname.startsWith("/api/networks/scale-network/hosts/")) {
        const specifier = decodeURIComponent(url.pathname.split("/").at(-1));
        jsonResponse(response, 200, { hosts: [{ id: `host-${specifier}`, specifier }] });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/networks/scale-network/devices") {
        jsonResponse(response, 200, []);
        return;
      }

      if (
        request.method === "GET" &&
        url.pathname === "/api/snapshots/snapshot-scale/checks" &&
        url.searchParams.get("type") === "Existential"
      ) {
        jsonResponse(response, 200, state.existingChecks);
        return;
      }

      if (
        request.method === "POST" &&
        url.pathname === "/api/snapshots/snapshot-scale/checks" &&
        url.searchParams.has("bulk")
      ) {
        const checks = JSON.parse(await readRequestBody(request));
        state.batchSizes.push(checks.length);
        const offset = state.existingChecks.length;
        state.existingChecks.push(...checks.map((check, index) => withResultFields(check, offset + index)));
        jsonResponse(response, 200, { checks: checks.map((check, index) => withResultFields(check, offset + index)) });
        return;
      }

      jsonResponse(response, 404, { error: `${request.method} ${url.pathname}` });
    });

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({ server, port: address.port });
    });
  });

const runImporter = async (args, env = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [importerPath, ...args], {
      cwd: root,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
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
        reject(new Error(`importer failed ${code}:\n${stderr || stdout}`));
        return;
      }
      resolve(JSON.parse(stdout));
    });
  });

const syntheticFlows = (count) =>
  Array.from({ length: count }, (_, index) => ({
    sourceSystem: "kentik",
    sourceEvidenceId: `scale-${index}`,
    srcIp: `10.64.${Math.floor(index / 250)}.${(index % 250) + 1}`,
    srcSite: `branch-${index % 17}`,
    dstIp: `172.20.${Math.floor(index / 250)}.${(index % 250) + 1}`,
    dstSite: `dc-${index % 5}`,
    protocol: index % 3 === 0 ? "udp" : "tcp",
    dstPort: 1024 + (index % 4000),
    application: `scale-app-${index % 29}`,
    bytes: 10_000_000 + index,
    flowCount: 10 + (index % 100),
    confidence: "high",
  }));

const main = async () => {
  const flowCount = Number.parseInt(process.env.FORWARD_KENTIK_SCALE_COUNT || `${DEFAULT_FLOW_COUNT}`, 10);
  const outDir = await mkdtemp(path.join(os.tmpdir(), "forward-kentik-scale-"));
  const forwardPackage = buildForwardPackage(syntheticFlows(flowCount));
  const failures = validateForwardPackage(forwardPackage);
  assert.deepEqual(failures, []);

  const checksPath = path.join(outDir, "forward-intent-checks.json");
  const manifestPath = path.join(outDir, "forward-kentik-manifest.json");
  await writeJsonFile(checksPath, forwardPackage.checks);
  await writeJsonFile(manifestPath, forwardPackage.manifest);

  const validateOnly = await runImporter(["--checks", checksPath, "--manifest", manifestPath, "--validate-only"]);
  assert.equal(validateOnly.status, "valid");
  assert.equal(validateOnly.plannedChecks, flowCount);

  const state = { existingChecks: [], batchSizes: [] };
  const { server, port } = await startFakeForward(state);
  const env = {
    FORWARD_BASE_URL: `http://127.0.0.1:${port}`,
    FORWARD_USER: "user",
    FORWARD_PASSWORD: "password",
    FORWARD_NETWORK_ID: "scale-network",
  };

  try {
    const dryRun = await runImporter(["--checks", checksPath, "--manifest", manifestPath, "--batch-size", "400"], env);
    assert.equal(dryRun.mode, "dry-run");
    assert.equal(dryRun.counts.create, flowCount);
    assert.equal(dryRun.locationPreflight.missing.HostFilter.length, 0);

    const applied = await runImporter(
      ["--checks", checksPath, "--manifest", manifestPath, "--batch-size", "400", "--apply"],
      env,
    );
    assert.equal(applied.mode, "apply");
    assert.equal(state.existingChecks.length, flowCount);
    assert.deepEqual(state.batchSizes, [400, 400, 201]);

    const rerun = await runImporter(["--checks", checksPath, "--manifest", manifestPath, "--batch-size", "400"], env);
    assert.equal(rerun.counts.create, 0);
    assert.equal(rerun.counts.unchanged, flowCount);

    process.stdout.write(
      `${JSON.stringify(
        {
          status: "passed",
          flows: flowCount,
          checks: forwardPackage.checks.length,
          batches: state.batchSizes,
          outDir,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
