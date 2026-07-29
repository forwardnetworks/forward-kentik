#!/usr/bin/env node

import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

const requiredFiles = [
  ".node-version",
  ".nvmrc",
  "AGENTS.md",
  "ARCHITECTURE.md",
  "README.md",
  "SUPPORT.md",
  "CONTRIBUTING.md",
  "LICENSE",
  "SECURITY.md",
  "eslint.config.mjs",
  "docs/harness-engineering.md",
  "docs/index.md",
  "docs/workflow.md",
  "docs/field-integration-guidelines.md",
  "docs/operator-runbook.md",
  "docs/incident-response.md",
  "docs/rbac.md",
  "docs/customer-acceptance-checklist.md",
  "docs/approval-workflow.md",
  "docs/kentik-api.md",
  "docs/forward-ingest-contract.md",
  "docs/demo-data.md",
  "docs/validation-matrix.md",
  "docs/release-notes.md",
  "docs/release-provenance.md",
  "docs/runtime-templates.md",
  "docs/production-hardening.md",
  "docs/examples/top-flows-query.json",
  "docs/examples/location-map.demo.json",
  "fixtures/kentik-topxdata.demo.json",
  "src/config.mjs",
  "src/kentik-client.mjs",
  "src/kentik-smoke.mjs",
  "src/kentik-portal-client.mjs",
  "src/demo-seed.mjs",
  "src/data-connector.mjs",
  "src/location-map.mjs",
  "src/dashboard.mjs",
  "src/normalize.mjs",
  "src/forward-package.mjs",
  "src/forward-location-template.mjs",
  "schemas/forward-package-manifest.schema.json",
  "schemas/forward-intent-checks.schema.json",
  "deploy/systemd/forward-kentik-importer.service",
  "deploy/systemd/forward-kentik-importer.timer",
  "deploy/systemd/forward-kentik.env.example",
  "deploy/kubernetes/forward-kentik-importer-cronjob.yaml",
  "deploy/kubernetes/forward-kentik-configmap.example.yaml",
  "deploy/kubernetes/forward-kentik-secret.example.yaml",
  "scripts/kentik-export.mjs",
  "scripts/kentik-live-smoke.mjs",
  "scripts/kentik-live-or-seed-smoke.mjs",
  "scripts/seed-kentik-demo-data.mjs",
  "scripts/acceptance-bundle.mjs",
  "scripts/forward-import-package.mjs",
  "scripts/forward-import-smoke.mjs",
  "scripts/sign-forward-package.mjs",
  "scripts/forward-location-map-template.mjs",
  "scripts/forward-data-connector-config.mjs",
  "scripts/build-dashboard.mjs",
  "scripts/serve-dashboard.mjs",
  "scripts/render-demo-screenshots.mjs",
  "scripts/package-release-artifacts.mjs",
  "scripts/release-checksums.mjs",
  "scripts/sign-release-checksums.mjs",
  "scripts/generate-release-signing-keypair.mjs",
  "scripts/validate-github-action-pins.mjs",
  "scripts/validate-release-ref.mjs",
  "scripts/schema-validate.mjs",
  "scripts/serve-package.mjs",
  "scripts/scale-smoke.mjs",
  "scripts/workflow-smoke.mjs",
  "test/normalize.test.mjs",
  "test/approval-import-flow.test.mjs",
  "test/forward-package.test.mjs",
  "test/location-map.test.mjs",
  "test/dashboard-server.test.mjs",
  "test/config.test.mjs",
  "test/kentik-smoke.test.mjs",
  "test/demo-seed.test.mjs",
  "test/data-connector.test.mjs",
  "test/forward-import.test.mjs",
  "test/acceptance-bundle.test.mjs",
  "test/forward-location-template.test.mjs",
  "test/release-artifacts.test.mjs",
  "test/github-action-pins.test.mjs",
  "test/release-ref.test.mjs",
  ".github/workflows/ci.yml",
  ".github/workflows/release.yml",
  ".github/workflows/live-compatibility.yml",
  ".github/workflows/verify-release.yml",
  ".github/CODEOWNERS",
  ".github/dependabot.yml",
  ".github/pull_request_template.md",
  ".github/ISSUE_TEMPLATE/config.yml",
  ".github/ISSUE_TEMPLATE/bug_report.yml",
  ".github/ISSUE_TEMPLATE/feature_request.yml",
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

const markdownImageTargets = (source) => {
  const targets = [];
  let offset = 0;
  while (offset < source.length) {
    const imageStart = source.indexOf("![", offset);
    if (imageStart === -1) break;
    const targetStart = source.indexOf("](", imageStart + 2);
    if (targetStart === -1) break;
    const targetEnd = source.indexOf(")", targetStart + 2);
    if (targetEnd === -1) break;
    const value = source.slice(targetStart + 2, targetEnd).trim();
    const spaceIndex = value.indexOf(" ");
    targets.push(spaceIndex === -1 ? value : value.slice(0, spaceIndex));
    offset = targetEnd + 1;
  }
  return targets;
};

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

if (await exists("README.md")) {
  const readme = await readText("README.md");
  for (const screenshot of requiredScreenshots) {
    if (!readme.includes(`(${screenshot})`)) {
      fail(`README.md does not reference required screenshot: ${screenshot}`);
    }
  }

  for (const target of markdownImageTargets(readme)) {
    if (
      target.startsWith("http:") ||
      target.startsWith("https:") ||
      target.startsWith("data:") ||
      target.startsWith("#")
    ) {
      continue;
    }
    const queryIndex = target.indexOf("?");
    const fragmentIndex = target.indexOf("#");
    const suffixIndexes = [queryIndex, fragmentIndex].filter((index) => index >= 0);
    const suffixIndex = suffixIndexes.length > 0 ? Math.min(...suffixIndexes) : target.length;
    const localTarget = decodeURIComponent(target.slice(0, suffixIndex));
    if (!(await exists(localTarget))) {
      fail(`README.md image target does not exist: ${target}`);
    }
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
    "docs/index.md",
    "docs/kentik-api.md",
    "docs/forward-ingest-contract.md",
    "docs/field-integration-guidelines.md",
    "docs/validation-matrix.md",
    "docs/release-notes.md",
    "docs/release-provenance.md",
    "docs/production-hardening.md",
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

for (const [index, pattern] of (process.env.FORWARD_SENSITIVE_PATTERNS || "")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .entries()) {
  secretPatterns.push({
    name: `Configured sensitive pattern ${index + 1}`,
    regex: pattern.startsWith("re:")
      ? new RegExp(pattern.slice(3))
      : new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  });
}

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
