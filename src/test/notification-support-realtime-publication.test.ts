import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261011052254_notification_support_realtime_publication.sql"),
  "utf8",
);

describe("support notification publication", () => {
  it("covers all four realtime sources", () => {
    for (const table of [
      "support_incidents",
      "support_incident_messages",
      "ai_support_tickets",
      "ai_messages",
    ]) {
      expect(migration).toContain(table);
    }
    expect(migration).toContain("ALTER PUBLICATION supabase_realtime ADD TABLE");
    expect(migration).toContain("pg_publication_tables");
  });

  it("requires authenticated read policies before enabling realtime", () => {
    expect(migration).toContain("c.relrowsecurity");
    expect(migration).toContain("policy.permissive = 'PERMISSIVE'");
    expect(migration).toContain("has_table_privilege");
    expect(migration).not.toContain("DISABLE ROW LEVEL SECURITY");
  });
});
