import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { TOK_DISCOVERY_WIDGET_HTML } from "../../supabase/functions/_shared/tok-connect-discovery-widget.ts";

const remote = readFileSync("supabase/functions/tok-connect-remote-mcp/index.ts", "utf8");
const bridge = readFileSync("supabase/functions/tok-connect-app-bridge/index.ts", "utf8");
const bookingBackend = readFileSync("supabase/functions/create-reservation/index.ts", "utf8");

const restaurantId = "f7a7de81-4f53-4ce2-994c-8fb6ec328711";
const reservationId = "89ab0a61-5fe3-45bc-aa71-50493d9c59c1";
const selection = {
  kind: "restaurant_selection",
  query: "table à Genève",
  title: "Tables à Genève",
  city: "Genève",
  date: "2026-10-20",
  party_size: 2,
  restaurants: [{
    id: restaurantId,
    name: "Table TOK",
    city: "Genève",
    group_key: "all",
    supports_reservation: true,
    url: "https://www.thetok.ch/restaurant/" + restaurantId,
  }],
  groups: [],
  notes: [],
};
const detail = {
  ...selection.restaurants[0],
  kind: "restaurant_detail",
  availability: { date: "2026-10-20", slots: [{ time: "19:00", available: true }] },
};

function setupWidget(options: { quoteRequiresGuarantee?: boolean; bookingDenied?: boolean; safeRejection?: boolean } = {}) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const host = {
    toolOutput: selection,
    theme: "light",
    callTool: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === "get_restaurant_details") return { structuredContent: { detail } };
      if (name === "tok_quote_reservation") return {
        structuredContent: { ok: true, data: { ok: true, required: options.quoteRequiresGuarantee === true, fee_amount_cents: 2000 } },
      };
      if (name === "tok_book_table") return {
        structuredContent: options.bookingDenied
          ? { ok: false, retry_safe: options.safeRejection===true, data: { ok: false, error_code: "unavailable", error_message: "Créneau indisponible" } }
          : { ok: true, data: { ok: true, reservation_id: reservationId } },
      };
      if (name === "tok_my_reservations") return { structuredContent: { ok: true, items: [] } };
      throw new Error("unexpected widget tool: " + name);
    },
    setWidgetState: () => undefined,
    requestDisplayMode: () => undefined,
  };
  const dom = new JSDOM(TOK_DISCOVERY_WIDGET_HTML, {
    url: "https://www.thetok.ch",
    runScripts: "dangerously",
    beforeParse(window) {
      Object.defineProperty(window, "openai", { value: host, configurable: true });
    },
  });
  const click = (name: string) => {
    const buttons = Array.from(dom.window.document.querySelectorAll("button"));
    const button = buttons.find((candidate) => candidate.textContent?.trim().includes(name));
    if (!button) throw new Error("Missing button: " + name);
    button.click();
    return button;
  };
  const settle = async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  return { dom, calls, click, settle };
}

describe("TOK Connect customer MCP security", () => {
  it("only publishes named client writes while generic admin/RPC/payment tools remain closed", () => {
    expect(remote).toContain('const TOK_CLIENT_MUTATION_NAMES = new Set([');
    for (const toolName of ["tok_book_table", "tok_cancel_my_reservation", "tok_checkout_customer_cart", "tok_cancel_cart_payment_attempt"]) {
      expect(remote).toContain('"'+toolName+'"');
    }
    expect(remote).toContain("TOK_CLIENT_MUTATION_NAMES.has");
    expect(remote).toContain("PUBLIC_MCP_READ_ONLY_ERROR");
    expect(remote).toContain("tok_quote_reservation");
    expect(remote).toContain('"openai/widgetAccessible": true');
    expect(remote).not.toContain('name === "create_reservation"'); // The B2B mutation must not be public.
    expect(remote).toContain('capability: "reservations.classic.create"');
    expect(remote).toContain('confirmed_by_user: true, idempotency_key: args.idempotency_key');
  });

  it("requires app-only user interaction for booking and cancelling instead of exposing writes to the model", () => {
    for (const name of ["tok_book_table", "tok_cancel_my_reservation", "tok_checkout_customer_cart", "tok_cancel_cart_payment_attempt"]) {
      const start = remote.indexOf('name: "' + name + '"');
      expect(start).toBeGreaterThan(-1);
      const end = remote.indexOf("},\n  {", start);
      const definition = remote.slice(start, end > start ? end : undefined);
      expect(definition).toContain('visibility: ["app"]');
      expect(definition).toContain('"openai/visibility": "private"');
      expect(definition).toContain("...TOK_CLIENT_WIDGET_META");
    }
  });

  it("enforces the user identity, existing business guarantee and ownership rather than partner UUIDs", () => {
    expect(bridge).toContain("authenticateRequest(req, { allowServiceRole: false })");
    expect(bridge).toContain('functionName: "create-reservation"');
    expect(bridge).toContain('"reservations.classic.quote":');
    expect(bridge).toContain('if (name === "cancel_reservation_by_customer")');
    expect(bridge).toContain('.eq("user_id", actor.userId)');
    expect(bridge).toContain("paid_reservation_requires_tok_support");
    expect(bridge).toContain("downstream.ok === false");
    expect(bookingBackend).toContain("reservation_card_guarantee_quote");
    expect(bookingBackend).toContain("body.guarantee_accepted !== true");
  });
});

