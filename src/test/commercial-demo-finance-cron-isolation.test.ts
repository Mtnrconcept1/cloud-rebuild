import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("dedicated demo finance cron isolation", () => {
  it("disables every demo cron that can reach live Stripe without touching production jobs", () => {
    const sql = readFileSync(
      path.join(
        process.cwd(),
        "supabase",
        "migrations",
        "20260726023000_disable_demo_live_finance_crons.sql",
      ),
      "utf8",
    );

    expect(sql).toContain("hzldfhjfgjcadmpghhhf.supabase.co/functions/v1");
    expect(sql).toContain("v_demo_count NOT IN (0, 4)");
    expect(sql).toContain("cron.alter_job(job_id := v_job.jobid, active := false)");
    expect(sql).toContain("tok-reconcile-paid-order-checkouts");
    expect(sql).toContain("tok-reconcile-match-group-authorizations");
    expect(sql).toContain("tok-capture-due-match-groups");
    expect(sql).toContain("restaurant-subscription-activation-worker");
    expect(sql).toContain("process-subscription-activations");
    expect(sql).not.toContain("STRIPE_SECRET_KEY");
    expect(sql).not.toContain("cron.unschedule");
  });
});
