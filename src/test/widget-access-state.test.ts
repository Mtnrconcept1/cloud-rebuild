import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { TOK_DISCOVERY_WIDGET_HTML } from "../../supabase/functions/_shared/tok-connect-discovery-widget.ts";

const restaurant = "12f4babe-9438-4fda-8892-20c26ea7f7bb";
function widget(bookable: boolean, roleError = false) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const detail = { id: restaurant, name: "Test TOK", supports_reservation: bookable,
    availability: { date: "2099-10-17", slots: [{ time: "19:00", available: true }] } };
  const host = { theme: "light", toolOutput: { kind: "restaurant_detail", detail,
    booking_intent: { restaurant_id: restaurant, date: "2099-10-18", time: "19:00", party_size: 7, timezone: "Europe/Zurich" } },
    callTool: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (roleError) return { structuredContent: { ok: false, error: { message: JSON.stringify({ error: "Forbidden", required_roles: ["client"], actual_roles: ["restaurateur"] }) } } };
      if (name === "tok_quote_reservation") return { structuredContent: { required: false } };
      throw new Error("Unexpected tool: " + name);
    }, setWidgetState: () => undefined, requestDisplayMode: () => undefined };
  const dom = new JSDOM(TOK_DISCOVERY_WIDGET_HTML, { url: "https://www.thetok.ch", runScripts: "dangerously",
    beforeParse(window) { Object.defineProperty(window, "openai", { value: host }); } });
  const settle = async () => { await new Promise((resolve) => setTimeout(resolve, 0)); await new Promise((resolve) => setTimeout(resolve, 0)); };
  return { dom, calls, settle };
}

describe("TOK booking widget access states", () => {
  it("keeps the exact prepared details but blocks non-bookable restaurants without autoquote", async () => {
    const h = widget(false); await h.settle();
    const doc = h.dom.window.document;
    expect(doc.body.textContent).toContain("Ce restaurant n’accepte pas les réservations de table sur TOK.");
    expect((doc.querySelector('input[type="date"]') as HTMLInputElement).value).toBe("2099-10-18");
    expect((doc.querySelector('input[type="number"]') as HTMLInputElement).value).toBe("7");
    expect(doc.querySelector('[aria-pressed="true"]')?.textContent).toBe("19:00");
    const confirm = Array.from(doc.querySelectorAll("button")).find((button) => button.textContent === "Confirmer cette réservation")!;
    expect(confirm.disabled).toBe(true); confirm.click();
    const guests = doc.querySelector('input[type="number"]') as HTMLInputElement;
    guests.value = "8"; guests.dispatchEvent(new h.dom.window.Event("change", { bubbles: true }));
    await h.settle(); expect(h.calls).toEqual([]);
    h.dom.window.close();
  });
  it("shows a human client account message instead of backend role JSON", async () => {
    const h = widget(true, true); await h.settle();
    const text = h.dom.window.document.getElementById("root")!.textContent;
    expect(text).toContain("Utilisez un compte client TOK pour réserver");
    expect(text).not.toContain("required_roles"); expect(text).not.toContain("Forbidden");
    expect(h.calls).toEqual([{ name: "tok_quote_reservation", args: { party_size: 7 } }]);
    const confirm = Array.from(h.dom.window.document.querySelectorAll("button")).find((button) => button.textContent === "Confirmer cette réservation")!;
    expect(confirm.disabled).toBe(true); h.dom.window.close();
  });
  it("still quotes the exact party size and enables a supported restaurant", async () => {
    const h = widget(true); await h.settle();
    expect(h.calls).toEqual([{ name: "tok_quote_reservation", args: { party_size: 7 } }]);
    const confirm = Array.from(h.dom.window.document.querySelectorAll("button")).find((button) => button.textContent === "Confirmer cette réservation")!;
    expect(confirm.disabled).toBe(false); h.dom.window.close();
  });
});


describe("TOK reservation history tool output", () => {
  it.each([false, true])("renders history delivered by the model without an extra call (nested=%s)", (nested) => {
    const calls: string[] = [];
    const result = { ok: true, kind: "reservations", items: [
      { id: "cancelled-booking", date: "2099-10-18", time: "19:00:00", party_size: 2, status: "cancelled", feature: "classique" },
      { id: "accepted-booking", date: "2099-10-19", time: "20:00:00", party_size: 4, status: "confirmed", feature: "classique" },
    ] };
    const unchanged = JSON.stringify(result);
    const dom = new JSDOM(TOK_DISCOVERY_WIDGET_HTML, { url: "https://www.thetok.ch", runScripts: "dangerously", beforeParse(window) {
      Object.defineProperty(window, "openai", { value: { toolOutput: nested ? { structuredContent: { ok: true, data: result } } : result,
        callTool: (name: string) => { calls.push(name); }, setWidgetState: () => undefined } });
    } });
    const root = dom.window.document.getElementById("root")!;
    expect(root.textContent).toContain("Mes réservations TOK");
    expect(root.textContent).toContain("Statut : cancelled · 2 convive(s)");
    expect(root.textContent).toContain("Statut : confirmed · 4 convive(s)");
    expect(root.textContent).not.toContain("TOK Connect est prêt");
    expect(root.querySelectorAll(".tok-booking")).toHaveLength(2);
    expect(root.querySelectorAll("button")).toHaveLength(2); // back + explicit cancel request for active booking only
    expect(calls).toEqual([]); expect(JSON.stringify(result)).toBe(unchanged); dom.window.close();
  });
  it("renders the empty history rather than the generic welcome", () => {
    const dom = new JSDOM(TOK_DISCOVERY_WIDGET_HTML, { runScripts: "dangerously", beforeParse(window) {
      Object.defineProperty(window, "openai", { value: { toolOutput: { ok: true, kind: "reservations", items: [] } } });
    } });
    expect(dom.window.document.getElementById("root")!.textContent).toContain("Aucune réservation visible sur votre compte TOK."); dom.window.close();
  });
});
