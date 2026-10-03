import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";
it("enforces migration and route delivery regression guards", () => {
  const output = execFileSync(process.execPath, ["--test", "scripts/tok-deployment-regression.test.mjs"], { cwd: process.cwd(), encoding: "utf8", timeout: 30_000 });
  expect(output).toContain("# fail 0");
}, 35_000);
