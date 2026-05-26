import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const findGitRoot = (startDir) => {
  let current = path.resolve(startDir);

  while (true) {
    if (existsSync(path.join(current, ".git"))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
};

const run = (root, command, args) => {
  try {
    const output = execFileSync(command, args, {
      cwd: root,
      encoding: "utf8",
      shell: process.platform === "win32",
      env: {
        ...process.env,
        CI: process.env.CI || "1"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });

    return { ok: true, output };
  } catch (error) {
    return {
      ok: false,
      output: [
        error.stdout?.toString() || "",
        error.stderr?.toString() || "",
        error.message || ""
      ].join("\n").trim()
    };
  }
};

const compact = (text) => {
  const clean = text.replace(/\r/g, "").trim();
  if (clean.length <= 4000) {
    return clean;
  }

  return `${clean.slice(0, 1800)}\n\n...\n\n${clean.slice(-1800)}`;
};

const root = findGitRoot(process.cwd());
if (!root) {
  process.stdout.write(JSON.stringify({
    decision: "block",
    reason: "Validation apres modification impossible: aucun depot Git trouve."
  }));
  process.exit(0);
}

const logDir = path.join(root, ".tmp", "codex-hooks");
mkdirSync(logDir, { recursive: true });

const lint = run(root, "npm", ["run", "lint"]);
const test = run(root, "npm", ["test"]);

const report = [
  "# Codex post-edit validation",
  "",
  "## npm run lint",
  lint.ok ? "PASS" : "FAIL",
  "",
  lint.output.trim(),
  "",
  "## npm test",
  test.ok ? "PASS" : "FAIL",
  "",
  test.output.trim()
].join("\n");

writeFileSync(path.join(logDir, "last-post-edit-validation.log"), report, "utf8");

if (!lint.ok || !test.ok) {
  const failed = [
    !lint.ok ? "npm run lint" : null,
    !test.ok ? "npm test" : null
  ].filter(Boolean).join(" et ");

  process.stdout.write(JSON.stringify({
    decision: "block",
    reason: `${failed} a echoue apres modification. Voir .tmp/codex-hooks/last-post-edit-validation.log.`,
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext: compact(report)
    }
  }));
}
