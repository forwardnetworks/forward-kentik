import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { formatChecksumLines, sha256File, writeChecksumManifest } from "../scripts/release-checksums.mjs";
import { releaseArchiveName } from "../scripts/package-release-artifacts.mjs";
import { generateReleaseSigningKeyPair } from "../scripts/generate-release-signing-keypair.mjs";
import { packageSignatureMaterial } from "../scripts/sign-forward-package.mjs";
import { signText, verifyTextSignature } from "../scripts/sign-release-checksums.mjs";

test("formats checksum manifests deterministically", () => {
  assert.equal(
    formatChecksumLines([
      { name: "b.tgz", sha256: "b".repeat(64) },
      { name: "a.json", sha256: "a".repeat(64) },
    ]),
    `${"a".repeat(64)}  a.json\n${"b".repeat(64)}  b.tgz\n`,
  );
});

test("writes release checksums for artifact files", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "forward-kentik-release-test-"));
  const artifact = path.join(directory, "artifact.txt");
  const outPath = path.join(directory, "SHA256SUMS");
  await writeFile(artifact, "release artifact\n", "utf8");

  const result = await writeChecksumManifest({ files: [artifact], outPath });
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].sha256, await sha256File(artifact));
  assert.match(await readFile(outPath, "utf8"), /artifact\.txt/);
});

test("builds release archive names from package metadata", () => {
  assert.equal(releaseArchiveName({ name: "forward-kentik", version: "0.1.0" }), "forward-kentik-0.1.0.tgz");
});

test("signs and verifies release checksum text", () => {
  const keys = generateReleaseSigningKeyPair();
  const text = `${"a".repeat(64)}  artifact.tgz\n`;
  const signature = signText({ privateKeyPem: keys.privateKeyPem, text });
  assert.equal(verifyTextSignature({ publicKeyPem: keys.publicKeyPem, signature, text }), true);
  assert.equal(verifyTextSignature({ publicKeyPem: keys.publicKeyPem, signature, text: `${text}changed` }), false);
});

test("builds exact package signature material", () => {
  assert.equal(packageSignatureMaterial({ manifestText: "manifest\n", checksText: "checks\n" }), "manifest\n\nchecks\n");
});
