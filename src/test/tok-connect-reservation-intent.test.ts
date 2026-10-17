import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { buildSandboxRestaurantDetail } from "../../supabase/functions/_shared/tok-connect-discovery.ts";
import { buildTokReservationPreparation, validateTokReservationIntent } from "../../supabase/functions/_shared/tok-connect-reservation-intent.ts";
import { TOK_DISCOVERY_WIDGET_HTML } from "../../supabase/functions/_shared/tok-connect-discovery-widget.ts";

const args = { restaurant_id: "00000000-0000-4000-8000-000000000101", date: "2026-10-20", time: "19:30", party_size: 7 };
const detail = buildSandboxRestaurantDetail(args);
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("natural-language reservation preparation", () => {
  it("renders a model-requested card guarantee recap without opening Stripe automatically", () => {
    const opened: string[] = [];
    const dom = new JSDOM(TOK_DISCOVERY_WIDGET_HTML, { runScripts: "dangerously", beforeParse(window) {
      Object.defineProperty(window, "openai", { value: { toolOutput: { booking_guarantee: {
        checkout_url: "https://checkout.stripe.com/c/pay/test", fee_amount_cents: 7000, context: args,
      } }, openExternal: ({ href }: { href: string }) => opened.push(href) } });
    } });
    try {
      const panel = dom.window.document.querySelector(".tok-booking");
      expect(panel?.textContent).toContain("7 convive(s)");
      expect(panel?.textContent).toContain("70");
      expect(panel?.textContent).toContain("La table n’est pas encore confirmée");
      expect(opened).toEqual([]);
      const button = Array.from(panel?.querySelectorAll("button") || []).find((item) => item.textContent === "Continuer sur Stripe");
      button?.click(); expect(opened).toEqual(["https://checkout.stripe.com/c/pay/test"]);
    } finally { dom.window.close(); }
  });
  it("keeps exact customer parameters and never invents a missing hour", () => {
    expect(buildTokReservationPreparation(detail, args).booking_intent).toMatchObject({ ...args, timezone: "Europe/Zurich", ready_to_book: true, mutation_executed: false });
    const missing = buildTokReservationPreparation(detail, { ...args, time: undefined });
    expect(missing.booking_intent).toMatchObject({ time: null, ready_to_book: false, next_action: "ask_time_or_offer_slots" });
    expect(buildTokReservationPreparation(detail, { ...args, time: "21:00" }).booking_intent.ready_to_book).toBe(false);
  });

  it.each([{ date: "2026-02-30" }, { time: "25:00" }, { party_size: 2.5 }, { party_size: 0 }, { party_size: 21 }, { party_size: "7" }, { timezone: "America/New_York" }])("rejects invalid or coerced parameters %j", (invalid) => {
    expect(() => validateTokReservationIntent({ ...args, ...invalid })).toThrow();
  });

  it("opens a prefilled 7-person booking, does no write and preserves local edits on host refresh", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const payload = buildTokReservationPreparation(detail, args);
    const dom = new JSDOM(TOK_DISCOVERY_WIDGET_HTML, { runScripts: "dangerously", beforeParse(window) {
      Object.defineProperty(window, "openai", { value: {
        toolOutput: payload, callTool: async (name: string, toolArgs: Record<string, unknown>) => {
          calls.push({ name, args: toolArgs });
          return { structuredContent: { ok: true, data: { required: false } } };
        }, setWidgetState() {},
      } });
    } });
    try {
      await settle(); await settle();
      const document = dom.window.document;
      expect(document.querySelector<HTMLInputElement>('input[type="number"]')?.value).toBe("7");
      expect(document.querySelector<HTMLInputElement>('input[type="date"]')?.value).toBe("2026-10-20");
      expect(document.querySelector(".tok-booking")?.textContent).toContain("19:30");
      expect(calls).toEqual([{ name: "tok_quote_reservation", args: { party_size: 7 } }]);
      const input = document.querySelector<HTMLInputElement>('input[type="number"]')!;
      input.value = "5"; input.dispatchEvent(new dom.window.Event("change"));
      dom.window.dispatchEvent(new dom.window.CustomEvent("openai:set_globals", { detail: { globals: { toolOutput: payload } } }));
      expect(document.querySelector<HTMLInputElement>('input[type="number"]')?.value).toBe("5");
      expect(calls.some((call) => call.name === "tok_book_table")).toBe(false);
      await settle(); await settle();
    } finally { dom.window.close(); }
  });

  it.each(["pending", "confirmed", "cancelled"])("renders a model booking result with truthful %s status", (status) => {
    const dom = new JSDOM(TOK_DISCOVERY_WIDGET_HTML, { runScripts: "dangerously", beforeParse(window) {
      Object.defineProperty(window, "openai", { value: { toolOutput: { ok: true, booking_result: {
        ...args, reservation_id: "00000000-0000-4000-8000-000000000999", status,
      } } } });
    } });
    try {
      const panel = dom.window.document.querySelector(".tok-booking")?.textContent;
      expect(panel).toContain(status === "confirmed" ? "Réservation acceptée par le restaurant" : status === "cancelled" ? "Réservation annulée" : "En attente de l’acceptation du restaurant");
      expect(panel).not.toContain("Réservation confirmée par TOK");
    } finally { dom.window.close(); }
  });
});
