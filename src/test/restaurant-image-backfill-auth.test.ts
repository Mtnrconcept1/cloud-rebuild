import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  ".github/workflows/restaurant-image-truth-backfill.yml",
  "utf8",
);

describe("restaurant image backfill authentication", () => {
  it("resolves the production service role through the Supabase management token", () => {
    expect(workflow).toContain("SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}");
    expect(workflow).toContain("SUPABASE_PROJECT_REF: wwcrtyoueexyxkkikaos");
    expect(workflow).toContain("write-production-supabase-keys-env.mjs");
    expect(workflow).toContain("/api-keys?reveal=true");
    expect(workflow).not.toContain(
      "SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}",
    );
  });
});
