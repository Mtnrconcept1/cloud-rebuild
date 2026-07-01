import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const edgeFunction = readFileSync("supabase/functions/daily-slot-spin/index.ts", "utf8");
const initialMigration = readFileSync("supabase/migrations/20260624223726_daily_miamz_slot_machine.sql", "utf8");
const threeAttemptsMigration = readFileSync("supabase/migrations/20260625034551_daily_slot_three_attempts.sql", "utf8");
const component = readFileSync("src/components/DailyMiamzSlotMachine.tsx", "utf8");
const slotTemplate = readFileSync("public/tok-slot-machine/index.html", "utf8");
const slotScriptPath = "public/tok-slot-machine/slot-machine.js";
const slotScript = existsSync(slotScriptPath) ? readFileSync(slotScriptPath, "utf8") : "";
const appShell = readFileSync("src/App.tsx", "utf8");
const vercelConfig = JSON.parse(readFileSync("vercel.json", "utf8")) as {
  headers?: Array<{ source?: string; headers?: Array<{ key?: string; value?: string }> }>;
};
const trackedFiles = new Set(
  execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean)
    .map((file) => file.replace(/\\/g, "/")),
);

function publicPathForSlotSource(src: string) {
  if (/^(?:https?:|data:|blob:)/i.test(src)) {
    return null;
  }

  if (src.startsWith("/")) {
    return `public${src}`;
  }

  return `public/tok-slot-machine/${src}`;
}

function collectPrimarySlotSources() {
  const sources = new Set<string>();
  const sourcePattern = /\bsrc\s*(?:=|:)\s*["']([^"']+)["']/g;

  for (const sourceText of [slotTemplate, slotScript]) {
    for (const match of sourceText.matchAll(sourcePattern)) {
      const source = publicPathForSlotSource(match[1]);
      if (source) {
        sources.add(source);
      }
    }
  }

  return [...sources].sort();
}

