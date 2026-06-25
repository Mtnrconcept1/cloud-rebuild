import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const edgeFunction = readFileSync("supabase/functions/daily-slot-spin/index.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260624223726_daily_miamz_slot_machine.sql", "utf8");
const component = readFileSync("src/components/DailyMiamzSlotMachine.tsx", "utf8");
const slotTemplate = readFileSync("public/tok-slot-machine/index.html", "utf8");
const appShell = readFileSync("src/App.tsx", "utf8");

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
    expect(component).toContain('src={SLOT_MACHINE_FRAME_SRC}');
    expect(component).toContain('sandbox="allow-scripts allow-same-origin"');
    expect(component).not.toContain("Math.random");
    expect(component).not.toContain("localStorage");
  });

  it("reuses the provided TOK slot HTML while delegating spins to the server bridge", () => {
    expect(slotTemplate).toContain('<section class="slot-wrap" aria-label="Machine à sous TOK">');
    expect(slotTemplate).toContain('<div class="slot-machine" id="slotMachine">');
    expect(slotTemplate).toContain('<aside class="side-paytable" aria-label="Tableau des gains TOK">');
    expect(slotTemplate).toContain('src="assets/paytable.png"');
    expect(slotTemplate).not.toContain("data:image/png;base64");
    expect(slotTemplate).toContain("TOK_SLOT_SPIN_REQUEST");
    expect(slotTemplate).toContain("TOK_SLOT_SPIN_RESULT");
    expect(slotTemplate).toContain("interceptSpin");
    expect(slotTemplate).toContain("interceptKeyboardSpin");
    expect(slotTemplate).toContain("window.spin = postSpinRequest");
    expect(slotTemplate).toContain("Tirage sécurisé — résultat calculé côté serveur TOK.");
  });
});
