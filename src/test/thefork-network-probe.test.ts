import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("temporary TheFork extraction probe", () => {
  it("prints the public route diagnostics", () => {
    const output = execFileSync("python3", ["scripts/thefork_probe.py"], {
      encoding: "utf8",
      timeout: 360_000,
      maxBuffer: 10 * 1024 * 1024,
    });

    console.error(`THEFORK_PROBE_OUTPUT=${output}`);
    expect(output).toContain("thefork.ch");
  }, 380_000);
});
