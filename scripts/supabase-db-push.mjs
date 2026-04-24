import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { parse as parseDotenv } from "dotenv";

const ROOT = process.cwd();
const MODE = readMode(process.argv.slice(2));
const EXTRA_ARGS = process.argv.slice(2).filter((arg) => !arg.startsWith("--mode="));
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

const dbPassword = cleanValue(envInfo.env.SUPABASE_DB_PASSWORD);
if (!dbPassword) {
  console.error(`SUPABASE_DB_PASSWORD is missing for ${MODE} in ${describeFiles(envInfo.loadedFiles)}.`);
  process.exit(1);
}

const accessToken = cleanValue(envInfo.env.SUPABASE_ACCESS_TOKEN);
const childEnv = {
  ...process.env,
  ...(accessToken ? { SUPABASE_ACCESS_TOKEN: accessToken } : {}),
};

console.log(`Preparing Supabase db push for ${MODE}.`);
console.log(`Resolved project ref: ${envInfo.projectRef}`);
console.log(`Env files used: ${describeFiles(envInfo.loadedFiles)}`);

runNodeScript("scripts/supabase-target.mjs", [`--mode=${MODE}`], childEnv);
runSupabaseCli(["link", "--project-ref", envInfo.projectRef, "--password", dbPassword], childEnv);
runNodeScript("scripts/supabase-doctor.mjs", [`--mode=${MODE}`], childEnv);
runSupabaseCli(["db", "push", "--linked", "--yes", "--password", dbPassword, ...EXTRA_ARGS], childEnv);

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
    Object.assign(env, parseDotenv(fs.readFileSync(absoluteFile)));
  }

  return {
    loadedFiles,
    env,
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
  return trimmed || null;
}

function describeFiles(files) {
  return files.length > 0 ? files.join(", ") : "no env files";
}

function runNodeScript(relativePath, args, env) {
  const scriptPath = path.join(ROOT, relativePath);
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: ROOT,
    env,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runSupabaseCli(args, env) {
  const { command, prefixArgs } = resolveSupabaseCommand();
  const result = spawnSync(command, [...prefixArgs, ...args], {
    cwd: ROOT,
    env: {
      ...env,
      NPM_CONFIG_YES: env.NPM_CONFIG_YES || "true",
    },
    stdio: "inherit",
    shell: false,
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function resolveSupabaseCommand() {
  if (process.platform === "win32") {
    const windowsBinary = path.join(ROOT, "node_modules", "supabase", "bin", "supabase.exe");
    if (fs.existsSync(windowsBinary)) {
      return { command: windowsBinary, prefixArgs: [] };
    }
  }

  const localBin = path.join(ROOT, "node_modules", ".bin", "supabase");
  if (fs.existsSync(localBin)) {
    return { command: localBin, prefixArgs: [] };
  }

  return {
    command: process.platform === "win32" ? "npx.cmd" : "npx",
    prefixArgs: ["supabase"],
  };
}
