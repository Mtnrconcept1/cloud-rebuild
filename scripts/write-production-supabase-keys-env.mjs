import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

function parseArgs(argv) {
  const result = {};

  for (const argument of argv) {
    const match = /^--([^=]+)=(.*)$/.exec(argument);
    if (!match) {
      throw new Error(`Unsupported argument: ${argument}`);
    }
    result[match[1]] = match[2];
  }

  return result;
}

function isUsableKey(key) {
  return Boolean(
    key
      && key.disabled !== true
      && typeof key.api_key === "string"
      && key.api_key.trim(),
  );
}

function validateKeyValue(name, value) {
  if (!/^[A-Za-z0-9._-]+$/.test(value)) {
    throw new Error(`${name} contains unsupported characters.`);
  }
}

export function selectSupabaseDeploymentKeys(payload) {
  const keys = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.keys)
      ? payload.keys
      : [];
  const activeKeys = keys.filter(isUsableKey);

  const legacyAnon = activeKeys.find((key) => key.name === "anon");
  const publishable = activeKeys.find((key) => key.type === "publishable");
  const legacyServiceRole = activeKeys.find((key) => key.name === "service_role");
  const secret = activeKeys.find((key) => key.type === "secret");

  const selected = {
    SUPABASE_PUBLISHABLE_KEY: publishable?.api_key ?? legacyAnon?.api_key,
    SUPABASE_ANON_KEY: legacyAnon?.api_key ?? publishable?.api_key,
    SUPABASE_SERVICE_ROLE_KEY: legacyServiceRole?.api_key ?? secret?.api_key,
  };

  for (const [name, value] of Object.entries(selected)) {
    if (!value) {
      throw new Error(`Supabase Management API did not return ${name}.`);
    }
    validateKeyValue(name, value);
  }

  return selected;
}

export function formatGitHubEnvironment(keys) {
  return Object.entries(keys)
    .map(([name, value]) => `${name}=${value}`)
    .join("\n") + "\n";
}

export function writeProductionSupabaseKeysEnv({ keysFile, outputFile }) {
  if (!keysFile) {
    throw new Error("Missing --keys-file argument.");
  }
  if (!outputFile) {
    throw new Error("Missing --out argument or GITHUB_ENV.");
  }

  const payload = JSON.parse(readFileSync(resolve(keysFile), "utf8"));
  const keys = selectSupabaseDeploymentKeys(payload);

  for (const value of new Set(Object.values(keys))) {
    process.stdout.write(`::add-mask::${value}\n`);
  }

  appendFileSync(resolve(outputFile), formatGitHubEnvironment(keys), {
    encoding: "utf8",
    mode: 0o600,
  });

  return keys;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  writeProductionSupabaseKeysEnv({
    keysFile: args["keys-file"],
    outputFile: args.out || process.env.GITHUB_ENV,
  });
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  main();
}
