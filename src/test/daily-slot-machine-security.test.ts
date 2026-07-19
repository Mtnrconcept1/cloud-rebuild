import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const edgeFunction = readFileSync("supabase/functions/daily-slot-spin/index.ts", "utf8");
const slotRules = readFileSync("supabase/functions/daily-slot-spin/rules.ts", "utf8");
const initialMigration = readFileSync("supabase/migrations/20260624223726_daily_miamz_slot_machine.sql", "utf8");
const threeAttemptsMigration = readFileSync("supabase/migrations/20260625034551_daily_slot_three_attempts.sql", "utf8");
const hardeningMigration = readFileSync("supabase/migrations/20260719103746_harden_daily_slot_idempotency.sql", "utf8");
const demoHardeningMigration = readFileSync("supabase/demo-migrations/20260719103746_harden_daily_slot_idempotency.sql", "utf8");
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
  if (/^(?:https?:|data:|blob:)/i.test(src)) return null;
  if (src.startsWith("/")) return `public${src}`;
  return `public/tok-slot-machine/${src}`;
}

function collectPrimarySlotSources() {
  const sources = new Set<string>();
  const sourcePattern = /\bsrc\s*(?:=|:)\s*["']([^"']+)["']/g;

  for (const sourceText of [slotTemplate, slotScript]) {
    for (const match of sourceText.matchAll(sourcePattern)) {
      const source = publicPathForSlotSource(match[1]);
      if (source) sources.add(source);
    }
  }

  return [...sources].sort();
}

