#!/usr/bin/env node

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { parseArgs } from "../src/io.mjs";

const usage = `
Forward Kentik package server

Usage:
  node scripts/serve-package.mjs --dir dist --port 8088

Serves generated JSON artifacts for local review or for a reachable Forward Data
Connector lab. Do not expose customer-sensitive artifacts without access control.
`;

const CONTENT_TYPES = {
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage);
    return;
  }
  const root = path.resolve(args.dir || "dist");
  const port = Number.parseInt(args.port || "8088", 10);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("--port must be a positive integer");
  }

  const server = createServer(async (request, response) => {
    const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
    const requestedPath = url.pathname === "/" ? "/forward-kentik-manifest.json" : url.pathname;
    const absolutePath = path.resolve(root, `.${requestedPath}`);
    if (!absolutePath.startsWith(`${root}${path.sep}`) && absolutePath !== root) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }
    try {
      const details = await stat(absolutePath);
      if (!details.isFile()) {
        response.writeHead(404);
        response.end("Not found");
        return;
      }
      response.writeHead(200, {
        "Content-Type": CONTENT_TYPES[path.extname(absolutePath)] || "application/octet-stream",
        "Content-Length": details.size,
      });
      createReadStream(absolutePath).pipe(response);
    } catch {
      response.writeHead(404);
      response.end("Not found");
    }
  });

  server.listen(port, "127.0.0.1", () => {
    const address = server.address();
    process.stdout.write(`Serving ${root} at http://127.0.0.1:${address.port}/\n`);
  });
};

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
