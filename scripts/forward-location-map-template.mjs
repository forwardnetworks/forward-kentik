#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { buildLocationMapTemplate } from "../src/forward-location-template.mjs";
import { parseArgs, readJsonFile, writeJsonFile } from "../src/io.mjs";

const usage = `
Build Forward location map template

Required environment:
  FORWARD_BASE_URL
  FORWARD_USER
  FORWARD_PASSWORD
  FORWARD_NETWORK_ID

Usage:
  node scripts/forward-location-map-template.mjs --flows dist/observed-flows.json --out dist/forward-location-map.template.json

Options:
  --flows path     Observed flows JSON. Default: dist/observed-flows.json
  --out path       Location map output. Default: dist/forward-location-map.template.json
`;

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage);
    return;
  }

  const flowsPath = args.flows || "dist/observed-flows.json";
  const out = args.out || "dist/forward-location-map.template.json";
  const flows = await readJsonFile(flowsPath);
  const devices = await forwardGet(`/networks/${requiredEnv("FORWARD_NETWORK_ID")}/devices`);
  const deviceList = Array.isArray(devices) ? devices : devices.devices || [];
  const map = buildLocationMapTemplate({ flows, devices: deviceList });
  await writeJsonFile(out, map);
  process.stdout.write(
    `${JSON.stringify(
      {
        flows: flows.length,
        devices: deviceList.length,
        sites: Object.keys(map.src).length,
        out,
      },
      null,
      2,
    )}\n`,
  );
};

const forwardGet = async (apiPath) => {
  const baseUrl = requiredEnv("FORWARD_BASE_URL").replace(/\/+$/, "");
  const auth = Buffer.from(`${requiredEnv("FORWARD_USER")}:${requiredEnv("FORWARD_PASSWORD")}`).toString("base64");
  const response = await fetch(`${baseUrl}/api${apiPath}`, {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`GET /api${apiPath} failed with ${response.status}: ${text.slice(0, 500)}`);
  }
  return JSON.parse(text);
};

const requiredEnv = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
