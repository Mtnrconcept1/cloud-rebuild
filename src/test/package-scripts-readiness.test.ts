import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const packageJson = JSON.parse(
  readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
) as {
  packageManager?: string;
  scripts?: Record<string, string>;
};

const postEditValidator = readFileSync(
  resolve(process.cwd(), "scripts/codex-auto-post-edit-validation.mjs"),
  "utf8",
);
const supabaseDoctor = readFileSync(
  resolve(process.cwd(), "scripts/supabase-doctor.mjs"),
  "utf8",
);

describe("package scripts readiness", () => {
  it("keeps project scripts aligned with the declared pnpm package manager", () => {
    expect(packageJson.packageManager).toMatch(/^pnpm@/);

    const npmScriptCalls = Object.entries(packageJson.scripts || {})
      .filter(([, command]) => /\bnpm\s+(?:run|exec|ci|install)\b/.test(command))
      .map(([name, command]) => `${name}: ${command}`);

    expect(npmScriptCalls).toEqual([]);
    expect(postEditValidator).toContain('run(root, "pnpm", ["run", "lint"])');
    expect(postEditValidator).toContain('run(root, "pnpm", ["test"])');
    expect(supabaseDoctor).toContain("Run pnpm run supabase:target:");
    expect([postEditValidator, supabaseDoctor].join("\n")).not.toMatch(/\bnpm\s+(?:run|test|ci|install)\b/);
  });
});
