#!/usr/bin/env node

import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

const requiredFiles = [
  "AGENTS.md",
  "README.md",
  "LICENSE",
  "SECURITY.md",
  "docs/harness-engineering.md",
  "docs/workflow.md",
  "docs/field-integration-guidelines.md",
  "docs/operator-runbook.md",
  "docs/kentik-api.md",
  "docs/forward-ingest-contract.md",
  "docs/demo-data.md",
  "docs/validation-matrix.md",
  "docs/examples/top-flows-query.json",
  "docs/examples/location-map.demo.json",
  "fixtures/kentik-topxdata.demo.json",
  "src/config.mjs",
  "src/kentik-client.mjs",
  "src/kentik-portal-client.mjs",
  "src/demo-seed.mjs",
  "src/data-connector.mjs",
  "src/location-map.mjs",
  "src/dashboard.mjs",
  "src/normalize.mjs",
  "src/forward-package.mjs",
  "src/forward-location-template.mjs",
  "scripts/kentik-export.mjs",
  "scripts/kentik-live-smoke.mjs",
  "scripts/seed-kentik-demo-data.mjs",
  "scripts/forward-import-package.mjs",
  "scripts/forward-import-smoke.mjs",
  "scripts/forward-location-map-template.mjs",
  "scripts/forward-data-connector-config.mjs",
  "scripts/build-dashboard.mjs",
  "scripts/serve-dashboard.mjs",
  "scripts/render-demo-screenshots.mjs",
  "scripts/serve-package.mjs",
  "scripts/workflow-smoke.mjs",
  "test/normalize.test.mjs",
  "test/forward-package.test.mjs",
  "test/location-map.test.mjs",
  "test/dashboard-server.test.mjs",
  "test/config.test.mjs",
  "test/demo-seed.test.mjs",
  "test/data-connector.test.mjs",
  "test/forward-import.test.mjs",
  "test/forward-location-template.test.mjs",
  ".github/workflows/ci.yml",
];

const requiredScreenshots = [
  "docs/assets/screenshots/01-workflow-overview.png",
  "docs/assets/screenshots/02-package-readiness.png",
  "docs/assets/screenshots/03-forward-import-dry-run.png",
  "docs/assets/screenshots/04-optional-nqe-visibility.png",
  "docs/assets/screenshots/05-dashboard-correlation.png",
  "docs/assets/screenshots/06-dashboard-reconciled.png",
];

const skippedDirectories = new Set([".git", "node_modules", "dist"]);
const textExtensions = new Set([".js", ".json", ".md", ".mjs", ".txt", ".yml", ".yaml", ".example", ""]);

const fail = (message) => failures.push(message);

const exists = async (relativePath) => {
  try {
    await stat(path.join(root, relativePath));
    return true;
  } catch {
    return false;
  }
};

const readText = async (relativePath) => readFile(path.join(root, relativePath), "utf8");

const walkTextFiles = async (directory = root) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = path.relative(root, absolutePath);
    if (entry.isDirectory()) {
      if (!skippedDirectories.has(entry.name)) {
        files.push(...(await walkTextFiles(absolutePath)));
      }
      continue;
    }
    if (entry.isFile() && textExtensions.has(path.extname(entry.name))) {
      files.push(relativePath);
    }
  }
  return files;
};

for (const file of requiredFiles) {
  if (!(await exists(file))) {
    fail(`Missing required file: ${file}`);
  }
}

for (const screenshot of requiredScreenshots) {
  try {
    const details = await stat(path.join(root, screenshot));
    if (details.size < 10_000) {
      fail(`Screenshot is unexpectedly small: ${screenshot}`);
    }
  } catch {
    fail(`Missing required screenshot: ${screenshot}`);
  }
}

if (await exists("AGENTS.md")) {
  const agentMap = await readText("AGENTS.md");
  const lineCount = agentMap.trimEnd().split("\n").length;
  if (lineCount > 120) {
    fail(`AGENTS.md should stay compact; found ${lineCount} lines`);
  }
  for (const target of [
    "docs/workflow.md",
    "docs/kentik-api.md",
    "docs/forward-ingest-contract.md",
    "docs/field-integration-guidelines.md",
    "docs/validation-matrix.md",
    "docs/harness-engineering.md",
  ]) {
    if (!agentMap.includes(target)) {
      fail(`AGENTS.md does not point to ${target}`);
    }
  }
}

const secretPatterns = [
  {
    name: "Kentik token-shaped assignment",
    regex: /KENTIK_(TOKEN|API_TOKEN)=([A-Za-z0-9_-]{12,})/,
  },
  {
    name: "Forward password assignment",
    regex: /FORWARD_PASSWORD=(?!<password-or-token>)[^\s]+/,
  },
  {
    name: "Local absolute user path",
    regex: /\/Users\/[A-Za-z0-9._-]+/,
  },
];

for (const file of await walkTextFiles()) {
  if (file === "scripts/validate-repo.mjs") {
    continue;
  }
  const text = await readText(file);
  for (const pattern of secretPatterns) {
    if (pattern.regex.test(text)) {
      fail(`${pattern.name} found in ${file}`);
    }
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    process.stderr.write(`- ${failure}\n`);
  }
  process.exitCode = 1;
} else {
  process.stdout.write("Repository validation passed.\n");
}