describe("daily Miamz slot machine", () => {
  it("allows the hosted slot machine to be framed by the TOK app only", () => {
    const globalHeaders = vercelConfig.headers?.find((entry) => entry.source === "/(.*)")?.headers || [];
    const csp = globalHeaders.find((header) => header.key === "Content-Security-Policy")?.value || "";

    expect(component).toContain('src={SLOT_MACHINE_FRAME_SRC}');
    expect(component).toContain('sandbox="allow-scripts allow-same-origin"');
    expect(csp).toContain("frame-src 'self'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).not.toContain("frame-ancestors 'none'");
    expect(globalHeaders.find((header) => header.key === "X-Frame-Options")?.value).toBe("SAMEORIGIN");
  });

  it("keeps the random result and crediting path server-side", () => {
    expect(edgeFunction).toContain("crypto.getRandomValues");
    expect(edgeFunction).toContain("crypto.randomUUID");
    expect(edgeFunction).toContain('rpc("record_daily_slot_spin"');
    expect(edgeFunction).toContain("requireUserRole(actor, [\"client\"]");
    expect(edgeFunction).toContain("Forbidden: client-only reward");
    expect(edgeFunction).toContain("SLOT_MAX_ATTEMPTS_PER_DAY = 3");
    expect(edgeFunction).toContain("High-value symbols intentionally have lower weights");
    expect(edgeFunction).toContain("attemptsRemaining");
    expect(edgeFunction).not.toContain("Math.random");
    expect(edgeFunction).not.toContain("await req.json");
  });

  it("enforces three server-recorded attempts per client per Swiss day in Supabase", () => {
    expect(initialMigration).toContain("CREATE TABLE IF NOT EXISTS public.daily_slot_spins");
    expect(initialMigration).toContain("ALTER TABLE public.daily_slot_spins ENABLE ROW LEVEL SECURITY");
    expect(initialMigration).toContain("FOR SELECT\n  TO authenticated\n  USING (auth.uid() = user_id)");
    expect(initialMigration).toContain("REVOKE ALL ON TABLE public.daily_slot_spins FROM anon, authenticated");
    expect(threeAttemptsMigration).toContain("DROP CONSTRAINT IF EXISTS daily_slot_spins_once_per_user_day");
    expect(threeAttemptsMigration).toContain("attempt_number integer NOT NULL DEFAULT 1");
    expect(threeAttemptsMigration).toContain("CHECK (attempt_number BETWEEN 1 AND 3)");
    expect(threeAttemptsMigration).toContain("UNIQUE (user_id, spin_date, attempt_number)");
    expect(threeAttemptsMigration).toContain("pg_advisory_xact_lock");
    expect(threeAttemptsMigration).toContain("v_max_attempts integer := 3");
    expect(threeAttemptsMigration).toContain("GRANT EXECUTE ON FUNCTION public.record_daily_slot_spin");
    expect(threeAttemptsMigration).toContain("TO service_role");
    expect(threeAttemptsMigration).toContain("'daily_slot_spin'");
    expect(threeAttemptsMigration).toContain("loyalty_points = COALESCE(public.profiles.loyalty_points, 0) + EXCLUDED.loyalty_points");
  });

  it("mounts only for client users and checks server availability at each eligible connection", () => {
    expect(appShell).toContain("DailyMiamzSlotMachine");
    expect(appShell).toContain("<DailyMiamzSlotMachine />");
    expect(component).toContain('role !== "client"');
    expect(component).toContain("hasPrivilegedRole");
    expect(component).toContain("fetchWithFreshAccessToken(SLOT_ENDPOINT, { method: \"GET\" })");
    expect(component).toContain("fetchWithFreshAccessToken(SLOT_ENDPOINT, { method: \"POST\" })");
    expect(component).toContain("Affichee a chaque connexion client eligible");
    expect(component).toContain("Le credit reste limite a trois essais par jour par Supabase.");
    expect(component).toContain("attemptsRemaining");
    expect(component).toContain("DialogClose");
    expect(component).toContain("src={SLOT_MACHINE_FRAME_SRC}");
    expect(component).toContain('sandbox="allow-scripts allow-same-origin"');
    expect(component).not.toContain("Math.random");
    expect(component).not.toContain("localStorage");
  });

  it("reuses the provided TOK slot HTML while delegating spins to the server bridge", () => {
    expect(slotTemplate).toContain("slot-wrap");
    expect(slotTemplate).toContain('<div class="slot-machine" id="slotMachine">');
    expect(slotTemplate).toContain("side-paytable");
    expect(slotTemplate).toContain('src="assets/paytable.png"');
    expect(slotTemplate).toContain('src="/logotok.png"');
    expect(slotTemplate).not.toContain("assets/logotok.png");
    expect(slotTemplate).toContain('<script src="slot-machine.js"></script>');
    expect(slotTemplate).not.toContain("<script>\n");
    expect(slotScript).toContain('src: "assets/Livreur.png"');
    expect(slotScript).not.toContain('src: "assets/livreur.png"');
    expect(slotTemplate).not.toContain("data:image/png;base64");
    expect(slotScript).toContain("TOK_SLOT_SPIN_REQUEST");
    expect(slotScript).toContain("TOK_SLOT_SPIN_RESULT");
    expect(slotScript).toContain("interceptSpin");
    expect(slotScript).toContain("interceptKeyboardSpin");
    expect(slotScript).toContain("window.spin = postSpinRequest");
    expect(slotScript).toContain('spinButton.addEventListener("click", interceptSpin)');
    expect(slotScript).toContain('leverHandle.addEventListener("click", interceptSpin)');
    expect(slotScript).toContain("Tirage sécurisé");
    expect(slotScript).toContain("formatAttempts");
    expect(slotScript).toContain("Vos 3 essais du jour sont terminés");
  });

  it("keeps primary slot-machine asset paths case-exact for Vercel/Linux", () => {
    const missing = collectPrimarySlotSources().filter((file) => !trackedFiles.has(file) && !existsSync(file));

    expect(missing).toEqual([]);
  });
});
