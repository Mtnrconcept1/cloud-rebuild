import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";
it("enforces the actual Edge runtime reliability contract without external writes", () => {
  const output = execFileSync(process.execPath, ["--test", "scripts/tok-runtime-regression.test.cjs"], { cwd: process.cwd(), encoding: "utf8", timeout: 30_000 });
  expect(output).toContain("# fail 0");
}, 35_000);
