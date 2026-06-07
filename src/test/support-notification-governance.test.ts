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

  it("signals support tickets and incidents to admins through in-app notifications", () => {
    const sharedNotifications = read("supabase/functions/_shared/notifications.ts");
    const aiSupport = read("supabase/functions/ai-client-support/index.ts");
    const contactSupport = read("supabase/functions/contact-support/index.ts");

    expect(sharedNotifications).toContain("export async function notifyAdmins");
    expect(aiSupport).toContain("notifyAdminsOfSupportTicket");
    expect(aiSupport).toContain("supportTicketWasCreated");
    expect(aiSupport).toContain("/admin/sinistres?ticket=");
    expect(aiSupport).toContain("ai_support_ticket_id: input.supportTicketId");
    expect(aiSupport).toContain("supportIncidentId");
    expect(contactSupport).toContain("notifyAdmins({");
    expect(contactSupport).toContain("/admin/sinistres?incident=");
    expect(contactSupport).toContain("support_incident_id: incidentId");
  });

  it("keeps critical order and dispatch events backed by role-targeted notifications", () => {
    const validateOrder = read("supabase/functions/validate-order/index.ts");
    const orderCheckout = read("supabase/functions/_shared/order-checkout.ts");
    const restaurantOrderStatus = read("supabase/functions/restaurant-order-status/index.ts");
    const dispatchOrder = read("supabase/functions/dispatch-order/index.ts");
    const notificationSql = readMigration("notification_system_completion");

    expect(validateOrder).toContain("enqueueNotification({");
    expect(validateOrder).toContain("Nouvelle commande");
    expect(orderCheckout).toContain("enqueueNotification({");
    expect(orderCheckout).toContain("Nouvelle commande");
    expect(notificationSql).toContain("CREATE OR REPLACE FUNCTION public.trigger_reservation_notifications");
    expect(notificationSql).toContain("CREATE OR REPLACE FUNCTION public.trigger_order_status_notification");
    expect(restaurantOrderStatus).toContain("notifyAdmins({");
    expect(restaurantOrderStatus).toContain("Dispatch à reprendre");
    expect(dispatchOrder).toContain("notifyAdmins({");
    expect(dispatchOrder).not.toContain('.eq("role", "admin")');
  });
});
