// @vitest-environment node
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("TOK audit security and fulfillment regressions", () => {
  it("runs the isolated real-handler regression suite without production access", () => {
    const output = execFileSync(process.execPath, [
      "--test",
      "--test-reporter=tap",
      "scripts/tok-audit-reliability.test.mjs",
    ], {
      cwd: resolve(process.cwd()),
      encoding: "utf8",
      timeout: 60_000,
      maxBuffer: 2 * 1024 * 1024,
    });
    expect(output).toMatch(/^# tests [1-9][0-9]*$/m);
    expect(output).toMatch(/^# fail 0$/m);
  }, 65_000);
});
