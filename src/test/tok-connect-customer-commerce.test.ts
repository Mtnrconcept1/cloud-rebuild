import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import {
  normalizeTokCustomerCart,
  assertTokCartAmountUnchanged,
  safeTokCommerceCheckoutUrl,
  TokCustomerCommerceError,
} from "../../supabase/functions/_shared/tok-connect-customer-commerce.ts";
import { TOK_DISCOVERY_WIDGET_HTML } from "../../supabase/functions/_shared/tok-connect-discovery-widget.ts";

const restaurantId = "12f4babe-9438-4fda-8892-20c26ea7f7bb";
const itemId = "d6e50f04-5777-4d5a-906d-c77af199dd1e";
const attemptId = "d9f6ad38-4ed7-42eb-8293-8ef38f4e6cdd";
const date = "2026-10-20";
const input = {
  restaurant_id: restaurantId,
  journey: "zero-attente",
  items: [{ menu_item_id: itemId, quantity: 2 }],
  date, time: "19:00", party_size: 2, payment_method: "card",
};
const remote = readFileSync("supabase/functions/tok-connect-remote-mcp/index.ts", "utf8");
const bridge = readFileSync("supabase/functions/tok-connect-app-bridge/index.ts", "utf8");
const checkout = readFileSync("supabase/functions/create-checkout/index.ts", "utf8");

describe("TOK Connect secured customer commerce contract", () => {
  it("accepts a bounded menu cart but strips untrusted pricing and metadata", () => {
    const normalized = normalizeTokCustomerCart({
      ...input,
      items: [{ menu_item_id: itemId, quantity: 2, price: 0.01, metadata: { admin: true } }],
      total_amount: 0.01, service_role: true,
    }, { now: new Date("2026-10-15T06:00:00Z") });
    expect(normalized.items).toEqual([{ menu_item_id: itemId, quantity: 2 }]);
    expect(normalized).not.toHaveProperty("total_amount");
    expect(normalized).not.toHaveProperty("service_role");
    expect(normalized.items[0]).not.toHaveProperty("price");
    expect(normalized).toMatchObject({ date, time: "19:00", party_size: 2 });
  });

  it("rejects invalid dates, duplicate products, excessive quantities and arbitrary payment methods", () => {
    const now = new Date("2026-10-15T06:00:00Z");
    for (const patch of [
      { date: "2026-02-30" },
      { date: "2026-10-10" },
      { date: "2027-12-01" },
      { items: [{ menu_item_id: itemId, quantity: 21 }] },
      { items: [{ menu_item_id: itemId, quantity: 1 }, { menu_item_id: itemId, quantity: 1 }] },
      { payment_method: "cash" },
      { time: "25:99" },
      { party_size: 50 },
    ]) expect(() => normalizeTokCustomerCart({ ...input, ...patch }, { now })).toThrow(TokCustomerCommerceError);
  });

  it("requires explicit confirmation, a stable UUID and matching idempotency key for checkout", () => {
    const base = { ...input, expected_total_cents: 4800, payment_attempt_id: attemptId };
    expect(() => normalizeTokCustomerCart(base, { checkout: true, now: new Date("2026-10-15") }))
      .toThrow("tok_cart_explicit_confirmation_required");
    expect(() => normalizeTokCustomerCart({
      ...base, confirmed_by_user: true, idempotency_key: "a-different-key",
    }, { checkout: true, now: new Date("2026-10-15") })).toThrow("tok_cart_idempotency_key_invalid");
    expect(normalizeTokCustomerCart({
      ...base, confirmed_by_user: true, idempotency_key: "tok-cart:" + attemptId,
    }, { checkout: true, now: new Date("2026-10-15") })).toMatchObject({
      confirmed_by_user: true, expected_total_cents: 4800,
      payment_attempt_id: attemptId,
    });
  });

  it("fails closed when a quoted total changes, and only returns a trusted Stripe URL", () => {
    expect(() => assertTokCartAmountUnchanged(5000, 4800))
      .toThrow("tok_cart_price_changed_refresh_quote");
    expect(safeTokCommerceCheckoutUrl("https://checkout.stripe.com/c/pay/cs_test_123"))
      .toBe("https://checkout.stripe.com/c/pay/cs_test_123");
    for (const unsafe of [
      "https://checkout.stripe.com.evil.org/pay",
      "http://checkout.stripe.com/pay",
      "javascript:alert(1)",
      "https://www.thetok.ch/checkout",
    ]) expect(safeTokCommerceCheckoutUrl(unsafe)).toBeNull();
  });

  it("keeps privileged tools blocked and never trusts browser totals to price Stripe", () => {
    expect(remote).toContain('name: "tok_quote_customer_cart"');
    expect(remote).toContain('name: "tok_checkout_customer_cart"');
    expect(remote).toContain('name: "tok_customer_payment_status"');
    expect(remote).toContain('"openai/visibility": "private"');
    expect(remote).toContain("TOK_CLIENT_MUTATION_NAMES");
    expect(remote).toContain("PUBLIC_MCP_READ_ONLY_ERROR");
    expect(bridge).toContain("buildVerifiedOrderPricing");
    expect(bridge).toContain("get_restaurant_reservation_slot_availability");
    expect(bridge).toContain('postCustomerTokFunction(req, "validate-order"');
    expect(bridge).toContain('postCustomerTokFunction(req, "create-checkout"');
    expect(bridge).toContain('checkout_group_id: paymentAttemptId');
    expect(bridge).toContain('return_url: fixedReturnUrl');
    expect(checkout).toContain("TOK_CONNECT_PRICE_CHANGED_REQUOTE_REQUIRED");
    expect(checkout).toContain("expected !== finalCheckoutTotalCents");
    expect(checkout).toContain("persistOrderCheckoutSessionMapping");
    expect(checkout).toContain("create_zero_attente_checkout_hold");
  });
});

