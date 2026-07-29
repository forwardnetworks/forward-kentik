#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "../src/io.mjs";
import { writeChecksumManifest } from "./release-checksums.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const usage = `
Package Forward Integration for Kentik release artifacts

Usage:
  node scripts/package-release-artifacts.mjs --out-dir dist/release

Options:
  --out-dir path          Output directory. Default: dist/release
  --skip-checksums        Do not write SHA256SUMS.
`;

const RELEASE_PATHS = [
  ".node-version",
  ".nvmrc",
  ".github/CODEOWNERS",
  ".github/dependabot.yml",
  ".github/workflows/ci.yml",
  ".github/workflows/live-compatibility.yml",
  ".github/workflows/release.yml",
  ".github/workflows/verify-release.yml",
  "AGENTS.md",
  "ARCHITECTURE.md",
  "CONTRIBUTING.md",
  "LICENSE",
  "README.md",
  "SECURITY.md",
  "SUPPORT.md",
  "deploy",
  "docs",
  "eslint.config.mjs",
  "fixtures",
  "package-lock.json",
  "package.json",
  "schemas",
  "scripts",
  "src",
  "test",
];

const run = async (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
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
        reject(new Error(`${command} ${args.join(" ")} failed with ${code}:\n${stderr || stdout}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });

const packageMetadata = async () => JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));

export const releaseArchiveName = ({ name, version }) => `${name}-${version}.tgz`;

export const packageReleaseArtifacts = async ({ outDir = "dist/release", writeChecksums = true } = {}) => {
  const metadata = await packageMetadata();
  const resolvedOutDir = path.resolve(root, outDir);
  await mkdir(resolvedOutDir, { recursive: true });

  const archivePath = path.join(resolvedOutDir, releaseArchiveName(metadata));
  await run("tar", ["-czf", archivePath, "--exclude", "docs/assets/screenshots/*.tmp", ...RELEASE_PATHS]);

  const sbomPath = path.join(resolvedOutDir, "forward-kentik-sbom.cdx.json");
  const { stdout: sbomText } = await run("npm", ["sbom", "--sbom-format=cyclonedx"]);
  const sbom = JSON.parse(sbomText);
  sbom.metadata.component.name = metadata.name;
  await writeFile(sbomPath, `${JSON.stringify(sbom, null, 2)}\n`, "utf8");

  const manifest = {
    schemaVersion: "forward-kentik-release/v0.1",
    generatedAt: new Date().toISOString(),
    package: {
      name: metadata.name,
      version: metadata.version,
      archive: path.basename(archivePath),
    },
    artifacts: {
      sbom: path.basename(sbomPath),
    },
    contents: RELEASE_PATHS,
  };
  const releaseManifestPath = path.join(resolvedOutDir, "forward-kentik-release-manifest.json");
  await writeFile(releaseManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  let checksums = null;
  if (writeChecksums) {
    checksums = await writeChecksumManifest({
      files: [archivePath, releaseManifestPath, sbomPath],
      outPath: path.join(resolvedOutDir, "SHA256SUMS"),
    });
  }

  return {
    archive: archivePath,
    checksums: checksums?.outPath || null,
    manifest: releaseManifestPath,
    sbom: sbomPath,
  };
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage);
    return;
  }

  const result = await packageReleaseArtifacts({
    outDir: args["out-dir"] || "dist/release",
    writeChecksums: !args["skip-checksums"],
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
