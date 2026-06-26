import assert from "node:assert/strict";
import { readFile, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildDashboardFile } from "../scripts/build-dashboard.mjs";
import { createDashboardServer, resolveStaticPath } from "../scripts/serve-dashboard.mjs";
import { buildForwardPackage } from "../src/forward-package.mjs";
import { normalizeKentikPayload } from "../src/normalize.mjs";
import { writeJsonFile } from "../src/io.mjs";

const makeDist = async () => {
  const dist = await mkdtemp(path.join(os.tmpdir(), "forward-kentik-dashboard-"));
  const payload = JSON.parse(await readFile("fixtures/kentik-topxdata.demo.json", "utf8"));
  const flows = normalizeKentikPayload(payload);
  const forwardPackage = buildForwardPackage(flows);
  await writeJsonFile(path.join(dist, "observed-flows.json"), flows);
  await writeJsonFile(path.join(dist, "forward-intent-checks.json"), forwardPackage.checks);
  await writeJsonFile(path.join(dist, "forward-kentik-manifest.json"), forwardPackage.manifest);
  await writeJsonFile(path.join(dist, "forward-kentik-report.json"), forwardPackage.report);
  await buildDashboardFile({ dist });
  return dist;
};

const listen = (server) =>
  new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve(server.address().port);
    });
  });

const close = (server) => new Promise((resolve) => server.close(resolve));

test("serves dashboard static assets", async () => {
  const dist = await makeDist();
  const server = createDashboardServer({ dist });
  const port = await listen(server);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/dashboard/`);
    const text = await response.text();
    assert.equal(response.status, 200);
    assert.match(text, /Kentik Intent Candidate Correlation/);
    assert.match(text, /kentik-logo/);
  } finally {
    await close(server);
  }
});

test("serves dashboard HEAD requests", async () => {
  const dist = await makeDist();
  const server = createDashboardServer({ dist });
  const port = await listen(server);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/dashboard/`, { method: "HEAD" });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") || "", /text\/html/);
  } finally {
    await close(server);
  }
});

test("serves forward import action endpoint", async () => {
  const dist = await makeDist();
  const server = createDashboardServer({
    dist,
    importer: async ({ apply }) => ({ mode: apply ? "apply" : "dry-run", counts: { create: 0 } }),
  });
  const port = await listen(server);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/forward-import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apply: true }),
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.mode, "apply");
  } finally {
    await close(server);
  }
});

test("guards dashboard static path traversal", () => {
  assert.throws(() => resolveStaticPath("dist", "/../package.json"));
});