function widgetHarness(options: { reject?: boolean; restoredCart?: unknown; differentSearch?: boolean; paidFinalized?: boolean; safeReject?: boolean; expired?: boolean } = {}) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const links: string[] = [];
  const selection = {
    kind: "restaurant_selection", title: "TOK Genève", query: "restaurant à Genève",
    date, party_size: 2, groups: [], notes: [],
    restaurants: [{ id: options.differentSearch ? "9d15e984-fd28-401c-8bf7-fc5fd085b9b1" : restaurantId,
      name: "Chez TOK", city: "Genève",
      supports_reservation: true, supports_dinein: true, supports_pickup: true }],
  };
  const detail = {
    ...selection.restaurants[0], kind: "restaurant_detail",
    availability: { date, slots: [{ time: "19:00", available: true }] },
  };
  const host = {
    toolOutput: selection, theme: "light", widgetState: options.restoredCart ? { cart: options.restoredCart } : null,
    setWidgetState: () => undefined,
    requestDisplayMode: () => undefined,
    openExternal: ({ href }: { href: string }) => { links.push(href); },
    callTool: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === "get_restaurant_details") return { structuredContent: { detail } };
      if (name === "get_restaurant_menu") return { structuredContent: {
        restaurant_id: restaurantId,
        items: [{ id: itemId, name: "Risotto", description: "Crémeux", price: 24, is_available: true }],
      } };
      if (name === "tok_quote_customer_cart") return { structuredContent: {
        ok: true, quote: {
          total_cents: 4800, subtotal_cents: 4800,
          checked_at: new Date().toISOString(),
        },
      } };
      if (name === "tok_checkout_customer_cart") {
        if (options.reject) return { structuredContent: {
          ok: false, retry_safe: options.safeReject === true, error: { message: "TOK_CONNECT_PRICE_CHANGED_REQUOTE_REQUIRED" },
        } };
        return { structuredContent: {
          ok: true, checkout_url: "https://checkout.stripe.com/c/pay/cs_test_123",
          payment_status: "pending",
        } };
      }
      if (name === "tok_customer_payment_status") return { structuredContent: {
        ok: true, state: options.expired ? "expired" : options.paidFinalized ? "finalized" : "session_bound",
        paid: Boolean(options.paidFinalized), checkout_url: options.paidFinalized || options.expired
          ? null : "https://checkout.stripe.com/c/pay/cs_test_123",
      } };
      if (name === "tok_cancel_cart_payment_attempt") return { structuredContent: {
        ok: true, state: "cancelled", cancelled: true,
      } };
      if (name === "tok_my_orders") return { structuredContent: { ok: true, items: [] } };
      throw new Error("Unexpected tool " + name);
    },
  };
  const dom = new JSDOM(TOK_DISCOVERY_WIDGET_HTML, {
    url: "https://www.thetok.ch",
    runScripts: "dangerously",
    beforeParse(window) {
      Object.defineProperty(window, "openai", { value: host });
      Object.defineProperty(window.crypto, "randomUUID", { value: () => attemptId, configurable: true });
    },
  });
  const wait = async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  const press = (name: string) => {
    const buttons = Array.from(dom.window.document.querySelectorAll("button"));
    const b = buttons.find((node) => node.textContent?.trim().includes(name));
    if (!b) throw new Error("Missing button " + name);
    b.click();
  };
  return { dom, calls, links, press, wait };
}

