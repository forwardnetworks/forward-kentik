#!/usr/bin/env node

import { generateKeyPairSync } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "../src/io.mjs";

const usage = `
Generate an Ed25519 keypair for release checksum signing

Usage:
  node scripts/generate-release-signing-keypair.mjs --output-dir /secure/path/forward-kentik-release-signing
`;

export const generateReleaseSigningKeyPair = () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return {
    privateKeyPem: privateKey.export({ format: "pem", type: "pkcs8" }),
    publicKeyPem: publicKey.export({ format: "pem", type: "spki" }),
  };
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage);
    return;
  }
  const outputDir = args["output-dir"];
  if (!outputDir) {
    throw new Error("Missing --output-dir.");
  }

  const keys = generateReleaseSigningKeyPair();
  await mkdir(outputDir, { recursive: true, mode: 0o700 });
  const privateKeyPath = path.join(outputDir, "release-ed25519-private.pem");
  const publicKeyPath = path.join(outputDir, "release-ed25519-public.pem");
  await writeFile(privateKeyPath, keys.privateKeyPem, { encoding: "utf8", mode: 0o600 });
  await writeFile(publicKeyPath, keys.publicKeyPem, { encoding: "utf8", mode: 0o644 });
  process.stdout.write(`${JSON.stringify({ privateKey: privateKeyPath, publicKey: publicKeyPath }, null, 2)}\n`);
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
