import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const excludedPathspecs = [
  ":(exclude).git/**",
  ":(exclude)node_modules/**",
  ":(exclude).pnpm-store/**",
  ":(exclude)dist/**",
  ":(exclude)dist-ssr/**",
  ":(exclude)build/**",
  ":(exclude)coverage/**",
  ":(exclude).tmp/**",
  ":(exclude)tmp/**",
  ":(exclude)tmp-screenshots/**",
  ":(exclude).vercel/**",
  ":(exclude).playwright-mcp/**",
  ":(exclude)android/.gradle/**",
  ":(exclude)android/build/**",
  ":(exclude)android/app/build/**",
  ":(exclude)ios/App/Pods/**"
];

const deny = (message) => {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: message
    }
  }));
};

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

const git = (root, args) => execFileSync(
  "git",
  ["-c", `safe.directory=${root}`, ...args],
  {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0"
    },
    stdio: ["ignore", "pipe", "pipe"]
  }
);

const root = findGitRoot(process.cwd());
if (!root) {
  deny("Snapshot avant modification impossible: aucun depot Git trouve.");
  process.exit(0);
}

const pathspecs = [".", ...excludedPathspecs];

try {
  const statusBefore = git(root, ["status", "--porcelain", "--untracked-files=normal", "--", ...pathspecs]).trim();
  if (!statusBefore) {
    process.exit(0);
  }

  git(root, ["add", "-A", "--", ...pathspecs]);

  try {
    git(root, ["diff", "--cached", "--quiet", "--", ...pathspecs]);
    process.exit(0);
  } catch (error) {
    if (error.status !== 1) {
      throw error;
    }
  }

  const timestamp = new Date().toISOString();
  git(root, [
    "commit",
    "-m",
    "chore: auto snapshot before Codex edit",
    "-m",
    `Created automatically by the Codex PreToolUse hook at ${timestamp}.`
  ]);
} catch (error) {
  const stderr = error.stderr?.toString().trim();
  const stdout = error.stdout?.toString().trim();
  const details = stderr || stdout || error.message;
  deny(`Snapshot avant modification impossible: ${details}`);
}
