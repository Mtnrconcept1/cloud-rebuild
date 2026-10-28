import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The Deno Edge runtime already supplies Deno.serve and Deno.env. Importing
// functions-js solely for its .d.ts file makes every remote bundle depend on
// jsr.io availability, despite needing no JavaScript from that package.
const functionRoot = fileURLToPath(new URL("../../supabase/functions/", import.meta.url));
const guardedSlugs = [
  "admin-demo-entities",
  "commercial-demo-checkout",
  "process-reservation-cancellation-fees",
  "provision-commercial-demo-logins",
  "provision-commercial-demo-project-session",
  "stripe-setup",
  "stripe-subscription-reconcile",
  "stripe-worker",
] as const;
const unnecessaryTypeImport = "jsr:@supabase/functions-js/edge-runtime.d.ts";

describe("Supabase Edge Function type-only bundling", () => {
  it("does not fetch a JSR type-only dependency during a production bundle", () => {
    const affected = readdirSync(functionRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== "_shared")
      .filter((entry) => {
        try {
          return readFileSync(join(functionRoot, entry.name, "index.ts"), "utf8").includes(unnecessaryTypeImport);
        } catch {
          return false;
        }
      })
      .map((entry) => entry.name);
    expect(affected).toEqual([]);
  });

  it("preserves the same Deno.serve handlers for all corrected slugs", () => {
    for (const slug of guardedSlugs) {
      const source = readFileSync(join(functionRoot, slug, "index.ts"), "utf8");
      expect(source).toContain("Deno.serve(");
      expect(source).not.toContain(unnecessaryTypeImport);
      // These slugs don't use Supabase.ai, which is what functions-js provides type hints for.
      expect(source).not.toContain("Supabase.ai.");
    }
  });
});
