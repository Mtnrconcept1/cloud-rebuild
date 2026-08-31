import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260831043504_public_geneva_restaurant_directory.sql"),
  "utf8",
);

describe("public directory migration preview postflight", () => {
  it("keeps production completeness strict only when the prospect catalog is populated", () => {
    expect(migration).toContain("v_source_count integer");
    expect(migration).toContain("v_source_count > 0 AND v_candidates <> v_covered");
    expect(migration).toContain("v_source_count >= 4000 AND v_directory < 4000");
  });

  it("always keeps safety and excluded-category guards enabled", () => {
    expect(migration).toContain("IF v_unsafe <> 0 THEN");
    expect(migration).toContain("IF v_excluded <> 0 THEN");
  });
});
