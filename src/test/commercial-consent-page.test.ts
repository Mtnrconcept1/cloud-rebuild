import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";

const html = readFileSync("public/consentement-email.html", "utf8");
const script = readFileSync("public/consentement-email.js", "utf8");
const data = { state: "pending", receipt_id: "ref-test", email: "test@example.com", restaurant_name: "<script>injection</script>", signer_name: "Test", signer_role: "Gérant", signed_at: "2026-10-27T12:00:00Z", expires_at: "2026-10-29T12:00:00Z", signature_data: "data:image/png;base64,iVBORw0KGgo" + "A".repeat(220), document: { controller: "Exploitant", address: "Genève", contact: "test@example.com", version: "v3", text: "Texte accepté", privacy: "Notice privée" }, proof_hash: "b".repeat(64), confirmed_at: null, email_eligible: true };
async function setup(fragment = "#token=" + "a".repeat(64)) {
  const dom = new JSDOM(html, { url: "https://www.thetok.ch/consentement-email.html" + fragment, runScripts: "outside-only" });
  const fetcher = vi.fn(async (_url: string, options: RequestInit) => {
    const body = JSON.parse(String(options.body));
    return new Response(JSON.stringify({ ...data, state: body.action === "confirm" ? "confirmed" : body.action === "withdraw" ? "withdrawn" : "pending", email_eligible: body.action !== "withdraw" }));
  });
  dom.window.fetch = fetcher as unknown as typeof fetch; dom.window.AbortSignal = AbortSignal as any;
  dom.window.confirm = () => true; dom.window.eval(script);
  await new Promise(resolve => setTimeout(resolve, 10));
  return { dom, fetcher, document: dom.window.document };
}
describe("page de confirmation sans traqueur", () => {
  it("sépare l’autorisation déjà signée de la confirmation complémentaire", async () => {
    const h = await setup();
    expect(h.document.querySelector("#instruction")?.textContent).toContain("Votre signature autorise déjà");
    expect(h.document.querySelector("#instruction")?.textContent).not.toContain("Sans ce clic");
    h.dom.window.close();
  });
  it("charge seulement le reçu, sans aucune confirmation automatique ni HTML du signataire", async () => {
    const h = await setup();
    expect(h.fetcher).toHaveBeenCalledTimes(1); expect(JSON.parse(String(h.fetcher.mock.calls[0][1].body)).action).toBe("view");
    expect(h.document.querySelector("#restaurant")?.textContent).toBe(data.restaurant_name);
    expect(h.document.querySelector("#restaurant script")).toBeNull();
    expect(h.document.querySelector<HTMLButtonElement>("#confirm")?.hidden).toBe(false);
    expect(h.document.querySelector('meta[name="referrer"]')?.getAttribute("content")).toBe("no-referrer");
    expect(html).not.toMatch(/analytics|sentry|googletagmanager/i);
    expect(script).not.toMatch(/localStorage|sessionStorage|innerHTML/);
    h.dom.window.close();
  });
  it("confirme uniquement au clic explicite, puis permet le retrait", async () => {
    const h = await setup(); h.document.querySelector<HTMLButtonElement>("#confirm")!.click();
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(JSON.parse(String(h.fetcher.mock.calls[1][1].body))).toMatchObject({ action: "confirm", agree: true });
    expect(h.document.querySelector("#status")?.textContent).toContain("Confirmé");
    expect(h.document.querySelector<HTMLButtonElement>("#confirm")?.hidden).toBe(true);
    h.document.querySelector<HTMLButtonElement>("#withdraw")!.click(); await new Promise(resolve => setTimeout(resolve, 10));
    expect(JSON.parse(String(h.fetcher.mock.calls[2][1].body)).action).toBe("withdraw");
    expect(h.document.querySelector("#status")?.textContent).toContain("Retiré"); h.dom.window.close();
  });
  it("rejette un fragment altéré sans requête réseau", async () => {
    const h = await setup("#token=not-a-token"); expect(h.fetcher).not.toHaveBeenCalled();
    expect(h.document.querySelector("#error")?.textContent).toMatch(/invalide/); h.dom.window.close();
  });
});
