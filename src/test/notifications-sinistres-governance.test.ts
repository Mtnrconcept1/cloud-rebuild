import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  getNotificationBadgeCountForRoute,
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
  });

  it("counts unread notifications beside the concerned menu tab", () => {
    const notifications = [
      { data: { order_id: "order-1" } },
      { data: { reservation_id: "res-1" } },
      { data: { support_incident_id: "incident-1" } },
      { data: { entity_type: "security_event" } },
    ];

    expect(getNotificationBadgeCountForRoute(notifications, "/admin/commandes-reservations", "admin")).toBe(2);
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
  });

  it("persists AI chat complaints into support incidents and notifies admins", () => {
    for (const fn of ["ai-client-chat", "ai-client-support"]) {
      const source = readProjectFile(`supabase/functions/${fn}/index.ts`);

      expect(source).toContain("support_incident_messages");
      expect(source).toContain("enqueue_notification");
      expect(source).toContain("/admin/sinistres?incident=");
      expect(source).toContain("conversation_id");
    }

    const supportChat = readProjectFile("src/components/SupportChat.tsx");
    expect(supportChat).toContain('askClientSupport({');
    expect(supportChat).toContain("supportTicketId");
    expect(supportChat).toContain("agentId: selectedAgent");
    expect(supportChat).toContain("surface: chatSurface");
  });
});
