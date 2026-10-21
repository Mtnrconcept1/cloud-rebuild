import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migration = readFileSync(
  resolve(root, "supabase/migrations/20261021100000_marketing_campaign_approval_schedules_items.sql"),
  "utf8",
);
const operations = readFileSync(resolve(root, "src/marketing/useMarketingOperations.ts"), "utf8");
const campaignsView = readFileSync(
  resolve(root, "src/components/marketing/views/MarketingCampaignsView.tsx"),
  "utf8",
);

describe("marketing campaign approval cascade", () => {
  it("approves and schedules attached non-terminal calendar items transactionally", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.admin_approve_marketing_campaign");
    expect(migration).toContain("PERFORM public.admin_approve_marketing_item(");
    expect(migration).toContain("v_item.scheduled_at + v_schedule_shift");
    expect(migration).toContain("approval_status <> 'approved' OR i.status = 'draft'");
    expect(migration).toContain("status IN ('draft','paused')");
    expect(migration).toContain("THEN 'scheduled'");
    expect(migration).toContain("scheduled_item_count");
  });

  it("moves an overdue campaign forward instead of leaving posts in draft", () => {
    expect(migration).toContain("clock_timestamp() + interval '3 minutes'");
    expect(migration).toContain("v_schedule_floor - v_min_item_schedule");
  });

  it("tells the operator that campaign approval schedules its publications", () => {
    expect(operations).not.toContain("Ses éléments restent à approuver et planifier individuellement");
    expect(operations).toContain("Les publications associées sont approuvées automatiquement");
    expect(campaignsView).toContain("approuve et planifie automatiquement ses publications");
  });
});
