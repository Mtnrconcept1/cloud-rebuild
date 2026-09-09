import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migration = readFileSync(
  resolve(root, "supabase/migrations/20260909025200_optimize_observability_maintenance.sql"),
  "utf8",
);

describe("observability maintenance performance guards", () => {
  it("indexes hot paths without assuming ownership of Supabase extension tables", () => {
    expect(migration).toContain("idx_cron_job_run_details_start_time");
    expect(migration).toContain("ON cron.job_run_details (start_time)");
    expect(migration).toContain("pg_has_role(current_user, v_cron_owner, 'MEMBER')");
    expect(migration).toContain("pg_get_userbyid(v_cron_owner)");
    expect(migration).toContain("Skipping cron.job_run_details index");
    expect(migration).toContain("idx_audit_log_created_at_id_desc");
    expect(migration).toContain("ON public.audit_log (created_at DESC, id DESC)");
    expect(migration).toContain("idx_net_http_response_id");
    expect(migration).toContain("ON net._http_response (id)");
    expect(migration).toContain("pg_has_role(current_user, v_net_owner, 'MEMBER')");
    expect(migration).toContain("pg_get_userbyid(v_net_owner)");
    expect(migration).toContain("Skipping net._http_response index");
  });

  it("keeps maintenance deletes bounded and lowers cache-retention churn", () => {
    expect(migration).toContain("retention-cron-job-run-details-14d");
    expect(migration).toContain("retention-edge-function-audit-logs-30d");
    expect(migration).toContain("retention-net-http-response-7d");
    expect(migration).toContain("tok-net-http-response-cache-retention");
    expect(migration.match(/LIMIT 5000/g)?.length).toBeGreaterThanOrEqual(4);
    expect(migration).toContain("'37 * * * *'");
  });

  it("keeps the sync RPC service-role only and caps batch size", () => {
    expect(migration).toContain("LEAST(GREATEST(COALESCE(p_limit, 2000), 1), 10000)");
    expect(migration).toContain("REVOKE EXECUTE ON FUNCTION public.sync_net_http_response_cache(integer)");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.sync_net_http_response_cache(integer)");
    expect(migration).toContain("TO service_role");
  });

  it("drops only the verified redundant twins", () => {
    expect(migration).toContain("DROP INDEX IF EXISTS public.group_member_orders_group_status_idx");
    expect(migration).toContain("DROP INDEX IF EXISTS public.order_items_order_id_idx");
    expect(migration).toContain("DROP INDEX IF EXISTS public.idx_orders_pending_payment_created_at");
    expect(migration).toContain("DROP INDEX IF EXISTS public.social_post_promotions_campaign_idx");
    expect(migration).not.toContain("DROP INDEX IF EXISTS public.idx_group_member_orders_group_status_payment");
    expect(migration).not.toContain("DROP INDEX IF EXISTS public.idx_orders_pending_payment_watchdog");
    expect(migration).not.toContain("DROP INDEX IF EXISTS public.idx_social_post_promotions_campaign_id");
  });
});
