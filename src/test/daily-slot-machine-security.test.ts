import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const edgeFunction = readFileSync("supabase/functions/daily-slot-spin/index.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260624223726_daily_miamz_slot_machine.sql", "utf8");
const component = readFileSync("src/components/DailyMiamzSlotMachine.tsx", "utf8");
const appShell = readFileSync("src/App.tsx", "utf8");
const styles = readFileSync("src/index.css", "utf8");

describe("daily Miamz slot machine", () => {
  it("keeps the random result and crediting path server-side", () => {
    expect(edgeFunction).toContain("crypto.getRandomValues");
    expect(edgeFunction).toContain("crypto.randomUUID");
    expect(edgeFunction).toContain('rpc("record_daily_slot_spin"');
    expect(edgeFunction).toContain("requireUserRole(actor, [\"client\"]");
    expect(edgeFunction).toContain("Forbidden: client-only reward");
    expect(edgeFunction).not.toContain("Math.random");
    expect(edgeFunction).not.toContain("await req.json");
  });

  it("enforces one spin per client per Swiss day in Supabase", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.daily_slot_spins");
    expect(migration).toContain("CONSTRAINT daily_slot_spins_once_per_user_day UNIQUE (user_id, spin_date)");
    expect(migration).toContain("ALTER TABLE public.daily_slot_spins ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("FOR SELECT\n  TO authenticated\n  USING (auth.uid() = user_id)");
    expect(migration).toContain("REVOKE ALL ON TABLE public.daily_slot_spins FROM anon, authenticated");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.record_daily_slot_spin");
    expect(migration).toContain("TO service_role");
    expect(migration).toContain("'daily_slot_spin'");
    expect(migration).toContain("loyalty_points = COALESCE(public.profiles.loyalty_points, 0) + EXCLUDED.loyalty_points");
  });

  it("mounts only for client users and checks server availability at each eligible connection", () => {
    expect(appShell).toContain("DailyMiamzSlotMachine");
    expect(appShell).toContain("<DailyMiamzSlotMachine />");
    expect(component).toContain('role !== "client"');
    expect(component).toContain("hasPrivilegedRole");
    expect(component).toContain("fetchWithFreshAccessToken(SLOT_ENDPOINT, { method: \"GET\" })");
    expect(component).toContain("fetchWithFreshAccessToken(SLOT_ENDPOINT, { method: \"POST\" })");
    expect(component).toContain("Affichee a chaque connexion client eligible");
    expect(component).not.toContain("localStorage");
  });

  it("keeps slot display text readable with a marquee screen", () => {
    expect(component).toContain("ScreenMarquee");
    expect(component).toContain("tok-slot-marquee-track");
    expect(styles).toContain("@keyframes tok-slot-marquee");
    expect(styles).toContain(".tok-slot-marquee-track");
  });
});
