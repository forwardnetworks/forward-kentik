#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const importerPath = path.join(root, "scripts/forward-import-package.mjs");

const readJson = async (filePath) => JSON.parse(await readFile(filePath, "utf8"));

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
  id: `demo-check-${index + 1}`,
  createdAt: "2026-06-26T00:00:00Z",
  definedAt: "2026-06-26T00:00:00Z",
  executedAt: "2026-06-26T00:01:00Z",
  status: "PASS",
});

const startFakeForward = async (state) =>
  new Promise((resolve) => {
    const server = createServer(async (request, response) => {
      const url = new URL(request.url || "/", "http://127.0.0.1");

      if (request.method === "GET" && url.pathname === "/api/networks/demo-network/snapshots/latestProcessed") {
        jsonResponse(response, 200, { id: "snapshot-demo" });
        return;
      }

      if (request.method === "GET" && url.pathname.startsWith("/api/networks/demo-network/hosts/")) {
        const specifier = decodeURIComponent(url.pathname.split("/").at(-1));
        jsonResponse(response, 200, { hosts: [{ id: `host-${specifier}`, specifier }] });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/networks/demo-network/devices") {
        jsonResponse(response, 200, state.devices || []);
        return;
      }

      if (
        request.method === "GET" &&
        url.pathname === "/api/snapshots/snapshot-demo/checks" &&
        url.searchParams.get("type") === "Existential"
      ) {
        jsonResponse(response, 200, state.existingChecks);
        return;
      }

      if (
        request.method === "POST" &&
        url.pathname === "/api/snapshots/snapshot-demo/checks" &&
        url.searchParams.has("bulk")
      ) {
        const checks = JSON.parse(await readRequestBody(request));
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

const runImporter = async (args, env) =>
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

const main = async () => {
  const checks = await readJson("dist/forward-intent-checks.json");
  const firstExisting = withResultFields(checks[0], 0);
  const state = { existingChecks: [firstExisting], devices: [] };
  const { server, port } = await startFakeForward(state);
  const reportPath = path.join(await mkdtemp(path.join(os.tmpdir(), "forward-kentik-import-")), "report.json");

  try {
    const dryRun = await runImporter(
      [
        "--checks",
        "dist/forward-intent-checks.json",
        "--manifest",
        "dist/forward-kentik-manifest.json",
        "--report",
        reportPath,
      ],
      {
        FORWARD_BASE_URL: `http://127.0.0.1:${port}`,
        FORWARD_USER: "user",
        FORWARD_PASSWORD: "password",
        FORWARD_NETWORK_ID: "demo-network",
      },
    );
    assert.equal(dryRun.mode, "dry-run");
    assert.equal(dryRun.counts.unchanged, 1);
    assert.equal(dryRun.counts.create, checks.length - 1);
    assert.equal(state.existingChecks.length, 1);

    const applied = await runImporter(
      [
        "--checks",
        "dist/forward-intent-checks.json",
        "--manifest",
        "dist/forward-kentik-manifest.json",
        "--apply",
      ],
      {
        FORWARD_BASE_URL: `http://127.0.0.1:${port}`,
        FORWARD_USER: "user",
        FORWARD_PASSWORD: "password",
        FORWARD_NETWORK_ID: "demo-network",
      },
    );
    assert.equal(applied.mode, "apply");
    assert.equal(state.existingChecks.length, checks.length);

    process.stdout.write(
      `${JSON.stringify(
        {
          dryRunCreate: dryRun.counts.create,
          dryRunUnchanged: dryRun.counts.unchanged,
          appliedChecks: state.existingChecks.length,
          reportPath,
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
