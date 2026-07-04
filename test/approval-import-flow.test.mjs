import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { sha256Hex } from "../src/forward-package.mjs";
import { writeJsonFile } from "../src/io.mjs";
import { generateReleaseSigningKeyPair } from "../scripts/generate-release-signing-keypair.mjs";
import { signText } from "../scripts/sign-release-checksums.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const importerPath = path.join(root, "scripts/forward-import-package.mjs");

const makeCheck = (name, key, port = "443") => ({
  definition: {
    checkType: "Existential",
    filters: {
      from: {
        location: { type: "HostFilter", value: "10.0.0.1" },
        headers: [
          { type: "PacketFilter", values: { ip_proto: ["6"] } },
          { type: "PacketFilter", values: { tp_dst: [port] } },
        ],
      },
      to: {
        location: { type: "HostFilter", value: "192.0.2.10" },
      },
      flowTypes: ["VALID"],
    },
  },
  enabled: true,
  name,
  priority: "LOW",
  tags: ["kentik", `kentik-key:${key}`],
});

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

const startFakeForward = async (state) =>
  new Promise((resolve) => {
    const server = createServer(async (request, response) => {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      state.calls.push(`${request.method} ${url.pathname}${url.search}`);

      if (request.method === "GET" && url.pathname === "/api/networks/demo/snapshots/latestProcessed") {
        jsonResponse(response, 200, { id: "snapshot-demo" });
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
      if (request.method === "DELETE" && url.pathname.startsWith("/api/snapshots/snapshot-demo/checks/")) {
        const id = decodeURIComponent(url.pathname.split("/").at(-1));
        state.deleted.push(id);
        state.existingChecks = state.existingChecks.filter((check) => check.id !== id);
        jsonResponse(response, 204, null);
        return;
      }
      if (
        request.method === "POST" &&
        url.pathname === "/api/snapshots/snapshot-demo/checks" &&
        url.searchParams.has("bulk")
      ) {
        const checks = JSON.parse(await readRequestBody(request));
        state.created.push(...checks);
        state.existingChecks.push(...checks.map((check, index) => ({ id: `new-${index}`, ...check })));
        jsonResponse(response, 200, { checks });
        return;
      }
      jsonResponse(response, 404, { error: `${request.method} ${url.pathname}` });
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
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

test("applies approved changed and stale mutations only after signature and approval gates", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "forward-kentik-approval-flow-"));
  const planned = [makeCheck("one", "one"), makeCheck("two", "two")];
  const checksPath = path.join(directory, "forward-intent-checks.json");
  const manifestPath = path.join(directory, "forward-kentik-manifest.json");
  const approvalPath = path.join(directory, "approval.json");
  const signaturePath = path.join(directory, "forward-kentik-package.sig");
  const publicKeyPath = path.join(directory, "package-public.pem");

  await writeJsonFile(checksPath, planned);
  await writeJsonFile(manifestPath, {
    schemaVersion: "forward-kentik/v0.1",
    packageType: "forward-intent-import",
    packageId: "kentik-forward-approval-test",
    generatedAt: new Date().toISOString(),
    source: {
      platform: "kentik",
      app: "forward-kentik",
      writePolicy: "kentik-never-writes-forward",
    },
    artifacts: {
      manifest: "forward-kentik-manifest.json",
      intentChecks: "forward-intent-checks.json",
    },
    integrity: {
      algorithm: "sha256",
      intentChecksSha256: sha256Hex(await readFile(checksPath, "utf8")),
    },
    intentChecks: {
      count: 2,
      checkType: "Existential",
      payloadShape: "NewNetworkCheck[]",
      bulkEndpoint: "/api/snapshots/{snapshotId}/checks?bulk",
      dedupeRequiredBeforePost: true,
    },
    reconciliation: {
      requiredTagPrefix: "kentik-key:",
      defaultApplyPolicy: "create-missing-only",
      changedChecks: "report-only",
      staleChecks: "report-only",
    },
  });
  await writeJsonFile(approvalPath, {
    schemaVersion: "forward-kentik-approval/v0.1",
    packageId: "kentik-forward-approval-test",
    changeWindowId: "CHG-1",
    expiresAt: "2999-01-01T00:00:00.000Z",
    approvedBy: "operator@example.com",
    reason: "test",
    approvedChangedKeys: ["kentik-key:two"],
    approvedStaleKeys: ["kentik-key:stale"],
  });

  const keys = generateReleaseSigningKeyPair();
  await writeFile(publicKeyPath, keys.publicKeyPem, "utf8");
  const signature = signText({
    privateKeyPem: keys.privateKeyPem,
    text: `${await readFile(manifestPath, "utf8")}\n${await readFile(checksPath, "utf8")}`,
  });
  await writeFile(signaturePath, signature);

  const state = {
    calls: [],
    created: [],
    deleted: [],
    existingChecks: [
      { id: "existing-one", ...makeCheck("one", "one") },
      { id: "existing-two", ...makeCheck("two", "two", "8443") },
      { id: "stale-id", ...makeCheck("stale", "stale") },
    ],
  };
  const { server, port } = await startFakeForward(state);
  try {
    const report = await runImporter(
      [
        "--checks",
        checksPath,
        "--manifest",
        manifestPath,
        "--signature",
        signaturePath,
        "--public-key",
        publicKeyPath,
        "--require-signature",
        "--require-approval-file",
        approvalPath,
        "--change-window-id",
        "CHG-1",
        "--apply",
        "--apply-updates",
        "--deactivate-stale",
        "--max-updates",
        "1",
        "--max-deactivations",
        "1",
      ],
      {
        FORWARD_BASE_URL: `http://127.0.0.1:${port}`,
        FORWARD_USER: "user",
        FORWARD_PASSWORD: "password",
        FORWARD_NETWORK_ID: "demo",
      },
    );
    assert.equal(report.mutationPolicy.appliedUpdates, 1);
    assert.equal(report.mutationPolicy.appliedDeactivations, 1);
    assert.deepEqual(state.deleted.sort(), ["existing-two", "stale-id"]);
    assert.equal(state.created.length, 1);
    assert.equal(state.created[0].name, "two");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
