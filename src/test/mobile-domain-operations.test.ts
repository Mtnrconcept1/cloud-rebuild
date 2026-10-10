import { execFileSync } from "node:child_process";
import { it } from "vitest";

it("guards production mobile domain changes and rollback", () => {
  execFileSync(process.execPath, ["--test", "scripts/reconcile-mobile-apex-domain.test.mjs"], {
    cwd: process.cwd(), encoding: "utf8", timeout: 30_000,
  });
});
