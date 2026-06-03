import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

function readMigration(slug: string) {
  const migrationsDir = resolve(root, "supabase/migrations");
  const fileName = readdirSync(migrationsDir).find((name) => name.includes(slug));

  expect(fileName, `migration ${slug} should exist`).toBeTruthy();
  return readFileSync(resolve(migrationsDir, fileName!), "utf8");
}

describe("support and notification governance", () => {
  it("routes public and restaurant support messages through a governed edge function", () => {
    const contact = read("src/pages/Contact.tsx");
    const dashboardSupport = read("src/pages/dashboard/DashboardSupport.tsx");
    const supportClient = read("src/lib/support/contactSupport.ts");
    const emailService = read("src/lib/email-service.ts");
    const edgePath = "supabase/functions/contact-support/index.ts";
    const edge = read(edgePath);
    const config = read("supabase/config.toml");

    expect(existsSync(resolve(root, edgePath))).toBe(true);
    expect(config).toContain("[functions.contact-support]");
    expect(config).toContain("verify_jwt = false");
    expect(contact).toContain("submitContactSupport");
    expect(contact).toContain('source: "public_contact"');
    expect(contact).toContain('name="email"');
    expect(contact).not.toContain("alert(");
    expect(dashboardSupport).toContain("submitContactSupport");
    expect(dashboardSupport).toContain('source: "restaurant_dashboard"');
    expect(dashboardSupport).not.toContain("email_queue");
    expect(supportClient).toContain('functions.invoke<ContactSupportResult>("contact-support"');
    expect(edge).toContain("verifyTurnstileIfConfigured");
    expect(edge).toContain("requireRestaurantAccess");
    expect(edge).toContain('adminClient.from("email_queue").insert');
    expect(edge).toContain('.from("support_incidents")');
    expect(edge).toContain("writeAuditLog");
    expect(emailService).not.toContain("email_queue");
    expect(emailService).toContain("queued by checkout Edge Functions");
  });

  it("governs admin notification campaign mutations with audited RPCs", () => {
    const page = read("src/pages/admin/AdminNotifications.tsx");
    const sql = readMigration("admin_notification_campaign_governance");

    for (const rpc of [
      "admin_save_notification_campaign",
      "admin_duplicate_notification_campaign",
      "admin_cancel_notification_campaign",
      "admin_send_test_notification_campaign",
    ]) {
      expect(page).toContain(rpc);
      expect(sql).toContain(`CREATE OR REPLACE FUNCTION public.${rpc}`);
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${rpc}`);
    }

    expect(page).toContain("Raison d'annulation obligatoire");
    expect(page).not.toContain('.from("notification_campaigns").insert');
    expect(page).not.toContain('.from("notification_campaigns").update');
    expect(page).not.toContain('.from("notification_campaigns").delete');
    expect(page).not.toContain('.from("notifications").insert');
    expect(sql).toContain('DROP POLICY IF EXISTS "Admins can manage campaigns" ON public.notification_campaigns;');
    expect(sql).toContain("REVOKE INSERT, UPDATE, DELETE ON public.notification_campaigns FROM authenticated;");
    expect(sql).toContain("REVOKE INSERT, DELETE ON public.notifications FROM authenticated;");
    expect(sql).toContain("COALESCE(auth.role(), '') <> 'service_role'");
    expect(sql).toContain("'admin_cancel_notification_campaign'");
    expect(sql).toContain("'admin_send_test_notification_campaign'");
    expect(sql).toContain("Cancellation reason is required.");
    expect(sql).toContain("public.queue_notification_deliveries");
    expect(sql).toContain("INSERT INTO public.audit_log");
    expect(sql).toContain("NOTIFY pgrst, 'reload schema'");
  });
});
