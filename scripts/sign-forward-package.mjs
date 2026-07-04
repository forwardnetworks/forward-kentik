#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseArgs } from "../src/io.mjs";
import { signText, verifyTextSignature } from "./sign-release-checksums.mjs";

const usage = `
Sign or verify a Forward Integration for Kentik intent package

Usage:
  node scripts/sign-forward-package.mjs --checks dist/forward-intent-checks.json --manifest dist/forward-kentik-manifest.json --private-key package-private.pem
  node scripts/sign-forward-package.mjs --verify --checks dist/forward-intent-checks.json --manifest dist/forward-kentik-manifest.json --public-key package-public.pem --signature dist/forward-kentik-package.sig

Options:
  --checks path       Checks JSON. Default: dist/forward-intent-checks.json
  --manifest path     Manifest JSON. Default: dist/forward-kentik-manifest.json
  --private-key path  PEM private key for signing. Defaults to PACKAGE_SIGNING_PRIVATE_KEY_PEM env content.
  --public-key path   PEM public key for verification.
  --signature path    Signature path. Default: dist/forward-kentik-package.sig
  --verify            Verify instead of signing.
`;

export const packageSignatureMaterial = ({ checksText, manifestText }) => `${manifestText}\n${checksText}`;

const readPrivateKey = async (args) => {
  if (args["private-key"]) {
    return readFile(args["private-key"], "utf8");
  }
  if (process.env.PACKAGE_SIGNING_PRIVATE_KEY_PEM) {
    return process.env.PACKAGE_SIGNING_PRIVATE_KEY_PEM;
  }
  throw new Error("Missing --private-key or PACKAGE_SIGNING_PRIVATE_KEY_PEM.");
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage);
    return;
  }

  const checksPath = args.checks || "dist/forward-intent-checks.json";
  const manifestPath = args.manifest || "dist/forward-kentik-manifest.json";
  const signaturePath = args.signature || "dist/forward-kentik-package.sig";
  const checksText = await readFile(checksPath, "utf8");
  const manifestText = await readFile(manifestPath, "utf8");
  const text = packageSignatureMaterial({ checksText, manifestText });

  if (args.verify) {
    if (!args["public-key"]) {
      throw new Error("Missing --public-key for verification.");
    }
    const publicKeyPem = await readFile(args["public-key"], "utf8");
    const signature = await readFile(signaturePath);
    if (!verifyTextSignature({ publicKeyPem, signature, text })) {
      throw new Error("Package signature verification failed.");
    }
    process.stdout.write(`${JSON.stringify({ status: "verified", checks: checksPath, manifest: manifestPath, signature: signaturePath }, null, 2)}\n`);
    return;
  }

  const privateKeyPem = await readPrivateKey(args);
  await writeFile(signaturePath, signText({ privateKeyPem, text }));
  process.stdout.write(`${JSON.stringify({ status: "signed", checks: checksPath, manifest: manifestPath, signature: signaturePath }, null, 2)}\n`);
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
