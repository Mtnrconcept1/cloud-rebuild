import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
const read = (p: string) => readFileSync(p,"utf8");
const migration = read("supabase/migrations/20261014100000_paid_tok_invoice_delivery.sql");
const webhook = read("supabase/functions/stripe-webhook/index.ts");
const sendEmail = read("supabase/functions/send-email/index.ts");
const admin = read("src/pages/admin/adminComptaShared.ts");
const dashboard = read("src/pages/dashboard/DashboardFacturesOutflow.tsx");
const adminExport = read("src/pages/admin/adminComptaShared.ts");
const merchantExport = read("src/pages/dashboard/dashboardFacturesShared.ts");

describe("automatic paid TOK invoice delivery", () => {
 it("prevents dashboard period-end mismatch for long subscriptions", () => {
   expect(admin).toContain('.gte("period_start", monthBounds.monthStart)');
   expect(admin).toContain('.lte("period_start", monthBounds.monthEnd)');
   expect(admin).toContain('["payable", "reservation_fees", "subscription"]');
   expect(dashboard).toContain('get("invoice") === invoice.id');
   expect(adminExport).toContain('fetchPagedRows<RestaurantFilterRow>');
   expect(adminExport).toContain('"period_start",\n      period,');
   expect(merchantExport).toContain('applyAccountingPeriodRange(query, "period_start", period, "date")');
 });
 it("sends only paid invoice to verified restaurant owner and uses original TOK invoice", () => {
   expect(migration).toContain("usr.email_confirmed_at IS NOT NULL");
   expect(migration).toContain("v_invoice.status<>'paid'");
   expect(migration).toContain("sum(li.amount_ttc)");
   expect(migration).toContain("tok_invoice_lines_total_mismatch");
   expect(migration).toContain("N° TVA :");
   expect(migration).toContain("NEW DOG''S SERVICES Sàrl");
   expect(migration).toContain("www.thetok.ch/logotok.png");
   expect(migration).toContain("dashboard/factures/sorties?invoice=");
   expect(migration).toContain("service_role_required");
   expect(migration).toContain("FROM PUBLIC,anon,authenticated");
 });
 it("queues exactly once and never triggers payment or inserts invoices", () => {
   expect(migration).toContain("CREATE UNIQUE INDEX IF NOT EXISTS ux_email_queue_tok_paid_invoice");
   expect(migration).toContain("ON CONFLICT DO NOTHING");
   expect(migration).toContain("'tok_paid_invoice_id',v_invoice.id::text");
   expect(migration).not.toContain("INSERT INTO public.restaurant_invoices");
   expect(migration).not.toContain("paymentIntents.create");
   expect(sendEmail).toContain('.eq("status", "queued")');
   expect(sendEmail).toContain('.update({ status: "processing" })');
   expect(webhook).toContain("TOK_PAID_INVOICE_EMAIL_QUEUE_FAILED");
   expect(webhook).toContain('p_source_kind: "stripe_invoice"');
   expect(webhook).toContain('p_source_kind: "checkout_session"');
 });
});
