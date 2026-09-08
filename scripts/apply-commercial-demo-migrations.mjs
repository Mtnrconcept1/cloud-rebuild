import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const MIGRATION_DIRECTORY = "supabase/demo-migrations";
const MIGRATION_FILE = /^(\d{14})_([a-z0-9_]+)\.sql$/;
const COMMIT_SHA = /^[0-9a-f]{40}$/i;
const API_ORIGIN = "https://api.supabase.com";
const INTERNAL_SCHEMA = "commercial_demo_internal";

export function parseMigrationPath(filePath) {
  const normalized = String(filePath || "").replace(/\\/g, "/");
  if (!normalized.startsWith(`${MIGRATION_DIRECTORY}/`)) return null;

  const fileName = path.posix.basename(normalized);
  const match = fileName.match(MIGRATION_FILE);
  if (!match) return null;

  return {
    path: normalized,
    version: match[1],
    name: match[2],
  };
}

export function parseAddedDemoMigrations(diffOutput) {
  const migrations = [];

  for (const line of String(diffOutput || "").split("\n")) {
    if (!line.trim()) continue;
    const [status, ...pathParts] = line.split("\t");
    const filePath = pathParts.at(-1) || "";
    const migration = parseMigrationPath(filePath);

    if (!migration) {
      throw new Error(`Unsupported dedicated demo migration path: ${filePath || line}`);
    }
    if (status !== "A") {
      throw new Error(
        `Dedicated demo migrations are append-only; ${filePath} has status ${status}.`,
      );
    }

    migrations.push(migration);
  }

  return migrations.sort((left, right) => left.version.localeCompare(right.version));
}

export function hasTopLevelTransactionControl(sql) {
  const executableSql = String(sql)
    .replace(/\$([A-Za-z_][A-Za-z0-9_]*|)\$[\s\S]*?\$\1\$/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--[^\r\n]*/g, "")
    .replace(/'(?:''|[^'])*'/g, "");

  return /(?:^|;)\s*(?:BEGIN(?:\s+(?:WORK|TRANSACTION))?|START\s+TRANSACTION|COMMIT(?:\s+(?:WORK|TRANSACTION))?|ROLLBACK(?:\s+(?:WORK|TRANSACTION))?)\s*;/im.test(
    executableSql,
  );
}

function requireEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function git(args) {
  return execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function ensureCommitAvailable(sha) {
  try {
    execFileSync("git", ["cat-file", "-e", `${sha}^{commit}`], {
      cwd: ROOT,
      stdio: "ignore",
    });
    return;
  } catch {
    // The production checkout is intentionally shallow; fetch only the baseline.
  }

  execFileSync("git", ["fetch", "--no-tags", "--depth=1", "origin", sha], {
    cwd: ROOT,
    stdio: "inherit",
  });
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function payloadRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.result)) return payload.result;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

async function runManagementQuery({ token, projectRef, query, parameters = [] }) {
  const response = await fetch(
    `${API_ORIGIN}/v1/projects/${encodeURIComponent(projectRef)}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, parameters, read_only: false }),
    },
  );

  if (!response.ok) {
    const detail = (await response.text()).replace(/\s+/g, " ").slice(0, 600);
    throw new Error(
      `Supabase Management API rejected the demo migration query (${response.status}): ${detail}`,
    );
  }

  const text = await response.text();
  if (!text) return [];
  try {
    return payloadRows(JSON.parse(text));
  } catch {
    return [];
  }
}

async function initializeHistory(context) {
  await runManagementQuery({
    ...context,
    query: `
      CREATE SCHEMA IF NOT EXISTS ${INTERNAL_SCHEMA} AUTHORIZATION postgres;
      REVOKE ALL ON SCHEMA ${INTERNAL_SCHEMA} FROM PUBLIC, anon, authenticated;
      CREATE TABLE IF NOT EXISTS ${INTERNAL_SCHEMA}.schema_migrations (
        version text PRIMARY KEY,
        name text NOT NULL,
        checksum text NOT NULL,
        deployment_sha text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
      REVOKE ALL ON TABLE ${INTERNAL_SCHEMA}.schema_migrations
        FROM PUBLIC, anon, authenticated;
    `,
  });
}

async function getAppliedMigration(context, version) {
  const rows = await runManagementQuery({
    ...context,
    query: `
      SELECT version, name, checksum
      FROM ${INTERNAL_SCHEMA}.schema_migrations
      WHERE version = $1
    `,
    parameters: [version],
  });
  return rows[0] || null;
}

async function applyMigration(context, migration, headSha) {
  const absolutePath = path.join(ROOT, migration.path);
  const sql = readFileSync(absolutePath, "utf8");
  const checksum = createHash("sha256").update(sql).digest("hex");
  const applied = await getAppliedMigration(context, migration.version);

  if (applied) {
    if (applied.checksum !== checksum || applied.name !== migration.name) {
      throw new Error(
        `Dedicated demo migration ${migration.version} was modified after deployment.`,
      );
    }
    console.log(`Dedicated demo migration ${migration.version} already applied; skipping.`);
    return "skipped";
  }

  if (hasTopLevelTransactionControl(sql)) {
    throw new Error(
      `Dedicated demo migration ${migration.path} must not manage its own transaction.`,
    );
  }

  const query = `
    BEGIN;
    SET LOCAL lock_timeout = '10s';
    SET LOCAL statement_timeout = '120s';
    ${sql}
    INSERT INTO ${INTERNAL_SCHEMA}.schema_migrations (
      version, name, checksum, deployment_sha
    ) VALUES (
      ${sqlLiteral(migration.version)},
      ${sqlLiteral(migration.name)},
      ${sqlLiteral(checksum)},
      ${sqlLiteral(headSha)}
    );
    COMMIT;
  `;

  await runManagementQuery({ ...context, query });
  const verified = await getAppliedMigration(context, migration.version);
  if (!verified || verified.checksum !== checksum) {
    throw new Error(
      `Dedicated demo migration ${migration.version} could not be verified after execution.`,
    );
  }

  console.log(`Applied dedicated demo migration ${migration.version}_${migration.name}.`);
  return "applied";
}

export async function main() {
  const token = requireEnv("SUPABASE_ACCESS_TOKEN");
  const projectRef = requireEnv("COMMERCIAL_DEMO_PROJECT_REF");
  const baseSha = requireEnv("DEMO_MIGRATION_BASE_SHA");
  const headSha = requireEnv("DEMO_MIGRATION_HEAD_SHA");

  if (!COMMIT_SHA.test(baseSha) || !COMMIT_SHA.test(headSha)) {
    throw new Error("Demo migration base and head must be full Git commit SHAs.");
  }

  ensureCommitAvailable(baseSha);
  ensureCommitAvailable(headSha);

  const diff = git([
    "diff",
    "--name-status",
    "--diff-filter=ACDMRTUXB",
    baseSha,
    headSha,
    "--",
    MIGRATION_DIRECTORY,
  ]);
  const migrations = parseAddedDemoMigrations(diff);

  if (migrations.length === 0) {
    console.log("No dedicated commercial demo migration to apply.");
    return;
  }

  const context = { token, projectRef };
  await initializeHistory(context);

  let applied = 0;
  let skipped = 0;
  for (const migration of migrations) {
    const outcome = await applyMigration(context, migration, headSha);
    if (outcome === "applied") applied += 1;
    else skipped += 1;
  }

  console.log(
    `Dedicated commercial demo migrations complete: ${applied} applied, ${skipped} skipped.`,
  );
}

const entryPoint = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";

if (import.meta.url === entryPoint) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
