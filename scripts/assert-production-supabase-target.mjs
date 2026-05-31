import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { parse as parseDotenv } from "dotenv";

const ROOT = process.cwd();
const EXPECTED_PROJECT_REF = "wwcrtyoueexyxkkikaos";
const EXPECTED_URL = `https://${EXPECTED_PROJECT_REF}.supabase.co`;
const BLOCKED_PROJECT_REFS = new Set(["rgzqxttqwmaylrzxlzob"]);
const TEXT_FILE_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".env",
  ".example",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".sql",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);
const SKIPPED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".vercel",
  ".supabase",
  ".tmp",
  "coverage",
]);

const productionEnv = readEnvStack([".env.production", ".env.production.local"]);
const errors = [];

assertEnvTarget("VITE_SUPABASE_PROJECT_ID", productionEnv.VITE_SUPABASE_PROJECT_ID, EXPECTED_PROJECT_REF);
assertEnvTarget("VITE_SUPABASE_URL", productionEnv.VITE_SUPABASE_URL, EXPECTED_URL);

for (const hit of scanRepository(ROOT)) {
  errors.push(`Blocked Supabase project reference found in ${hit.file}: ${hit.match}`);
}

if (errors.length > 0) {
  console.error("Production Supabase target guard failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Production Supabase target guard OK: ${EXPECTED_URL}`);

function assertEnvTarget(key, value, expected) {
  const cleaned = cleanValue(process.env[key] ?? value);
  if (!cleaned) {
    errors.push(`${key} is missing for production.`);
    return;
  }
  if (cleaned !== expected) {
    errors.push(`${key} must be ${expected}, received ${cleaned}.`);
  }
}

function readEnvStack(files) {
  const env = {};
  for (const file of files) {
    const filePath = path.join(ROOT, file);
    if (!fs.existsSync(filePath)) continue;
    Object.assign(env, parseDotenv(fs.readFileSync(filePath)));
  }
  return env;
}

function cleanValue(value) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/^['"]|['"]$/g, "");
}

function* scanRepository(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (SKIPPED_DIRS.has(entry.name)) continue;
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      yield* scanRepository(filePath);
      continue;
    }
    if (!entry.isFile()) continue;
    const relativePath = path.relative(ROOT, filePath).replace(/\\/g, "/");
    if (relativePath === "scripts/assert-production-supabase-target.mjs") continue;
    if (!isTextFile(filePath)) continue;
    const content = fs.readFileSync(filePath, "utf8");
    for (const blockedRef of BLOCKED_PROJECT_REFS) {
      if (content.includes(blockedRef)) {
        yield { file: relativePath, match: blockedRef };
      }
    }
  }
}

function isTextFile(filePath) {
  const basename = path.basename(filePath);
  if (basename.startsWith(".env")) return true;
  const extension = path.extname(filePath);
  return TEXT_FILE_EXTENSIONS.has(extension);
}
