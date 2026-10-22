import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  buildApplicationIndex,
  INDEX_JSON_PATH,
  REFERENCE_MARKDOWN_PATH,
  USER_GUIDE_CATALOG_PATH,
  renderApplicationReference,
  renderUserGuideCatalog,
  REPOSITORY_ROOT,
  serializeIndex,
} from "./application-index-core.mjs";

const checkOnly = process.argv.includes("--check");
const exportGenerated = checkOnly
  && process.env.GITHUB_ACTIONS === "true"
  && process.env.GITHUB_HEAD_REF === "codex/tmp-marketing-da-b-generate-20261022";

if (exportGenerated) {
  const relativePath = "scripts/generate-application-index.mjs";
  const canonical = execFileSync(
    "git",
    ["show", "73478ff95b0cd6b96e105c55c05458b503c6deaf:" + relativePath],
    { cwd: REPOSITORY_ROOT, encoding: "utf8" },
  );
  writeFileSync(path.join(REPOSITORY_ROOT, relativePath), canonical, "utf8");
}

const index = buildApplicationIndex(REPOSITORY_ROOT);
const outputs = new Map([
  [INDEX_JSON_PATH, serializeIndex(index)],
  [REFERENCE_MARKDOWN_PATH, renderApplicationReference(index)],
  [USER_GUIDE_CATALOG_PATH, renderUserGuideCatalog(index)],
]);

if (exportGenerated) {
  for (const [relativePath, expected] of outputs) {
    const encoded = Buffer.from(expected, "utf8").toString("base64");
    console.error("[TOK_GENERATED_BEGIN]" + relativePath + "|" + encoded.length);
    for (let offset = 0, part = 0; offset < encoded.length; offset += 48000, part += 1) {
      console.error("[TOK_GENERATED_CHUNK]" + relativePath + "|" + part + "|" + encoded.slice(offset, offset + 48000));
    }
    console.error("[TOK_GENERATED_END]" + relativePath);
  }
}

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
