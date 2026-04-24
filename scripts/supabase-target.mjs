import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { parse as parseDotenv } from "dotenv";

const ROOT = process.cwd();
const MODE = readMode(process.argv.slice(2));
const ENV_STACKS = {
  development: [".env", ".env.local", ".env.development", ".env.development.local"],
  production: [".env.production", ".env.production.local"],
};

const envInfo = readEnvStack(MODE);

if (!envInfo.projectRef) {
  console.error(
    `No Supabase project ref could be resolved for ${MODE} from ${describeFiles(envInfo.loadedFiles)}.`,
  );
  process.exit(1);
}

updateConfigToml(envInfo.projectRef);
clearSupabaseTemp();

console.log(`Aligned local Supabase target to ${MODE}.`);
console.log(`Resolved project ref: ${envInfo.projectRef}`);
console.log(`Env files used: ${describeFiles(envInfo.loadedFiles)}`);
console.log("Cleared supabase/.temp so stale CLI link metadata cannot leak across targets.");
console.log("Supabase CLI link metadata will be recreated by the next `supabase link` or deploy wrapper command.");

function readMode(args) {
  const modeArg = args.find((arg) => arg.startsWith("--mode="));
  const mode = modeArg ? modeArg.slice("--mode=".length) : "development";
  if (!["development", "production"].includes(mode)) {
    console.error(`Unsupported mode "${mode}". Use development or production.`);
    process.exit(1);
  }

  return mode;
}

function readEnvStack(mode) {
  const files = ENV_STACKS[mode];
  const loadedFiles = [];
  const env = {};

  for (const relativeFile of files) {
    const absoluteFile = path.join(ROOT, relativeFile);
    if (!fs.existsSync(absoluteFile)) {
      continue;
    }

    loadedFiles.push(relativeFile);
    const parsed = parseDotenv(fs.readFileSync(absoluteFile));
    Object.assign(env, parsed);
  }

  return {
    loadedFiles,
    projectRef: extractProjectRef(env),
  };
}

function extractProjectRef(env) {
  const explicitProjectId = cleanValue(env.VITE_SUPABASE_PROJECT_ID);
  if (explicitProjectId) {
    return explicitProjectId;
  }

  const url = cleanValue(env.VITE_SUPABASE_URL);
  if (!url) {
    return null;
  }

  const match = url.match(/^https:\/\/([a-z0-9-]+)\.supabase\.co/i);
  return match ? match[1] : null;
}

function cleanValue(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim().replace(/^['"]|['"]$/g, "");
  if (!trimmed || trimmed.includes("your-project")) {
    return null;
  }

  return trimmed;
}

function updateConfigToml(projectRef) {
  const configPath = path.join(ROOT, "supabase", "config.toml");
  const content = fs.readFileSync(configPath, "utf8");
  const nextContent = content.match(/^\s*project_id\s*=\s*"([^"]+)"/m)
    ? content.replace(/^\s*project_id\s*=\s*"([^"]+)"/m, `project_id = "${projectRef}"`)
    : `project_id = "${projectRef}"\n${content}`;

  fs.writeFileSync(configPath, nextContent);
}

function clearSupabaseTemp() {
  const tempPath = path.join(ROOT, "supabase", ".temp");
  if (!fs.existsSync(tempPath)) {
    return;
  }

  for (const entry of fs.readdirSync(tempPath)) {
    fs.rmSync(path.join(tempPath, entry), { recursive: true, force: true });
  }
}

function describeFiles(files) {
  return files.length > 0 ? files.join(", ") : "no env files";
}
