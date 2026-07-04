#!/usr/bin/env node

import { createPrivateKey, createPublicKey, sign as cryptoSign, verify as cryptoVerify } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseArgs } from "../src/io.mjs";

const usage = `
Sign or verify release SHA256SUMS with Ed25519

Usage:
  node scripts/sign-release-checksums.mjs --checksums dist/release/SHA256SUMS --private-key release-ed25519-private.pem
  node scripts/sign-release-checksums.mjs --verify --checksums dist/release/SHA256SUMS --public-key release-ed25519-public.pem --signature dist/release/SHA256SUMS.sig

Options:
  --checksums path     SHA256SUMS path. Default: dist/release/SHA256SUMS
  --private-key path   PEM private key for signing. Defaults to RELEASE_SIGNING_PRIVATE_KEY_PEM env content.
  --public-key-out path
                       Optional path to write public key derived from the private key.
  --public-key path    PEM public key for verification.
  --signature path     Signature path. Default: <checksums>.sig
  --verify             Verify instead of signing.
`;

export const signText = ({ privateKeyPem, text }) => cryptoSign(null, Buffer.from(text, "utf8"), privateKeyPem);

export const verifyTextSignature = ({ publicKeyPem, signature, text }) =>
  cryptoVerify(null, Buffer.from(text, "utf8"), publicKeyPem, signature);

const readPrivateKey = async (args) => {
  if (args["private-key"]) {
    return readFile(args["private-key"], "utf8");
  }
  if (process.env.RELEASE_SIGNING_PRIVATE_KEY_PEM) {
    return process.env.RELEASE_SIGNING_PRIVATE_KEY_PEM;
  }
  throw new Error("Missing --private-key or RELEASE_SIGNING_PRIVATE_KEY_PEM.");
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage);
    return;
  }

  const checksumsPath = args.checksums || "dist/release/SHA256SUMS";
  const signaturePath = args.signature || `${checksumsPath}.sig`;
  const checksumsText = await readFile(checksumsPath, "utf8");

  if (args.verify) {
    if (!args["public-key"]) {
      throw new Error("Missing --public-key for verification.");
    }
    const publicKeyPem = await readFile(args["public-key"], "utf8");
    const signature = await readFile(signaturePath);
    const valid = verifyTextSignature({ publicKeyPem, signature, text: checksumsText });
    if (!valid) {
      throw new Error("Signature verification failed.");
    }
    process.stdout.write(`${JSON.stringify({ status: "verified", checksums: checksumsPath, signature: signaturePath }, null, 2)}\n`);
    return;
  }

  const privateKeyPem = await readPrivateKey(args);
  const signature = signText({ privateKeyPem, text: checksumsText });
  await writeFile(signaturePath, signature);
  if (args["public-key-out"]) {
    const publicKeyPem = createPublicKey(createPrivateKey(privateKeyPem)).export({ format: "pem", type: "spki" });
    await writeFile(args["public-key-out"], publicKeyPem, "utf8");
  }
  process.stdout.write(`${JSON.stringify({ status: "signed", checksums: checksumsPath, signature: signaturePath }, null, 2)}\n`);
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