describe("TOK customer cart embedded widget", () => {
  it("edits quantities, requests a server quote and opens Stripe only after explicit consent", async () => {
    const ui = widgetHarness();
    try {
      ui.press("Voir la fiche"); await ui.wait();
      ui.press("Commander à emporter"); await ui.wait();
      expect(ui.dom.window.document.querySelector("#root")?.textContent).toContain("Risotto");
      const add = ui.dom.window.document.querySelector('button[aria-label="Ajouter Risotto"]') as HTMLButtonElement;
      add.click();
      ui.press("Vérifier le prix"); await ui.wait();
      expect(ui.calls.some((call) => call.name === "tok_quote_customer_cart")).toBe(true);
      expect(ui.calls.some((call) => call.name === "tok_checkout_customer_cart")).toBe(false);
      ui.press("Confirmer et payer sur Stripe"); await ui.wait();
      const checkoutCall = ui.calls.find((call) => call.name === "tok_checkout_customer_cart");
      expect(checkoutCall?.args).toMatchObject({
        restaurant_id: restaurantId, journey: "takeaway", confirmed_by_user: true,
        expected_total_cents: 4800, payment_attempt_id: attemptId,
        idempotency_key: "tok-cart:" + attemptId,
        items: [{ menu_item_id: itemId, quantity: 1 }],
      });
      expect(checkoutCall?.args).not.toHaveProperty("total_amount");
      expect(ui.links).toEqual(["https://checkout.stripe.com/c/pay/cs_test_123"]);
      expect(ui.dom.window.document.querySelector("#root")?.textContent).toContain("pas encore confirmée");
    } finally {
      ui.dom.window.close();
    }
  });

  it("rejects repricing without opening Stripe and does not claim an order was confirmed", async () => {
    const ui = widgetHarness({ reject: true });
    try {
      ui.press("Voir la fiche"); await ui.wait();
      ui.press("Zéro Attente"); await ui.wait();
      (ui.dom.window.document.querySelector('button[aria-label="Ajouter Risotto"]') as HTMLButtonElement).click();
      ui.press("Vérifier le prix"); await ui.wait();
      ui.press("Confirmer et payer sur Stripe"); await ui.wait();
      expect(ui.links).toHaveLength(0);
      const text = ui.dom.window.document.querySelector("#root")?.textContent || "";
      expect(text).toContain("TOK_CONNECT_PRICE_CHANGED_REQUOTE_REQUIRED");
      expect(text).not.toContain("Paiement Stripe à finaliser");
    } finally {
      ui.dom.window.close();
    }
  });

  it("restores a payable attempt even if a different restaurant is now in search results", async () => {
    const ui = widgetHarness({
      differentSearch: true,
      restoredCart: {
        restaurantId, journey: "zero-attente", date, time: "19:00",
        partySize: 2, paymentMethod: "card",
        items: { [itemId]: 1 }, attemptId, stage: "processing",
      },
    });
    try {
      await ui.wait();
      expect(ui.dom.window.document.querySelector("#root")?.textContent).toContain("Tentative de paiement restaurée");
      ui.press("Vérifier le paiement"); await ui.wait();
      expect(ui.calls.some((call) => call.name === "tok_customer_payment_status")).toBe(true);
      expect(ui.calls.some((call) => call.name === "tok_checkout_customer_cart")).toBe(false);
      expect(ui.dom.window.document.querySelector("#root")?.textContent).not.toContain("Confirmer et payer sur Stripe");
      // A lost reply is resolved through status, not a new attempt UUID.
      expect(ui.links).toHaveLength(0);
    } finally {
      ui.dom.window.close();
    }
  });

  it("unlocks a paid attempt only after authoritative finalization and a separate user action", async () => {
    const ui = widgetHarness({
      paidFinalized: true,
      restoredCart: {
        restaurantId, journey: "takeaway", date, time: "19:00",
        partySize: 1, paymentMethod: "card", items: { [itemId]: 1 },
        attemptId, stage: "pending",
      },
    });
    try {
      await ui.wait();
      ui.press("Vérifier le paiement"); await ui.wait();
      expect(ui.dom.window.document.querySelector("#root")?.textContent).toContain("Paiement traité par TOK");
      expect(ui.dom.window.document.querySelector("#root")?.textContent).toContain("Terminer ce paiement");
      ui.press("Terminer ce paiement"); await ui.wait();
      expect(ui.dom.window.document.querySelector("#root")?.textContent).not.toContain("Vérifier le paiement");
    } finally {
      ui.dom.window.close();
    }
  });

  it("requires a second click and an owned Stripe cancellation before releasing a pending cart", async () => {
    const ui = widgetHarness({
      restoredCart: {
        restaurantId, journey: "takeaway", date, time: "19:00",
        partySize: 1, paymentMethod: "card", items: { [itemId]: 1 },
        attemptId, stage: "pending",
      },
    });
    try {
      await ui.wait();
      ui.press("Annuler cette tentative de paiement"); await ui.wait();
      expect(ui.calls.some((call) => call.name === "tok_cancel_cart_payment_attempt")).toBe(false);
      ui.press("Confirmer l’annulation de Stripe"); await ui.wait();
      const operation = ui.calls.find((call) => call.name === "tok_cancel_cart_payment_attempt");
      expect(operation?.args).toMatchObject({
        payment_attempt_id: attemptId, confirmed_by_user: true,
        idempotency_key: "tok-cancel:" + attemptId,
      });
      expect(ui.dom.window.document.querySelector("#root")?.textContent).toContain("Tentative annulée par TOK");
    } finally {
      ui.dom.window.close();
    }
  });

});


