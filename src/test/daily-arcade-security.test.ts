import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20261029053000_daily_tok_arcade_rotation.sql", "utf8");
const arcade = readFileSync("supabase/functions/daily-arcade-play/index.ts", "utf8");
const slot = readFileSync("supabase/functions/daily-slot-spin/index.ts", "utf8");
const selector = readFileSync("src/components/DailyTokArcade.tsx", "utf8");
const app = readFileSync("src/App.tsx", "utf8");
const config = readFileSync("supabase/config.toml", "utf8");
const vercel = readFileSync("vercel.json", "utf8");

describe("TOK daily arcade rotation and Miamz safeguards", () => {
  it("assigns only one game per user and Swiss calendar day", () => {
    expect(sql).toContain("PRIMARY KEY (user_id, play_date)");
    expect(sql).toContain("get_or_assign_daily_arcade_game");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("FROM public.daily_slot_spins");
    expect(sql).toContain("v_game := 'slot'");
    expect(arcade).toContain('const ZONE = "Europe/Zurich"');
    expect(arcade).toContain("assignedGame(actor, playDate)");
    expect(app).toContain("<DailyTokArcade />");
    expect(app).not.toContain("WelcomePlinko");
    expect(selector).toContain('role === "client"');
    expect(selector).toContain("status.attemptsUsed > 0");
  });

  it("rejects privileged users, client-created payout amounts, and replays", () => {
    expect(arcade).toContain('requireUserRole(actor, ["client"]');
    expect(arcade).toContain("Forbidden: client-only reward");
    expect(arcade).toContain("const reward = game ===");
    expect(arcade).toContain("crypto.getRandomValues");
    expect(arcade).not.toContain("Math.random");
    expect(arcade).not.toContain("body.rewardPoints");
    expect(arcade).toContain("Idempotency-Key");
    expect(sql).toContain("UNIQUE (user_id, request_id)");
    expect(sql).toContain("v_replay := true");
    expect(sql).toContain("v_used >= 3");
    expect(sql).toContain("record_daily_arcade_attempt");
    expect(sql).toContain("INSERT INTO public.loyalty_transactions");
    expect(sql).toContain("ON CONFLICT(user_id) DO UPDATE SET");
    expect(sql).toContain("reward_points BETWEEN 0 AND 10");
  });

  it("locks the other two games whenever slots were selected", () => {
    expect(slot).toContain("get_or_assign_daily_arcade_game");
    expect(slot).toContain('assignedGame !== "slot"');
    expect(slot).toContain("Another TOK game is selected for today");
    expect(arcade).toContain('game === "slot"');
    expect(arcade).toContain("Use the secure daily slot endpoint");
  });

  it("uses RLS, own-user read policies and privileged transaction writes", () => {
    expect(sql).toContain("ALTER TABLE public.daily_arcade_days ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("ALTER TABLE public.daily_arcade_attempts ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id)");
    expect(sql).toContain("REVOKE ALL ON TABLE public.daily_arcade_days");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.record_daily_arcade_attempt");
    expect(sql).toContain("FROM PUBLIC, anon, authenticated");
    expect(sql).toContain("TO service_role");
    expect(config).toContain("[functions.daily-arcade-play]");
    expect(config).toContain("verify_jwt = false");
  });

  it("keeps the claw iframe pinned to its own origin and bounds prizes", () => {
    expect(selector).toContain('const CLAW_ORIGIN = "https://tok-miamz-claw-arcade.vercel.app"');
    expect(selector).toContain("event.origin !== CLAW_ORIGIN");
    expect(selector).toContain("event.source !== frame.current?.contentWindow");
    expect(selector).toContain('sandbox="allow-scripts allow-same-origin"');
    expect(selector).toContain('data.type !== "TOK_CLAW_RESULT"');
    expect(selector).toContain("seenClawAttempts");
    expect(selector).toContain("attemptsLeft <= 0");
    expect(vercel).toContain("frame-src 'self' https://tok-miamz-claw-arcade.vercel.app");
  });
});
