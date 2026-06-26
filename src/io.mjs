import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const readJsonFile = async (filePath) =>
  JSON.parse(await readFile(filePath, "utf8"));

export const writeJsonFile = async (filePath, value) => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

export const parseArgs = (argv) => {
  const args = { _: [] };
  const booleanFlags = new Set(["apply", "collect", "help", "include-low-confidence", "validate-only"]);
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith("--")) {
      args._.push(current);
      continue;
    }
    const key = current.slice(2);
    if (booleanFlags.has(key)) {
      args[key] = true;
      continue;
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }
    args[key] = next;
    index += 1;
  }
  return args;
};
