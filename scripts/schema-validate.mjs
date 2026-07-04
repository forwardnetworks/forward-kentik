#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { parseArgs } from "../src/io.mjs";

const usage = `
Validate Forward Integration for Kentik JSON artifacts against committed schemas

Usage:
  node scripts/schema-validate.mjs --checks dist/forward-intent-checks.json --manifest dist/forward-kentik-manifest.json

Options:
  --checks path      Forward NewNetworkCheck[] JSON. Default: dist/forward-intent-checks.json
  --manifest path    Forward Integration for Kentik manifest JSON. Default: dist/forward-kentik-manifest.json
`;

const readJsonWithText = async (filePath) => {
  const text = await readFile(filePath, "utf8");
  return { value: JSON.parse(text), text };
};

const sha256Hex = (text) => createHash("sha256").update(text, "utf8").digest("hex");

const loadSchema = async (filePath) => JSON.parse(await readFile(filePath, "utf8"));

const formatErrors = (errors = []) =>
  errors.map((error) => `${error.instancePath || "/"} ${error.message}`).join("\n");

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage);
    return;
  }

  const checksPath = args.checks || "dist/forward-intent-checks.json";
  const manifestPath = args.manifest || "dist/forward-kentik-manifest.json";

  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const validateManifest = ajv.compile(await loadSchema("schemas/forward-package-manifest.schema.json"));
  const validateChecks = ajv.compile(await loadSchema("schemas/forward-intent-checks.schema.json"));

  const checks = await readJsonWithText(checksPath);
  const manifest = await readJsonWithText(manifestPath);

  const failures = [];
  if (!validateChecks(checks.value)) {
    failures.push(`Invalid ${checksPath}:\n${formatErrors(validateChecks.errors)}`);
  }
  if (!validateManifest(manifest.value)) {
    failures.push(`Invalid ${manifestPath}:\n${formatErrors(validateManifest.errors)}`);
  }
  if (manifest.value.intentChecks?.count !== checks.value.length) {
    failures.push("manifest intentChecks.count does not match checks length");
  }
  if (manifest.value.integrity?.intentChecksSha256 !== sha256Hex(checks.text)) {
    failures.push("manifest integrity.intentChecksSha256 does not match checks file bytes");
  }

  if (failures.length > 0) {
    throw new Error(failures.join("\n"));
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        status: "valid",
        checks: checksPath,
        manifest: manifestPath,
        count: checks.value.length,
        checksSha256: sha256Hex(checks.text),
      },
      null,
      2,
    )}\n`,
  );
};

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
