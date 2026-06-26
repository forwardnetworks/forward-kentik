#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildDashboardFile } from "./build-dashboard.mjs";
import { parseArgs } from "../src/io.mjs";

const usage = `
Serve Forward Kentik dashboard

Usage:
  node scripts/serve-dashboard.mjs --dist dist --port 4173

Required environment for dry-run/push buttons:
  FORWARD_BASE_URL
  FORWARD_USER
  FORWARD_PASSWORD
  FORWARD_NETWORK_ID
`;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage);
    return;
  }

  const dist = args.dist || "dist";
  const port = Number.parseInt(args.port || "4173", 10);
  await buildDashboardFile({ dist });

  const server = createServer(async (request, response) => {
    const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
    try {
      if (request.method === "POST" && url.pathname === "/api/forward-import") {
        const body = await readJsonBody(request);
        const report = await runImporter({ dist, apply: Boolean(body.apply) });
        json(response, 200, report);
        return;
      }

      if (request.method !== "GET") {
        json(response, 405, { error: "method not allowed" });
        return;
      }

      const filePath = resolveStaticPath(dist, url.pathname);
      const content = await readFile(filePath);
      response.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream" });
      response.end(content);
    } catch (error) {
      json(response, 500, { error: error.message });
    }
  });

  server.listen(port, "127.0.0.1", () => {
    process.stdout.write(`Forward Kentik dashboard: http://127.0.0.1:${port}/dashboard/\n`);
  });
};

const resolveStaticPath = (dist, urlPath) => {
  const cleanPath = decodeURIComponent(urlPath.replace(/^\/+/, ""));
  const relativePath = cleanPath === "" ? "dashboard/index.html" : cleanPath.endsWith("/") ? `${cleanPath}index.html` : cleanPath;
  const resolved = path.resolve(dist, relativePath);
  const root = path.resolve(dist);
  if (!resolved.startsWith(`${root}${path.sep}`) && resolved !== root) {
    throw new Error("invalid path");
  }
  return resolved;
};

const runImporter = ({ dist, apply }) =>
  new Promise((resolve, reject) => {
    const reportPath = path.join(dist, apply ? "forward-import-apply-report.json" : "forward-import-dry-run-report.json");
    const args = [
      "scripts/forward-import-package.mjs",
      "--checks",
      path.join(dist, "forward-intent-checks.json"),
      "--manifest",
      path.join(dist, "forward-kentik-manifest.json"),
      "--report",
      reportPath,
    ];
    if (apply) {
      args.push("--apply");
    }
    const child = spawn(process.execPath, args, {
      cwd: path.resolve(path.dirname(new URL(import.meta.url).pathname), ".."),
      env: process.env,
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
        reject(new Error(stderr || stdout || `forward import failed with ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(new Error(`forward import returned invalid JSON: ${error.message}`));
      }
    });
  });

const readJsonBody = (request) =>
  new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });

const json = (response, statusCode, payload) => {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
