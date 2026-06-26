import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  getNotificationBadgeCountForRoute,
  getNotificationCenterPathForRole,
  getNotificationTarget,
} from "@/lib/notificationRouting";

const root = process.cwd();

function readProjectFile(path: string) {
  const absolutePath = resolve(root, path);
  expect(existsSync(absolutePath), `${path} should exist`).toBe(true);
  return readFileSync(absolutePath, "utf8");
}

describe("notifications and chat sinistres governance", () => {
  it("routes notifications directly to the relevant operational screen", () => {
    expect(getNotificationTarget({ data: { order_id: "order-1" } }, "client"))
      .toBe("/commande/order-1");
    expect(getNotificationTarget({ data: { url: "/notifications", order_id: "order-1" } }, "client"))
      .toBe("/commande/order-1");
    expect(getNotificationTarget({ data: { order_id: "order-1" } }, "admin"))
      .toBe("/admin/commandes-reservations?tab=orders&operation=order-1");
    expect(getNotificationTarget({ data: { reservation_id: "res-1" } }, "restaurateur"))
      .toBe("/dashboard/reservations?reservation=res-1");
    expect(getNotificationTarget({ data: { dispatch_job_id: "job-1" } }, "courier"))
      .toBe("/courier/jobs?job=job-1");
    expect(getNotificationTarget({ data: { support_incident_id: "incident-1" } }, "admin"))
      .toBe("/admin/sinistres?incident=incident-1");
    expect(getNotificationTarget({ data: { url: "/admin/audit?event=1" } }, "admin"))
      .toBe("/admin/audit?event=1");
    expect(getNotificationCenterPathForRole("restaurateur")).toBe("/dashboard/notifications");
    expect(getNotificationCenterPathForRole("courier")).toBe("/courier/notifications");
  });

  it("counts unread notifications beside the concerned menu tab", () => {
    const notifications = [
      { data: { order_id: "order-1" } },
      { data: { reservation_id: "res-1" } },
      { data: { support_incident_id: "incident-1" } },
      { data: { entity_type: "security_event" } },
    ];

    expect(getNotificationBadgeCountForRoute(notifications, "/admin/commandes-reservations", "admin")).toBe(2);
    expect(getNotificationBadgeCountForRoute(notifications, "/admin/notifications", "admin")).toBe(4);
    expect(getNotificationBadgeCountForRoute(notifications, "/admin/sinistres", "admin")).toBe(1);
    expect(getNotificationBadgeCountForRoute(notifications, "/admin/audit", "admin")).toBe(1);
  });

  it("keeps the notification bell available in the four application interfaces", () => {
    for (const path of [
      "src/components/Navbar.tsx",
      "src/components/DashboardLayout.tsx",
      "src/components/CourierDashboardLayout.tsx",
      "src/App.tsx",
    ]) {
      expect(readProjectFile(path)).toContain("NotificationBell");
    }

    expect(readProjectFile("src/components/CustomerDashboardLayout.tsx")).toContain("NotificationMenuBadge");
    expect(readProjectFile("src/components/admin/AdminMobileNavigation.tsx")).toContain("NotificationMenuBadge");
  });

  it("exposes a notification history page for every authenticated interface", () => {
    const app = readProjectFile("src/App.tsx");
    const customerPage = readProjectFile("src/pages/Notifications.tsx");
    const dashboardPage = readProjectFile("src/pages/dashboard/DashboardNotifications.tsx");
    const courierPage = readProjectFile("src/pages/courier/CourierNotifications.tsx");
    const adminPage = readProjectFile("src/pages/admin/AdminNotifications.tsx");
    const adminOperationsCenter = readProjectFile("src/pages/admin/AdminOperationsCenter.tsx");
    const adminOrdersReservations = readProjectFile("src/pages/admin/AdminOrdersReservations.tsx");
    const historyList = readProjectFile("src/components/notifications/NotificationHistoryList.tsx");
    const courierJobs = readProjectFile("src/pages/courier/CourierJobs.tsx");
    const dashboardLayout = readProjectFile("src/components/DashboardLayout.tsx");
    const courierLayout = readProjectFile("src/components/CourierDashboardLayout.tsx");
    const bell = readProjectFile("src/components/notifications/NotificationBell.tsx");

    expect(app).toContain('path="/notifications"');
    expect(app).toContain('path="/dashboard/notifications"');
    expect(app).toContain('path="/courier/notifications"');
    expect(app).toContain('path="/admin/notifications"');
    expect(customerPage).toContain("NotificationHistoryList");
    expect(dashboardPage).toContain("NotificationHistoryList");
    expect(courierPage).toContain("NotificationHistoryList");
    expect(adminPage).toContain("NotificationHistoryList");
    expect(historyList).toContain("useNotificationCenter(limit, { realtime: true })");
    expect(historyList).toContain("getNotificationTarget(notification, role, notificationCenterTarget)");
    expect(historyList).toContain("markNotificationRead(notification.id)");
    expect(historyList).toContain("navigate(target)");
    expect(adminOperationsCenter).toContain("useSearchParams");
    expect(adminOperationsCenter).toContain('setActiveView("history")');
    expect(adminOrdersReservations).toContain('searchParams.get("operation")');
    expect(courierJobs).toContain("useSearchParams");
    expect(courierJobs).toContain('searchParams.get("job")');
    expect(courierJobs).toContain('searchParams.get("order")');
    expect(dashboardLayout).toContain("/dashboard/notifications");
    expect(courierLayout).toContain("/courier/notifications");
    expect(bell).toContain("getNotificationCenterPathForRole(role)");
  });

  it("exposes chat sinistres in admin with summary and full conversation history", () => {
    const app = readProjectFile("src/App.tsx");
    const adminHome = readProjectFile("src/pages/admin/AdminHome.tsx");
    const page = readProjectFile("src/pages/admin/AdminSinistres.tsx");
    const catalog = readProjectFile("src/lib/featureCatalog.ts");

    expect(app).toContain('path="/admin/sinistres"');
    expect(adminHome).toContain("/admin/sinistres");
    expect(catalog).toContain('"/admin/sinistres"');
    expect(page).toContain("support_incident_messages");
    expect(page).toContain("ai_support_tickets");
    expect(page).toContain("fetchStandaloneAiSupportTickets");
    expect(page).toContain('searchParams.get("ticket")');
    expect(page).toContain("ai_conversations");
    expect(page).toContain("ai_messages");
    expect(page).toContain("ticket_summary");
    expect(page).toContain("Transcription IA");
    expect(page).toContain("formatIncidentReference");
    expect(page).toContain("getIncidentDisplayNumber");
    expect(page).toContain("getConversationDisplayNumber");
    expect(page).toContain("Conversation #");
    expect(page).toContain("Sinistre #");
    expect(page).toContain("Ticket IA #");
    expect(page).toContain("Discussion en direct");
    expect(page).toContain("sendAdminIncidentMessage");
    expect(page).toContain("support-chat-");
    expect(page).toContain("formatTypingRole");
    expect(page).toContain("Le restaurateur");
    expect(page).toContain("Le livreur");
    expect(page).toContain("support_incident_messages");
    expect(page).toContain("visibility: \"public\"");
    expect(page).toContain("handoff_to_admin: true");
    expect(page).toContain("ai_disabled: true");
    expect(page).toContain('source === "contact-support"');
    expect(page).toContain('source.includes("support")');
    expect(page).toContain('category === "support"');
    expect(page).toContain('subject.startsWith("incident support")');
  });

  it("highlights open chat incidents in admin navigation and refreshes them in realtime", () => {
    const adminNavigation = readProjectFile("src/components/admin/AdminMobileNavigation.tsx");

    expect(adminNavigation).toContain("Sinistres et chat");
    expect(adminNavigation).toContain("supportIncidentBadge");
    expect(adminNavigation).toContain("fetchOpenSupportIncidentCount");
    expect(adminNavigation).toContain("admin-support-nav-badge");
    expect(adminNavigation).toContain("support_incident_messages");
    expect(adminNavigation).toContain("animate-pulse");
  });

  it("keeps incident detail closing single-click and exposes triage status actions before closure", () => {
    const page = readProjectFile("src/pages/admin/AdminSinistres.tsx");

    expect(page).toContain("suppressedAutoOpenTargetRef");
    expect(page).toContain("closeIncidentDetail");
    expect(page).toContain("onOpenChange={(open) => {");
    expect(page).toContain("closeIncidentDetail();");
    expect(page).toContain("ADMIN_INCIDENT_STATUS_ACTIONS");
    expect(page).toContain('label: "En cours"');
    expect(page).toContain('label: "En attente client"');
    expect(page).toContain('label: "En attente restaurant"');
    expect(page).toContain('label: "Résolu"');
    expect(page).toContain("updateIncidentStatus");
    expect(page).toContain('.from("support_incidents")');
    expect(page).toContain('.from("ai_support_tickets")');
    expect(page).not.toContain('label: "Classer"');
  });

  it("persists AI chat complaints into support incidents and notifies admins", () => {
    for (const fn of ["ai-client-chat", "ai-client-support"]) {
      const source = readProjectFile(`supabase/functions/${fn}/index.ts`);

      expect(source).toContain("support_incident_messages");
      expect(source).toContain(fn === "ai-client-support" ? "notifyAdmins" : "enqueue_notification");
      expect(source).toContain("/admin/sinistres?incident=");
      expect(source).toContain("conversation_id");
    }

    const supportChat = readProjectFile("src/components/SupportChat.tsx");
    expect(supportChat).toContain('askClientSupport({');
    expect(supportChat).toContain("supportTicketId");
    expect(supportChat).toContain("agentId: selectedAgent");
    expect(supportChat).toContain("surface: chatSurface");
    expect(supportChat).toContain("support-chat-messages-");
    expect(supportChat).toContain("postgres_changes");
    expect(supportChat).toContain("support-chat-");
    expect(supportChat).toContain("remoteTyping");
    expect(supportChat).toContain("TYPING_ROLE_LABELS");
    expect(supportChat).toContain("humanHandoffActive");
    expect(supportChat).toContain("handoffToAdmin");
    expect(supportChat).toContain("aiDisabled");
    expect(supportChat).toContain("getTypingRoleForSurface");
  });

  it("turns off client support AI only for conversations taken over by TOK", () => {
    const edgeFunction = readProjectFile("supabase/functions/ai-client-support/index.ts");
    const embeddedChat = readProjectFile("src/components/support/TokAiSupportChat.tsx");

    expect(edgeFunction).toContain("handoff_to_admin");
    expect(edgeFunction).toContain("ai_disabled");
    expect(edgeFunction).toContain("delivery: \"admin_thread\"");
    expect(edgeFunction).toContain("return jsonResponse({");
    expect(edgeFunction).toContain("handoffToAdmin: true");
    expect(edgeFunction).toContain("aiDisabled: true");
    expect(embeddedChat).toContain("humanHandoffActive");
    expect(embeddedChat).toContain("embedded-support-chat-messages-");
    expect(embeddedChat).toContain("support-chat-");
    expect(embeddedChat).toContain("TOK ecrit");
    expect(embeddedChat).toContain("Envoyer a TOK");
  });

  it("prevents non-admin users from spoofing admin support messages", () => {
    const migration = readProjectFile("supabase/migrations/20260626073000_harden_support_incident_message_authors.sql");

    expect(migration).toContain('DROP POLICY IF EXISTS "support_messages_insert_related"');
    expect(migration).toContain("author_role = 'admin'");
    expect(migration).toContain("public.has_role(auth.uid(), 'admin')");
    expect(migration).toContain("author_role = 'client'");
    expect(migration).toContain("si.opened_by = auth.uid()");
    expect(migration).toContain("author_role = 'restaurateur'");
    expect(migration).toContain("public.auth_owns_restaurant(si.restaurant_id)");
  });
});