describe("daily Miamz slot machine", () => {
  it("allows the hosted machine to be framed only by the TOK app", () => {
    const globalHeaders = vercelConfig.headers?.find((entry) => entry.source === "/(.*)")?.headers || [];
    const csp = globalHeaders.find((header) => header.key === "Content-Security-Policy")?.value || "";

    expect(component).toContain("src={SLOT_MACHINE_FRAME_SRC}");
    expect(component).toContain('sandbox="allow-scripts allow-same-origin"');
    expect(csp).toContain("frame-src 'self'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(globalHeaders.find((header) => header.key === "X-Frame-Options")?.value).toBe("SAMEORIGIN");
  });

  it("keeps random outcomes, the paytable, and loyalty credit server-side", () => {
    expect(slotRules).toContain("crypto.getRandomValues");
    expect(slotRules).toContain("SLOT_MIN_REWARD_POINTS = 3");
    expect(slotRules).toContain("The paytable is order-independent");
    expect(slotRules).not.toContain("Math.random");

    expect(edgeFunction).toContain('rpc("record_daily_slot_spin"');
    expect(edgeFunction).toContain('requireUserRole(actor, ["client"]');
    expect(edgeFunction).toContain("Forbidden: client-only reward");
    expect(edgeFunction).toContain("generateSlotSymbols()");
    expect(edgeFunction).toContain("scoreSlotSymbols(symbols)");
    expect(edgeFunction).toContain("Avoiding a preflight status query");
    expect(edgeFunction).not.toContain("Math.random");
    expect(edgeFunction).not.toContain("await req.json");

    expect(slotScript).not.toContain("paytableRules");
    expect(slotScript).not.toContain("winningSpinProbability");
    expect(slotScript).not.toContain("calculateWin");
    expect(slotScript).not.toContain("Math.random");
  });

  it("enforces three atomic and idempotent attempts per Swiss day", () => {
    expect(initialMigration).toContain("CREATE TABLE IF NOT EXISTS public.daily_slot_spins");
    expect(initialMigration).toContain("ALTER TABLE public.daily_slot_spins ENABLE ROW LEVEL SECURITY");
    expect(initialMigration).toContain("REVOKE ALL ON TABLE public.daily_slot_spins FROM anon, authenticated");

    expect(threeAttemptsMigration).toContain("CHECK (attempt_number BETWEEN 1 AND 3)");
    expect(threeAttemptsMigration).toContain("UNIQUE (user_id, spin_date, attempt_number)");
    expect(threeAttemptsMigration).toContain("pg_advisory_xact_lock");

    expect(hardeningMigration).toContain("ADD COLUMN IF NOT EXISTS request_id uuid");
    expect(hardeningMigration).toContain("daily_slot_spins_user_request_uidx");
    expect(hardeningMigration).toContain("WHERE request_id IS NOT NULL");
    expect(hardeningMigration).toContain("idempotent_replay");
    expect(hardeningMigration).toContain("hashtextextended");
    expect(hardeningMigration).toContain("auth.jwt()->>'role'");
    expect(hardeningMigration).toContain("SET search_path TO 'public', 'auth', 'pg_temp'");
    expect(hardeningMigration).toContain("TO service_role");
    expect(demoHardeningMigration).toContain("Dedicated TOK demo project");
    expect(demoHardeningMigration).toContain("daily_slot_spins_user_request_uidx");

    expect(component).toContain('"Idempotency-Key": requestId');
    expect(component).toContain("Keep the request id after an uncertain network failure");
    expect(edgeFunction).toContain('req.headers.get("Idempotency-Key")');
    expect(edgeFunction).toContain("request_id: requestId");
  });

  it("keeps the parent and iframe locked until the visual result completes", () => {
    expect(component).toContain("spinningRef.current");
    expect(component).toContain("ANIMATION_WATCHDOG_MS");
    expect(component).toContain("TOK_SLOT_ANIMATION_COMPLETE");
    expect(component).toContain("TOK_SLOT_FRAME_READY");
    expect(component).toContain("if (!nextOpen && spinningRef.current) return");
    expect(component).toContain('className="fixed inset-0 left-0 top-0 z-[1830]');
    expect(component).toContain("hideCloseButton");
    expect(component).toContain("onPointerDownOutside={(event) => event.preventDefault()}");
    expect(component).toContain("onInteractOutside={(event) => event.preventDefault()}");
    expect(component).not.toContain("z-[1400]");
    expect(component).toContain("AbortController");
    expect(component).toContain('fetchWithFreshAccessToken(SLOT_ENDPOINT, {');
    expect(component).toContain('method: "GET"');
    expect(component).toContain('method: "POST"');
    expect(component).toContain("queryClient.setQueriesData");
    expect(component).not.toContain("Math.random");
    expect(component).not.toContain("localStorage");

    expect(slotScript).toContain("TOK_SLOT_SPIN_REQUEST");
    expect(slotScript).toContain("TOK_SLOT_SPIN_RESULT");
    expect(slotScript).toContain("TOK_SLOT_ANIMATION_COMPLETE");
    expect(slotScript).toContain("TOK_SLOT_FRAME_READY");
    expect(slotScript).toContain("if (spinning || !machineEnabled) return");
  });

  it("uses a bounded compositor animation and a responsive accessible layout", () => {
    expect(slotScript).toContain("const reelCycles = 10");
    expect(slotScript).toContain("reel.animate(");
    expect(slotScript).toContain("ResizeObserver");
    expect(slotScript).toContain("DocumentFragment");
    expect(slotScript).not.toContain("motion-ghost");
    expect(slotScript).not.toContain("offsetHeight");

    expect(slotTemplate).toContain('viewport-fit=cover');
    expect(slotTemplate).toContain('id="attempts"');
    expect(slotTemplate).toContain("ordre libre");
    expect(slotTemplate).toContain("Chaque essai rapporte au minimum");
    expect(slotTemplate).toContain("@media (max-width: 680px)");
    expect(slotTemplate).toContain("@media (prefers-reduced-motion: reduce)");
    expect(slotTemplate).toContain('<script src="slot-machine.js"></script>');
    expect(slotTemplate).not.toContain('src="assets/paytable.png"');
    expect(slotTemplate).not.toContain("data:image/png;base64");
  });

  it("mounts only for eligible client users", () => {
    expect(appShell).toContain("DailyMiamzSlotMachine");
    expect(appShell).toContain("<DailyMiamzSlotMachine />");
    expect(component).toContain('role === "client"');
    expect(component).toContain("hasPrivilegedRole");
    expect(component).toContain("Trois essais quotidiens");
  });

  it("keeps primary asset paths case-exact for Vercel/Linux", () => {
    const missing = collectPrimarySlotSources().filter(
      (file) => !trackedFiles.has(file) && !existsSync(file),
    );

    expect(missing).toEqual([]);
  });
});

