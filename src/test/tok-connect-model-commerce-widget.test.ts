import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { TOK_DISCOVERY_WIDGET_HTML } from "../../supabase/functions/_shared/tok-connect-discovery-widget.ts";

const restaurant = "00000000-0000-4000-8000-000000000101";
const menuItem = "00000000-0000-4000-8000-000000000102";
const attempt = "00000000-0000-4000-8000-000000000103";
const quote = { restaurant_id: restaurant, restaurant_name: "Table TOK", journey: "takeaway", date: "2026-10-20", time: "19:00", party_size: 1,
  payment_method: "card", total_cents: 2800, checked_at: new Date().toISOString(), currency: "CHF",
  items: [{ menu_item_id: menuItem, name: "Tibs", quantity: 1, unit_amount_cents: 2800 }] };

function widget(commerce: Record<string, unknown>) {
  const calls: string[] = [], opened: string[] = [];
  let saved: unknown;
  const dom = new JSDOM(TOK_DISCOVERY_WIDGET_HTML, { runScripts: "dangerously", beforeParse(window) {
    Object.defineProperty(window, "openai", { value: { toolOutput: { commerce_result: commerce },
      callTool: async (name: string) => { calls.push(name); return { structuredContent: { ok: true, items: [] } }; },
      openExternal: ({ href }: { href: string }) => opened.push(href),
      setWidgetState: (value: unknown) => { saved = value; },
    } });
  } });
  const update = (value: Record<string, unknown>) => dom.window.dispatchEvent(new dom.window.CustomEvent("openai:set_globals", {
    detail: { globals: { toolOutput: { commerce_result: value } } },
  }));
  return { dom, calls, opened, update, saved: () => saved, text: () => dom.window.document.querySelector("#root")?.textContent || "" };
}

describe("model-driven customer commerce widget", () => {
  it("renders a server quote and exact menu selection without starting payment", () => {
    const w = widget({ action: "quote", quote });
    try {
      expect(w.text()).toContain("Tibs");
      expect(w.text()).toContain("28");
      expect(w.dom.window.document.querySelector<HTMLInputElement>('input[type=time]')?.value).toBe("19:00");
      expect(w.calls).toEqual([]); expect(w.opened).toEqual([]);
      expect(w.saved()).toMatchObject({ cart: { items: { [menuItem]: 1 }, date: quote.date, time: quote.time, attemptId: null } });
    } finally { w.dom.window.close(); }
  });

  it("keeps an existing model checkout locked when a later quote tries to replace it", () => {
    const checkout = { action: "checkout", payment_attempt_id: attempt, payment_status: "pending", checkout_url: "https://checkout.stripe.com/c/pay/test", context: quote };
    const w = widget(checkout);
    try {
      expect(w.text()).toContain("Paiement Stripe à finaliser");
      expect(w.dom.window.document.querySelector('input[type=time]')).toBeNull();
      w.update({ action: "quote", quote: { ...quote, time: "20:00" } });
      expect(w.text()).toContain("tentative de paiement existe déjà");
      expect(w.saved()).toMatchObject({ cart: { attemptId: attempt, time: "19:00" } });
      expect(w.calls).toEqual([]); expect(w.opened).toEqual([]);
    } finally { w.dom.window.close(); }
  });

  it.each([{ paid: true, state: "pending" }, { paid: false, state: "finalized" }, { paid: false, state: "indeterminate" }])("does not announce success for %j and blocks replacement quotes", (status) => {
    const w = widget({ action: "status", payment_attempt_id: attempt, ...status });
    try {
      expect(w.text()).not.toContain("Paiement finalisé par TOK");
      expect(w.text()).toContain(attempt);
      w.update({ action: "quote", quote });
      expect(w.text()).not.toContain("Tibs");
      expect(w.calls).toEqual([]);
    } finally { w.dom.window.close(); }
  });

  it("announces finalization only with paid true and finalized, and rejects malicious checkout links", () => {
    const w = widget({ action: "status", payment_attempt_id: attempt, paid: true, state: "finalized", checkout_url: "https://evil.example/pay" });
    try {
      expect(w.text()).toContain("Paiement finalisé par TOK");
      expect(w.text()).not.toContain("Reprendre le paiement Stripe");
      expect(w.opened).toEqual([]);
    } finally { w.dom.window.close(); }
  });
});
