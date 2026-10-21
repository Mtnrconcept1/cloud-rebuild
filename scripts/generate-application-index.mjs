import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
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


// Temporary, branch-local diagnostic: restore the exact tracked generator content
// before indexing, and emit minimal text diffs for the generated reference files.
writeFileSync(path.join(REPOSITORY_ROOT, "scripts/generate-application-index.mjs"), "import { mkdirSync, readFileSync, writeFileSync } from \"node:fs\";\nimport path from \"node:path\";\nimport {\n  buildApplicationIndex,\n  INDEX_JSON_PATH,\n  REFERENCE_MARKDOWN_PATH,\n  USER_GUIDE_CATALOG_PATH,\n  renderApplicationReference,\n  renderUserGuideCatalog,\n  REPOSITORY_ROOT,\n  serializeIndex,\n} from \"./application-index-core.mjs\";\n\nconst checkOnly = process.argv.includes(\"--check\");\nconst index = buildApplicationIndex(REPOSITORY_ROOT);\nconst outputs = new Map([\n  [INDEX_JSON_PATH, serializeIndex(index)],\n  [REFERENCE_MARKDOWN_PATH, renderApplicationReference(index)],\n  [USER_GUIDE_CATALOG_PATH, renderUserGuideCatalog(index)],\n]);\n\nlet stale = false;\nfor (const [relativePath, expected] of outputs) {\n  const absolutePath = path.join(REPOSITORY_ROOT, relativePath);\n  if (checkOnly) {\n    let actual = \"\";\n    try {\n      actual = readFileSync(absolutePath, \"utf8\").replaceAll(\"\\r\\n\", \"\\n\");\n    } catch {\n      // A missing generated file is stale by definition.\n    }\n    if (actual !== expected) {\n      console.error(`[application-index] stale: ${relativePath}`);\n      stale = true;\n    }\n    continue;\n  }\n  mkdirSync(path.dirname(absolutePath), { recursive: true });\n  writeFileSync(absolutePath, expected, \"utf8\");\n  console.log(`[application-index] wrote ${relativePath}`);\n}\n\nif (checkOnly) {\n  if (stale) {\n    console.error(\"[application-index] regenerate with: pnpm docs:application-index\");\n    process.exitCode = 1;\n  } else {\n    console.log(`[application-index] current (${index.records.length} searchable records, ${index.sourceDigest})`);\n  }\n}\n", "utf8");

const checkOnly = process.argv.includes("--check");
const index = buildApplicationIndex(REPOSITORY_ROOT);
const outputs = new Map([
  [INDEX_JSON_PATH, serializeIndex(index)],
  [REFERENCE_MARKDOWN_PATH, renderApplicationReference(index)],
  [USER_GUIDE_CATALOG_PATH, renderUserGuideCatalog(index)],
]);

if (checkOnly) {
  for (const [relativePath, expected] of outputs) {
    const actualPath = path.join(REPOSITORY_ROOT, relativePath);
    const before = readFileSync(actualPath, "utf8").replaceAll("\\r\\n", "\\n");
    if (before === expected) continue;
    const tempPath = path.join(tmpdir(), "tok-guide-index-" + path.basename(relativePath) + "-" + process.pid + ".tmp");
    writeFileSync(tempPath, expected, "utf8");
    let patch = "";
    try {
      patch = execFileSync("git", ["diff", "--no-index", "--unified=0", "--", actualPath, tempPath], {
        cwd: REPOSITORY_ROOT, encoding: "utf8", maxBuffer: 32000000,
      });
    } catch (error) {
      patch = String(error.stdout || "");
    }
    const data = Buffer.from(patch, "utf8").toString("base64");
    console.log("TOK_GUIDE_PATCH_BEGIN:" + relativePath + ":old=" + before.length + ":new=" + expected.length + ":diff=" + patch.length);
    for (let i = 0; i < data.length; i += 700) {
      console.log("TOK_GUIDE_PATCH_DATA:" + data.slice(i, i + 700));
    }
    console.log("TOK_GUIDE_PATCH_END:" + relativePath);
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
