import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { parse as parseDotenv } from "dotenv";

const ROOT = process.cwd();
const MODE = readMode(process.argv.slice(2));
const ENV_STACKS = {
  development: [".env", ".env.local", ".env.development", ".env.development.local"],
  production: [".env", ".env.production", ".env.production.local"],
};

const modes = MODE === "all" ? ["development", "production"] : [MODE];
const results = modes.map((mode) => inspectMode(mode));
const hasErrors = results.some((result) => result.errors.length > 0);

for (const result of results) {
  printResult(result);
}

process.exit(hasErrors ? 1 : 0);

function readMode(args) {
  const modeArg = args.find((arg) => arg.startsWith("--mode="));
  const mode = modeArg ? modeArg.slice("--mode=".length) : "development";
  if (!["development", "production", "all"].includes(mode)) {
    console.error(
      `Unsupported mode "${mode}". Use development, production, or all.`,
    );
    process.exit(1);
  }

  return mode;
}

function inspectMode(mode) {
  const envInfo = readEnvStack(mode);
  const configProjectId = readConfigProjectId();
  const linkInfo = readLinkInfo();
  const workflowProjectId = readWorkflowProjectId();
  const errors = [];
  const warnings = [];

  if (!envInfo.projectRef) {
    errors.push(
      `No frontend Supabase project could be resolved for ${mode} from ${describeFiles(envInfo.loadedFiles)}.`,
    );
  }

  if (!configProjectId) {
    warnings.push("supabase/config.toml does not expose a project_id.");
  }

  if (mode === "production") {
    if (!workflowProjectId) {
      warnings.push("GitHub Actions production deploy ref is missing from .github/workflows/deploy-production.yml.");
    } else if (envInfo.projectRef && envInfo.projectRef !== workflowProjectId) {
      errors.push(
        `Production frontend target (${envInfo.projectRef}) does not match GitHub Actions deploy ref (${workflowProjectId}).`,
      );
    }
  }

  if (envInfo.projectRef && configProjectId && envInfo.projectRef !== configProjectId) {
    warnings.push(
      `supabase/config.toml currently targets ${configProjectId}, not the ${mode} frontend project ${envInfo.projectRef}. Run pnpm run supabase:target:${mode === "production" ? "prod" : "dev"} before ${mode} deploy commands.`,
    );
  }

  if (configProjectId && linkInfo.projectRef && configProjectId !== linkInfo.projectRef) {
    errors.push(
      `supabase/config.toml (${configProjectId}) does not match supabase/.temp/project-ref (${linkInfo.projectRef}).`,
    );
  }

  if (
    configProjectId &&
    linkInfo.linkedProjectRef &&
    configProjectId !== linkInfo.linkedProjectRef
  ) {
    errors.push(
      `supabase/config.toml (${configProjectId}) does not match supabase/.temp/linked-project.json (${linkInfo.linkedProjectRef}).`,
    );
  }

  if (
    linkInfo.projectRef &&
    linkInfo.linkedProjectRef &&
    linkInfo.projectRef !== linkInfo.linkedProjectRef
  ) {
    errors.push(
      `supabase/.temp/project-ref (${linkInfo.projectRef}) does not match supabase/.temp/linked-project.json (${linkInfo.linkedProjectRef}).`,
    );
  }

  if (!linkInfo.projectRef && !linkInfo.linkedProjectRef) {
    warnings.push(
      "No Supabase CLI link was found under supabase/.temp. Frontend checks are still valid, but deploy commands can drift until you link explicitly.",
    );
  }

  return {
    mode,
    envInfo,
    configProjectId,
    linkInfo,
    workflowProjectId,
    errors,
    warnings,
  };
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
    url: cleanValue(env.VITE_SUPABASE_URL),
  };
}

function readConfigProjectId() {
  const configPath = path.join(ROOT, "supabase", "config.toml");
  if (!fs.existsSync(configPath)) {
    return null;
  }

  const content = fs.readFileSync(configPath, "utf8");
  const match = content.match(/^\s*project_id\s*=\s*"([^"]+)"/m);
  return match ? cleanValue(match[1]) : null;
}

function readLinkInfo() {
  const projectRefPath = path.join(ROOT, "supabase", ".temp", "project-ref");
  const linkedProjectPath = path.join(ROOT, "supabase", ".temp", "linked-project.json");

  let projectRef = null;
  let linkedProjectRef = null;

  if (fs.existsSync(projectRefPath)) {
    projectRef = cleanValue(fs.readFileSync(projectRefPath, "utf8"));
  }

  if (fs.existsSync(linkedProjectPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(linkedProjectPath, "utf8"));
      linkedProjectRef = cleanValue(
        parsed?.project_ref ?? parsed?.projectRef ?? parsed?.ref ?? null,
      );
    } catch (error) {
      linkedProjectRef = null;
    }
  }

  return { projectRef, linkedProjectRef };
}

function readWorkflowProjectId() {
  const workflowPath = path.join(ROOT, ".github", "workflows", "deploy-production.yml");
  if (!fs.existsSync(workflowPath)) {
    return null;
  }

  const content = fs.readFileSync(workflowPath, "utf8");
  const match = content.match(/^\s*SUPABASE_PROJECT_REF:\s*([A-Za-z0-9_-]+)\s*$/m);
  return match ? cleanValue(match[1]) : null;
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

function describeFiles(files) {
  return files.length > 0 ? files.join(", ") : "no env files";
}

function printResult(result) {
  const {
    mode,
    envInfo,
    configProjectId,
    linkInfo,
    workflowProjectId,
    errors,
    warnings,
  } = result;
  const header = `Supabase doctor (${mode})`;
  console.log(`\n${header}`);
  console.log("=".repeat(header.length));
  console.log(`Frontend env files: ${describeFiles(envInfo.loadedFiles)}`);
  console.log(`Frontend project: ${envInfo.projectRef ?? "missing"}`);
  console.log(`Frontend URL: ${envInfo.url ?? "missing"}`);
  console.log(`supabase/config.toml project_id: ${configProjectId ?? "missing"}`);
  console.log(`supabase/.temp/project-ref: ${linkInfo.projectRef ?? "missing"}`);
  console.log(
    `supabase/.temp/linked-project.json: ${linkInfo.linkedProjectRef ?? "missing"}`,
  );
  if (mode === "production") {
    console.log(`GitHub Actions SUPABASE_PROJECT_REF: ${workflowProjectId ?? "missing"}`);
  }

  if (errors.length === 0) {
    console.log("Result: OK");
  } else {
    console.log("Result: FAIL");
    for (const error of errors) {
      console.log(`- ${error}`);
    }
  }

  for (const warning of warnings) {
    console.log(`- Warning: ${warning}`);
  }

  if (errors.length > 0 && envInfo.projectRef) {
    console.log(
      `Suggested next step: align the frontend env and relink Supabase with project ref ${envInfo.projectRef} before running db push or functions deploy.`,
    );
  }
}
