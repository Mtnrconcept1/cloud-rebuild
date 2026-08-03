import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260803150000_marketing_email_cadence.sql"),
  "utf8",
);
const bff = readFileSync(resolve(process.cwd(), "server/marketingBff.ts"), "utf8");
const view = readFileSync(
  resolve(process.cwd(), "src/components/marketing/views/MarketingAgentView.tsx"),
  "utf8",
);

describe("email sending cadence", () => {
  it("ramps a cold domain instead of asking for full volume on day one", () => {
    expect(migration).toContain("50 * power(2, LEAST(v_day, 12) - 1)");
    expect(migration).toContain("min(d.sent_at)::date");
  });

  it("anchors the ramp on the first message actually sent", () => {
    // Anchoring on the ship date would grant full volume to a domain that never
    // sent anything.
    expect(migration).toContain("WHERE d.channel = 'email' AND d.sent_at IS NOT NULL");
  });

  it("releases the day's allowance across the window rather than at its start", () => {
    expect(migration).toContain("v_elapsed");
    expect(migration).toContain("ceil(v_daily_target * GREATEST(v_elapsed, 0.05))");
  });

  it("stops on its own when bounces or complaints climb", () => {
    expect(migration).toContain("'bounce_rate_exceeded'");
    expect(migration).toContain("'complaint_rate_exceeded'");
    // Below a floor the rates are noise, not signal.
    expect(migration).toContain("IF v_recent_sent >= 50 THEN");
  });

  it("refuses to send outside the quiet-hours window", () => {
    expect(migration).toContain("'quiet_hours'");
  });

  it("spreads a batch across recipient providers", () => {
    expect(migration).toContain("PARTITION BY split_part(COALESCE(c.email_normalized, ''), '@', 2)");
    expect(migration).toContain("r.domain_rank <= v_email_domain_cap");
  });

  it("applies the cadence inside the claim, where no caller can route around it", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.claim_marketing_deliveries");
    expect(migration).toContain("FROM public.marketing_email_cadence() c");
    expect(migration).toContain("r.email_rank <= v_email_allowance");
  });

  it("leaves the non-email channels exactly as they were", () => {
    expect(migration).toContain("r.channel <> 'email'");
  });

  it("keeps every pre-existing eligibility and approval gate", () => {
    for (const gate of [
      "public.marketing_contact_is_eligible(c.id, d.channel)",
      "i.approval_status = 'approved' AND i.approved_at = d.item_approved_at",
      "c.opted_out_at IS NULL",
      "campaign.approved_at IS NOT NULL",
      "public.marketing_runtime_enabled() IS NOT TRUE",
    ]) {
      expect(migration).toContain(gate);
    }
  });

  it("exposes tunable thresholds without overwriting an operator's values", () => {
    expect(migration).toContain("'email_domain_hourly_cap', 60");
    // Existing conditions win over the defaults being merged in.
    expect(migration).toContain(") || conditions");
  });

  it("stays service-role only", () => {
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.marketing_email_cadence() FROM PUBLIC, anon, authenticated, service_role");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.marketing_email_cadence() TO service_role");
  });
});

describe("one-button launch", () => {
  it("approves through the allowlisted operations with the live session proof", () => {
    expect(bff).toContain('runOperation("admin_approve_marketing_campaign"');
    expect(bff).toContain('runOperation("admin_approve_marketing_item"');
    expect(bff).toContain("p_sid_hash: session.sessionHash");
    expect(bff).toContain("p_csrf_hash: session.csrfHash");
  });

  it("lets one refused item pass without aborting the valid ones", () => {
    expect(bff).toContain("rejected.push(itemId)");
  });

  it("treats dispatch as best-effort because the approvals are what persist", () => {
    expect(bff).toContain("dispatched = Boolean(response?.ok)");
    expect(bff).toContain(".catch(() => null)");
  });

  it("validates every identifier before touching the database", () => {
    expect(bff).toContain("itemIds.some((id) => !UUID_PATTERN.test(id))");
    expect(bff).toContain("rawItems.length > 64");
  });

  it("is reachable from the agent view as a single action", () => {
    expect(view).toContain("MARKETING_BFF_ENDPOINTS.launch");
    expect(view).toContain("Approuver et lancer la campagne");
  });
});
