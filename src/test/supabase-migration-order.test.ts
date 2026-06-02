import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATIONS_DIR = resolve(process.cwd(), "supabase/migrations");
const SCALE_READINESS_VERSION = "20260602120000";

function migrationNames() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

describe("Supabase migration ordering", () => {
  it("keeps current branch hardening migrations after the scale readiness baseline", () => {
    const names = migrationNames();
    const expectedAfterScale = [
      "20260602121000_order_acceptance_capacity_hardening.sql",
      "20260602122000_reservation_confirmation_deposit_ops.sql",
      "20260602123000_security_rpc_grants_hardening.sql",
      "20260602124000_security_abuse_monitoring_10k.sql",
    ];

    for (const name of expectedAfterScale) {
      expect(names).toContain(name);
      expect(name.slice(0, 14) > SCALE_READINESS_VERSION).toBe(true);
    }

    expect(names).not.toContain("20260602104156_order_acceptance_capacity_hardening.sql");
    expect(names).not.toContain("20260602105912_reservation_confirmation_deposit_ops.sql");
    expect(names).not.toContain("20260602111500_security_rpc_grants_hardening.sql");
    expect(names).not.toContain("20260602113925_security_abuse_monitoring_10k.sql");
  });
});
