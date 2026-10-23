import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const COMMANDS = [
  { label: "Lint", args: ["run", "lint"] },
  { label: "Typecheck", args: ["run", "typecheck"] },
  { label: "Tests", args: ["run", "test"] },
  { label: "Build production", args: ["run", "build:prod"] },
];

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

function boundedInteger(value, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`invalid_integer:${minimum}-${maximum}`);
  }
  return parsed;
}

function redact(value) {
  return String(value || "")
    .replace(/\b(?:sk|sbp|ghp|github_pat)_[A-Za-z0-9_-]{12,}\b/g, "[TOKEN_REDACTED]")
    .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s]+/gi, "$1[TOKEN_REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "[JWT_REDACTED]");
}

function readReport(path) {
  try {
    const value = JSON.parse(readFileSync(path, "utf8"));
    if (value && typeof value === "object" && Array.isArray(value.attempts)) return value;
  } catch {
    // A missing report is expected on the first attempt.
  }
  return { version: 1, attempts: [] };
}

function writeJsonAtomic(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temporary, path);
}

const attempt = boundedInteger(option("--attempt"), 1, 3);
const logPath = resolve(option("--log"));
const reportJsonPath = resolve(option("--report-json"));
const reportMarkdownPath = resolve(option("--report-markdown"));
const startedAt = new Date();
const results = [];
const logSections = [];

mkdirSync(dirname(logPath), { recursive: true });
mkdirSync(dirname(reportMarkdownPath), { recursive: true });

for (const command of COMMANDS) {
  const commandStartedAt = Date.now();
  const executable = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const result = spawnSync(executable, command.args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      CI: "true",
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || "https://example.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY:
        process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "ci-public-placeholder",
      VITE_SUPABASE_ANON_KEY:
        process.env.VITE_SUPABASE_ANON_KEY || "ci-public-placeholder",
    },
    encoding: "utf8",
    timeout: 20 * 60 * 1000,
    maxBuffer: 8 * 1024 * 1024,
  });
  const output = redact(`${result.stdout || ""}\n${result.stderr || ""}`).slice(-180_000);
  const timedOut = result.error?.code === "ETIMEDOUT";
  const exitCode = typeof result.status === "number" ? result.status : 1;
  const status = exitCode === 0 && !timedOut ? "passed" : "failed";
  const durationMs = Date.now() - commandStartedAt;

  results.push({
    command: `pnpm ${command.args.join(" ")}`,
    label: command.label,
    status,
    exit_code: exitCode,
    timed_out: timedOut,
    duration_ms: durationMs,
  });
  logSections.push(
    `## ${command.label}\nCommand: pnpm ${command.args.join(" ")}\nStatus: ${status}\nExit: ${exitCode}\n\n${output}`,
  );
}

const completedAt = new Date();
const passed = results.every((result) => result.status === "passed");
writeFileSync(
  logPath,
  `${logSections.join("\n\n")}\n`,
  { encoding: "utf8", mode: 0o600 },
);

const report = readReport(reportJsonPath);
report.attempts.push({
  attempt,
  started_at: startedAt.toISOString(),
  completed_at: completedAt.toISOString(),
  status: passed ? "passed" : "failed",
  checks: results,
});
report.completed = passed;
report.completed_attempt = passed ? attempt : null;
writeJsonAtomic(reportJsonPath, report);

const markdown = [
  `\n## Cycle ${attempt} — ${passed ? "validation complète réussie" : "anomalies persistantes"}`,
  "",
  `- Début : ${startedAt.toISOString()}`,
  `- Fin : ${completedAt.toISOString()}`,
  `- Résultat : ${passed ? "réussi" : "échec — nouvelle analyse requise"}`,
  "",
  "| Contrôle | Résultat | Durée |",
  "| --- | --- | ---: |",
  ...results.map(
    (result) =>
      `| \`${result.command}\` | ${result.status === "passed" ? "réussi" : "échec"} | ${Math.round(result.duration_ms / 1000)} s |`,
  ),
  "",
].join("\n");
writeFileSync(reportMarkdownPath, markdown, { encoding: "utf8", flag: "a" });

if (!passed) process.exitCode = 1;
