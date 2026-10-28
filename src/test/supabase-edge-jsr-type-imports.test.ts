import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const edgeRoot = "supabase/functions";
const problematicImport = "jsr:@supabase/functions-js/edge-runtime.d.ts";

describe("Supabase Edge Function deployment dependencies", () => {
  it("does not fetch a type-only JSR package during production bundling", () => {
    const importers = readdirSync(edgeRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== "_shared")
      .map((entry) => `${edgeRoot}/${entry.name}/index.ts`)
      .filter((file) => existsSync(file))
      .filter((file) => readFileSync(file, "utf8").includes(problematicImport));

    expect(importers).toEqual([]);
  });
});
