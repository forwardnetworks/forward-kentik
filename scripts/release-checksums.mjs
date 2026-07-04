#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "../src/io.mjs";

const usage = `
Write SHA256SUMS for release artifacts

Usage:
  node scripts/release-checksums.mjs --out dist/release/SHA256SUMS dist/release/forward-kentik-0.1.0.tgz

Options:
  --dir path     Directory to scan when no positional files are supplied.
  --out path     Output checksum file. Default: dist/release/SHA256SUMS
`;

const EXCLUDED_NAMES = new Set(["SHA256SUMS", "SHA256SUMS.sig", "SHA256SUMS.pub"]);

export const sha256File = async (filePath) => {
  const hash = createHash("sha256");
  hash.update(await readFile(filePath));
  return hash.digest("hex");
};

export const formatChecksumLines = (entries) =>
  `${entries
    .map((entry) => ({ ...entry, name: entry.name.replaceAll("\\", "/") }))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => `${entry.sha256}  ${entry.name}`)
    .join("\n")}\n`;

export const discoverChecksumFiles = async (directory) => {
  const entries = await readdir(directory);
  const files = [];
  for (const entry of entries) {
    if (EXCLUDED_NAMES.has(entry)) {
      continue;
    }
    const filePath = path.join(directory, entry);
    if ((await stat(filePath)).isFile()) {
      files.push(filePath);
    }
  }
  return files.sort();
};

export const writeChecksumManifest = async ({ files, outPath }) => {
  const outDir = path.dirname(outPath);
  const entries = [];
  for (const filePath of files) {
    entries.push({
      name: path.relative(outDir, filePath),
      sha256: await sha256File(filePath),
    });
  }
  const text = formatChecksumLines(entries);
  await mkdir(outDir, { recursive: true });
  await writeFile(outPath, text, "utf8");
  return { outPath, entries, text };
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage);
    return;
  }

  const outPath = args.out || "dist/release/SHA256SUMS";
  const files = args._.length > 0 ? args._ : await discoverChecksumFiles(args.dir || path.dirname(outPath));
  if (files.length === 0) {
    throw new Error("No release artifacts found for checksum generation.");
  }

  const result = await writeChecksumManifest({ files, outPath });
  process.stdout.write(
    `${JSON.stringify(
      {
        out: result.outPath,
        files: result.entries.map((entry) => entry.name),
      },
      null,
      2,
    )}\n`,
  );
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
