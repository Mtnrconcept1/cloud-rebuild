import { describe, expect, it } from "vitest";
import { renderMarketingEmail } from "../../supabase/functions/_shared/marketing-email-template";
import { renderTargetedMailingEmail } from "../../supabase/functions/_shared/marketing-mailing-email";

const brand = {
  siteUrl: "https://www.thetok.ch", senderName: "TOK", senderAddress: "Genève, Suisse",
  unsubscribeUrl: "https://www.thetok.ch/marketing-unsubscribe?token=test&source=mail",
};
const content = {
  headline: "Votre restaurant a des choses à dire", body: "Partagez vos nouveautés et vos plats.",
  callToAction: "Découvrir TOK", callToActionUrl: "https://www.thetok.ch/packs-restaurateur",
  visualUrl: "https://cdn.example.ch/affiche-tok.jpg",
};
const doc = (html: string) => new DOMParser().parseFromString(html, "text/html");

describe("TOK image-first mailing email", () => {
  it("renders a single clickable, fluid image with the exact destination, no crop and Outlook 600px fallback", () => {
    const { html, text } = renderMarketingEmail(content, brand);
    const document = doc(html);
    expect(document.images).toHaveLength(1);
    const image = document.images[0];
    expect(image.getAttribute("src")).toBe(content.visualUrl);
    expect(image.getAttribute("width")).toBe("600");
    expect(image.getAttribute("style")).toContain("width:100%;max-width:600px;height:auto");
    expect(image.closest("a")?.getAttribute("href")).toBe(content.callToActionUrl);
    expect(html).toContain('<!--[if mso]><table role="presentation" width="600"');
    expect(html).not.toMatch(/object-fit|display:(?:flex|grid)/);
    expect(text).toContain(content.body);
    expect(text).toContain(content.callToActionUrl);
  });
  it("preserves recipient-specific unsubscribe, sender and readable text alternative", () => {
    const { html, text } = renderMarketingEmail(content, brand);
    const document = doc(html);
    expect(document.body.textContent).toContain("TOK — Genève, Suisse");
    expect(Array.from(document.links).map(a => a.getAttribute("href"))).toContain(brand.unsubscribeUrl);
    expect(html).toContain("token=test&amp;source=mail");
    expect(text).toContain("Se désabonner : " + brand.unsubscribeUrl);
  });
  it("uses the branded TOK email fallback with its real chef and an accessible button", () => {
    const { html } = renderMarketingEmail({ ...content, visualUrl: null }, brand);
    const document = doc(html);
    expect(document.images).toHaveLength(2);
    expect(Array.from(document.images).map(image => image.getAttribute("src"))).toEqual([
      "https://www.thetok.ch/logotok.png", "https://www.thetok.ch/chef2.png",
    ]);
    expect(document.querySelector("h1")?.textContent).toBe(content.headline);
    expect(document.body.textContent).toContain("Pensé pour les restaurateurs.");
    expect(document.body.textContent).toContain("Vos actualités");
    expect(html).toContain("#FF4B11");
    expect(html).not.toMatch(/object-fit|display:(?:flex|grid)/);
    expect(document.body.textContent).toContain(content.body);
    expect(Array.from(document.links).map(a=>a.getAttribute("href"))).toContain(content.callToActionUrl);
  });
  it("uses the same shared renderer for campaign previews and actual dispatch", () => {
    const { html } = renderTargetedMailingEmail({
      subject: "Actualités TOK", headline: content.headline, body: content.body,
      callToAction: content.callToAction, visualUrl: content.visualUrl,
    }, brand.unsubscribeUrl);
    expect(doc(html).images).toHaveLength(1);
    expect(doc(html).images[0].closest("a")?.getAttribute("href")).toBe("https://www.thetok.ch/packs-restaurateur");
  });
  it.each([
    "http://example.ch/a.jpg", "javascript:alert(1)",
    "https://username:password@example.ch/a.jpg", 'https://example.ch/" onerror="bad()',
  ])("rejects unsafe URL %s without interpolating it into HTML", unsafe => {
    const { html } = renderMarketingEmail({ ...content, visualUrl: unsafe, callToActionUrl: unsafe }, brand);
    expect(doc(html).images).toHaveLength(2);
    expect(Array.from(doc(html).images).every(image => image.getAttribute("src")?.startsWith("https://www.thetok.ch/"))).toBe(true);
    expect(html).not.toContain(unsafe);
    expect(Array.from(doc(html).links).map(a=>a.getAttribute("href"))).toContain("https://www.thetok.ch/");
  });
  it("escapes unsafe authored strings and keeps a working unsubscribe", () => {
    const { html } = renderMarketingEmail({ ...content, headline: '<script>alert("x")</script> & TOK' },
      { ...brand, senderName: "<script>evil</script>" });
    const document = doc(html);
    expect(document.querySelectorAll("script")).toHaveLength(0);
    expect(html).toContain("&lt;script&gt;");
    expect(Array.from(document.links).some(link => link.getAttribute("href") === brand.unsubscribeUrl)).toBe(true);
  });
});
