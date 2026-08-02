import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260802171847_grant_rbarman_marketing_admin.sql"),
  "utf8",
);

describe("rbarman Marketing Operations access migration", () => {
  it("grants the admin role required by the marketing BFF without creating auth users", () => {
    expect(migration).toContain("rbarman@hotmail.ch");
    expect(migration).toContain("INSERT INTO public.user_roles (user_id, role)");
    expect(migration).toContain("'admin'::public.app_role");
    expect(migration).toContain("ON CONFLICT (user_id, role) DO NOTHING");
    expect(migration).not.toMatch(/INSERT\s+INTO\s+auth\.users/i);
    expect(migration).not.toMatch(/UPDATE\s+auth\.users/i);
    expect(migration).not.toMatch(/DELETE\s+FROM/i);
  });
});
