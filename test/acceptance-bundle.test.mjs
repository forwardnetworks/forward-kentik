import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildAcceptanceBundle } from "../scripts/acceptance-bundle.mjs";

test("builds a read-only acceptance bundle", async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "forward-kentik-acceptance-"));
  const result = await buildAcceptanceBundle({
    input: "fixtures/kentik-topxdata.demo.json",
    outputDir,
  });

  assert.equal(result.observedFlows, 4);
  assert.equal(result.generatedChecks, 3);
  assert.equal(result.skipped, 1);
  assert.match(await readFile(path.join(outputDir, "ACCEPTANCE.md"), "utf8"), /does not contact Forward/);
  assert.match(await readFile(path.join(outputDir, "SHA256SUMS"), "utf8"), /forward-intent-checks\.json/);
});
