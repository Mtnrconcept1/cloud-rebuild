import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");

describe("business wiring audit", () => {
  it("connects every critical domain to its schema, RPCs and Edge Functions", () => {
    const output = execFileSync(process.execPath, ["scripts/business-wiring-audit.mjs"], {
      cwd: root,
      encoding: "utf8",
    });

    expect(output).toContain("12 domaines contrôlés, 0 anomalie(s).");
  });
});
