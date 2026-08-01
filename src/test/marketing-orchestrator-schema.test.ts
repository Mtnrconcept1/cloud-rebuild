import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260801190000_marketing_operations_center.sql"),
  "utf8",
);

describe("marketing operations schema", () => {
  it("creates the seven isolated marketing tables with RLS", () => {
    for (const table of [
      "marketing_campaigns",
      "marketing_calendar_items",
      "marketing_contacts",
      "marketing_deliveries",
      "marketing_events",
      "marketing_automations",
      "marketing_integrations",
    ]) {
      expect(migration).toContain(`CREATE TABLE IF NOT EXISTS public.${table}`);
      expect(migration).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
      expect(migration).toContain(`REVOKE ALL ON public.${table} FROM anon, authenticated`);
    }
  });

  it("starts paused, preserves the feature kill-switch and blocks external providers", () => {
    expect(migration).toMatch(/status text NOT NULL DEFAULT 'paused'/);
    expect(migration).toContain("\"global_pause\":true");
    expect(migration).toContain("ON CONFLICT (name) DO UPDATE SET");
    expect(migration).not.toMatch(/ON CONFLICT \(name\) DO UPDATE SET[\s\S]{0,180}is_active\s*=/);
    expect(migration).toContain("('resend', 'Resend', 'email', 'blocked_configuration'");
    expect(migration).toContain("('firebase', 'Firebase Cloud Messaging', 'push', 'blocked_configuration'");
    expect(migration).toContain("('tok-platform', 'Actualités TheTOK', 'tok_news', 'manual'");
  });

  it("uses an environment-bound Vault URL and never embeds a project URL or token", () => {
    expect(migration).toContain("marketing_edge_url");
    expect(migration).toContain("internal_cron_secret");
    expect(migration).toContain("SELECT public.invoke_marketing_orchestrator_cron();");
    expect(migration).not.toMatch(/https:\/\/[a-z0-9-]+\.supabase\.co/i);
    expect(migration).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}\./);
  });

  it("keeps admin and worker execution privileges separated", () => {
    expect(migration).toContain("marketing_require_admin()");
    expect(migration).toContain("marketing_require_service_role()");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated, service_role");
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION[\s\S]+admin_get_marketing_overview[\s\S]+TO authenticated;/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION[\s\S]+claim_due_marketing_items[\s\S]+TO service_role;/);
  });
});