describe("TOK widget recovery",()=>{
  it("unlocks only a server-proven rejection before any write",async()=>{
    const ui=widgetHarness({reject:true,safeReject:true});
    try{
      ui.press("Voir la fiche");await ui.wait();ui.press("Commander à emporter");await ui.wait();
      (ui.dom.window.document.querySelector('button[aria-label="Ajouter Risotto"]') as HTMLButtonElement).click();
      ui.press("Vérifier le prix");await ui.wait();ui.press("Confirmer et payer sur Stripe");await ui.wait();
      expect(ui.dom.window.document.querySelector("#root")?.textContent).toContain("Aucun paiement créé");
      expect(ui.dom.window.document.querySelector("#root")?.textContent).not.toContain("Vérifier le paiement");
      expect(ui.links).toEqual([]);
    }finally{ui.dom.window.close()}
  });
  it("never offers an expired checkout URL again",async()=>{
    const ui=widgetHarness({expired:true,restoredCart:{restaurantId,journey:"takeaway",date,time:"19:00",partySize:1,items:{[itemId]:1},attemptId}});
    try{await ui.wait();ui.press("Vérifier le paiement");await ui.wait();
      expect(ui.dom.window.document.querySelector("#root")?.textContent).toContain("Session Stripe expirée");
      expect(ui.dom.window.document.querySelector("#root")?.textContent).not.toContain("Reprendre le paiement Stripe");
    }finally{ui.dom.window.close()}
  });
  it("rejects a same-day service already passed in Switzerland",()=>{
    expect(()=>normalizeTokCustomerCart({...input,date:"2026-10-16",time:"19:00"},{now:new Date("2026-10-16T20:00:00Z")})).toThrow("tok_cart_slot_in_past");
  });
});