describe("TOK Connect transactional widget", () => {
  it("unlocks editing after a proven rejection but preserves the key after an uncertain result", async () => {
    for(const safeRejection of [true,false]){
      const widget=setupWidget({bookingDenied:true,safeRejection});
      try{
        widget.click("Voir la fiche");await widget.settle();
        widget.click("19:00");await widget.settle();
        widget.click("Confirmer cette réservation");await widget.settle();
        const root=widget.dom.window.document.querySelector("#root");
        if(safeRejection){
          expect(root?.textContent).not.toContain("Reprendre la même réservation");
          expect(root?.querySelector("input[type=date]")).not.toBeNull();
        }else{
          widget.click("Reprendre la même réservation");await widget.settle();
          const attempts=widget.calls.filter(c=>c.name==="tok_book_table");
          expect(attempts).toHaveLength(2);
          expect(attempts[0].args.idempotency_key).toBe(attempts[1].args.idempotency_key);
        }
      }finally{widget.dom.window.close();}
    }
  });
  it("embeds valid JavaScript and preserves date/time validation after TS string escaping", () => {
    const script = TOK_DISCOVERY_WIDGET_HTML.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    expect(script).toBeTruthy();
    expect(() => new Function(script || "")).not.toThrow();
    expect(script).toContain("/^\\d{4}-\\d{2}-\\d{2}$/");
    expect(script).toContain("tok_book_table");
    expect(script).toContain("tok_quote_reservation");
  });

  it("books a classic restaurant table only after direct confirmation", async () => {
    const widget = setupWidget();
    try {
      widget.click("Voir la fiche");
      await widget.settle();
      widget.click("19:00");
      await widget.settle();
      expect(widget.calls.some((call) => call.name === "tok_quote_reservation")).toBe(true);
      expect(widget.calls.some((call) => call.name === "tok_book_table")).toBe(false);
      widget.click("Confirmer cette réservation");
      await widget.settle();
      const bookingCall = widget.calls.find((call) => call.name === "tok_book_table");
      expect(bookingCall?.args).toMatchObject({
        restaurant_id: restaurantId, date: "2026-10-20", time: "19:00", party_size: 2,
        confirmed_by_user: true,
      });
      expect(String(bookingCall?.args.idempotency_key)).toMatch(/^tok-widget-/);
      expect(widget.dom.window.document.querySelector("#root")?.textContent).toContain("Réservation confirmée par TOK");
    } finally {
      widget.dom.window.close();
    }
  });

  it("does not confirm a refused table and requires explicit consent for card guarantee", async () => {
    const widget = setupWidget({ quoteRequiresGuarantee: true, bookingDenied: true });
    try {
      widget.click("Voir la fiche");
      await widget.settle();
      widget.click("19:00");
      await widget.settle();
      const confirmation = Array.from(widget.dom.window.document.querySelectorAll("button"))
        .find((button) => button.textContent?.includes("Confirmer cette réservation"));
      expect(confirmation?.disabled).toBe(true);
      expect(widget.calls.some((call) => call.name === "tok_book_table")).toBe(false);
      const checkbox = widget.dom.window.document.querySelector(".booking-guarantee input") as HTMLInputElement | null;
      expect(checkbox).not.toBeNull();
      if (checkbox) {
        checkbox.checked = true;
        checkbox.dispatchEvent(new widget.dom.window.Event("change", { bubbles: true }));
      }
      widget.click("Confirmer cette réservation");
      await widget.settle();
      expect(widget.dom.window.document.querySelector("#root")?.textContent).toContain("Créneau indisponible");
      expect(widget.dom.window.document.querySelector("#root")?.textContent).not.toContain("Réservation confirmée par TOK");
    } finally {
      widget.dom.window.close();
    }
  });
});
