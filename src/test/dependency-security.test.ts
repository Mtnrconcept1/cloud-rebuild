import { execFileSync } from "node:child_process";
import { it } from "vitest";

it("enforces the dependency security policy against installed packages", () => {
  execFileSync(process.execPath, ["--test", "scripts/dependabot-policy.test.mjs", "scripts/dependency-security.test.mjs"], {
    cwd: process.cwd(), encoding: "utf8", timeout: 30_000,
  });
});
