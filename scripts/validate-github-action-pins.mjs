#!/usr/bin/env node

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fullCommitSha = /^[0-9a-f]{40}$/u;
const releaseComment = /^v[0-9][0-9A-Za-z.+-]*$/u;

export const validateWorkflowActionPins = ({ workflowPath, source }) => {
  const failures = [];
  const lines = source.split(/\r?\n/u);

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    const usesLine = trimmed.startsWith("- uses:") ? trimmed.slice(2).trim() : trimmed;
    if (!usesLine.startsWith("uses:")) continue;

    const value = usesLine.slice("uses:".length).trim();
    const commentIndex = value.indexOf("#");
    const reference = (commentIndex === -1 ? value : value.slice(0, commentIndex)).trim();
    const displayVersion = commentIndex === -1 ? "" : value.slice(commentIndex + 1).trim();
    if (reference.startsWith("./")) continue;

    const separator = reference.lastIndexOf("@");
    const action = separator > 0 ? reference.slice(0, separator) : reference;
    const revision = separator > 0 ? reference.slice(separator + 1) : "";
    const location = `${workflowPath}:${index + 1}`;

    if (!fullCommitSha.test(revision)) {
      failures.push(`${location} must pin ${action} to a full 40-character commit SHA.`);
    }
    if (!releaseComment.test(displayVersion || "")) {
      failures.push(`${location} must retain a release comment such as # v4 for update review.`);
    }
  }

  return failures;
};

export const validateWorkflowDirectory = async (workflowDirectory) => {
  const failures = [];
  const entries = await readdir(workflowDirectory, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile() || !/\.ya?ml$/u.test(entry.name)) continue;
    const workflowPath = path.join(workflowDirectory, entry.name);
    const source = await readFile(workflowPath, "utf8");
    failures.push(
      ...validateWorkflowActionPins({
        workflowPath: path.relative(root, workflowPath),
        source,
      }),
    );
  }

  return failures;
};

const main = async () => {
  const failures = await validateWorkflowDirectory(path.join(root, ".github", "workflows"));
  if (failures.length > 0) {
    process.stderr.write("GitHub Action pin validation failed:\n");
    for (const failure of failures) process.stderr.write(`- ${failure}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write("GitHub Actions use immutable commit pins.\n");
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
