import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  buildApplicationIndex,
  INDEX_JSON_PATH,
  REFERENCE_MARKDOWN_PATH,
  renderApplicationReference,
  REPOSITORY_ROOT,
  serializeIndex,
} from "./application-index-core.mjs";

const checkOnly = process.argv.includes("--check");
const index = buildApplicationIndex(REPOSITORY_ROOT);
const outputs = new Map([
  [INDEX_JSON_PATH, serializeIndex(index)],
  [REFERENCE_MARKDOWN_PATH, renderApplicationReference(index)],
]);

let stale = false;
for (const [relativePath, expected] of outputs) {
  const absolutePath = path.join(REPOSITORY_ROOT, relativePath);
  if (checkOnly) {
    let actual = "";
    try {
      actual = readFileSync(absolutePath, "utf8").replaceAll("\r\n", "\n");
    } catch {
      // A missing generated file is stale by definition.
    }
    if (actual !== expected) {
      console.error(`[application-index] stale: ${relativePath}`);
      stale = true;
    }
    continue;
  }
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, expected, "utf8");
  console.log(`[application-index] wrote ${relativePath}`);
}

if (checkOnly) {
  if (stale) {
    console.error("[application-index] regenerate with: pnpm docs:application-index");
    process.exitCode = 1;
  } else {
    console.log(`[application-index] current (${index.records.length} searchable records, ${index.sourceDigest})`);
  }
}
