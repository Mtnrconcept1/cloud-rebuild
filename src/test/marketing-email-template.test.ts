import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderMarketingEmail } from "../../supabase/functions/_shared/marketing-email-template";
import { renderTargetedMailingEmail } from "../../supabase/functions/_shared/marketing-mailing-email";

const content = {
  headline: "Faites découvrir votre restaurant",
  body: "Un premier paragraphe.\nUne seconde ligne.\n\nEt la suite du message.",
  callToAction: "Découvrir les packs TOK",
  callToActionUrl: "https://www.thetok.ch/packs-restaurateur",
  visualUrl: null,
};
const brand = {
  siteUrl: "https://www.thetok.ch",
  senderName: "TOK",
  senderAddress: "Genève, Suisse",
  unsubscribeUrl: "https://www.thetok.ch/marketing-unsubscribe?token=example",
};
const promotionUrl = "https://www.thetok.ch/dashboard/campagnes";
const documentFor = (html: string) => new DOMParser().parseFromString(html, "text/html");
const publicAsset = (src: string) => readFileSync(resolve(process.cwd(), "public", new URL(src).pathname.slice(1)));

describe("TOK email renderer", () => {
  it("uses fluid tables with an Outlook width fallback and preserves long content", () => {
    const body = "Restaurant".repeat(700);
    const { html } = renderMarketingEmail({ ...content, body }, brand);
    const document = documentFor(html);
    expect(html).toContain('<!--[if mso]><table role="presentation" width="600"');
    expect(document.querySelector('table[width="600"]')).toBeNull();
    expect(document.querySelector('table[style*="max-width:600px"]')?.getAttribute("width")).toBe("100%");
    expect(document.querySelectorAll('table:not([role="presentation"])')).toHaveLength(0);
    expect(html).not.toMatch(/display:(?:flex|grid)/);
    expect(document.body.textContent).toContain(body);
    expect(html).toContain("overflow-wrap:anywhere;word-break:break-word");
    expect(Buffer.byteLength(html)).toBeLessThan(102000);
  });

  it("renders the supplied TOK logo from an existing, lightweight email asset", () => {
    const document = documentFor(renderMarketingEmail(content, brand).html);
    const logo = document.querySelector('img[alt="TOK"]');
    expect(logo?.getAttribute("src")).toBe("https://www.thetok.ch/marketing/email/tok-logo.jpg");
    expect(logo?.getAttribute("width")).toBe("128");
    expect(logo?.getAttribute("style")).toContain("height:auto");
    const bytes = publicAsset(logo!.getAttribute("src")!);
    expect([...bytes.subarray(0, 3)]).toEqual([255, 216, 255]);
    expect(bytes.length).toBeLessThan(50000);
  });

  it("renders an orange restaurant promotion with the full artwork, live CTA and text alternative", () => {
    const { html, text } = renderMarketingEmail(content, brand);
    const document = documentFor(html);
    const banner = document.querySelector('table[bgcolor="#FF4B00"]');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain("Ton resto mis en avant");
    expect(banner?.textContent).toContain("CHF 1.–");
    expect(banner?.textContent).toContain("Mettre mon restaurant en avant");
    expect(Array.from(banner!.querySelectorAll("a"), (link) => link.getAttribute("href"))).toEqual([promotionUrl, promotionUrl]);
    const illustration = banner!.querySelector("img")!;
    expect(illustration.getAttribute("src")).toBe("https://www.thetok.ch/marketing/email/restaurant-promotion.png");
    expect(illustration.getAttribute("style")).toContain("height:auto");
    const bytes = publicAsset(illustration.getAttribute("src")!);
    expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([480, 720]);
    expect(bytes.length).toBeLessThan(400000);
    expect(html).not.toMatch(/\/(?:chef|logo3df)\.png/);
    expect(text).toContain("Ton resto mis en avant à partir de CHF 1.–");
    expect(text).toContain(`Mettre mon restaurant en avant : ${promotionUrl}`);
  });

  it("preserves the editorial CTA before the promotion, including drafts awaiting a manual image", () => {
    const { html, text } = renderTargetedMailingEmail({ ...content, subject: "Pour votre restaurant" });
    const document = documentFor(html);
    const editorialCta = Array.from(document.querySelectorAll("a")).find((link) => link.textContent?.includes(content.callToAction));
    expect(editorialCta?.getAttribute("href")).toBe("https://www.thetok.ch/packs-restaurateur");
    expect(html.indexOf(content.callToAction)).toBeLessThan(html.indexOf("Ton resto mis en avant"));
    expect(text).toContain(`${content.callToAction} : https://www.thetok.ch/packs-restaurateur`);
    expect(document.querySelectorAll("img")).toHaveLength(2);
    expect(html).not.toContain("undefined");
  });

  it("displays the current uploaded image proportionally without cropping it", () => {
    const visualUrl = "https://cdn.example.ch/mailings/email-2.jpg?version=2&image=manual";
    const document = documentFor(renderMarketingEmail({ ...content, visualUrl }, brand).html);
    const visual = Array.from(document.images).find((image) => image.getAttribute("src") === visualUrl);
    expect(document.images).toHaveLength(3);
    expect(visual?.getAttribute("style")).toContain("width:100%;max-width:552px;height:auto");
    expect(visual?.hasAttribute("height")).toBe(false);
    expect(visual?.getAttribute("style")).not.toContain("object-fit");
  });

  it("resolves both brand images from the configured site's origin", () => {
    const document = documentFor(renderMarketingEmail(content, { ...brand, siteUrl: "https://preview.example.ch/path/?campaign=tok" }).html);
    expect(Array.from(document.images, (image) => image.getAttribute("src"))).toEqual([
      "https://preview.example.ch/marketing/email/tok-logo.jpg", "https://preview.example.ch/marketing/email/restaurant-promotion.png",
    ]);
    expect(document.querySelector(`a[href="${promotionUrl}"]`)).not.toBeNull();
  });

  it("escapes authored content and URL attributes while retaining their intended text", () => {
    const headline = '<script>alert("headline")</script> & TOK';
    const senderName = '<img src=x onerror="bad()">';
    const cta = 'Découvrir "TOK" & ses offres';
    const ctaUrl = "https://www.thetok.ch/packs-restaurateur?a=1&b=2";
    const unsubscribeUrl = "https://www.thetok.ch/marketing-unsubscribe?token=safe&source=mail";
    const { html } = renderMarketingEmail({ ...content, headline, body: "<b>Texte</b>\nLigne\n\nParagraphe", callToAction: cta, callToActionUrl: ctaUrl }, { ...brand, senderName, unsubscribeUrl });
    const document = documentFor(html);
    expect(document.querySelector("script, [onerror], b")).toBeNull();
    expect(document.querySelector("h1")?.textContent).toContain(headline);
    expect(document.body.textContent).toContain(senderName);
    expect(document.body.textContent).toContain(cta);
    expect(document.querySelectorAll("br").length).toBeGreaterThanOrEqual(2);
    expect(Array.from(document.links, (link) => link.getAttribute("href"))).toContain(ctaUrl);
    expect(Array.from(document.links, (link) => link.getAttribute("href"))).toContain(unsubscribeUrl);
    expect(html).toContain("a=1&amp;b=2");
    expect(html).toContain("token=safe&amp;source=mail");
  });

  it("includes a bounded inbox preheader, sender identity and visible unsubscribe link in both alternatives", () => {
    const { html, text } = renderMarketingEmail({ ...content, preheader: "A".repeat(160) }, brand);
    const document = documentFor(html);
    const preheader = document.querySelector('div[style*="display:none;max-height:0;overflow:hidden"]');
    expect(preheader?.textContent).toBe("A".repeat(140));
    expect(document.body.textContent).toContain("TOK · Genève, Suisse");
    expect(Array.from(document.links).find((link) => link.textContent === "Se désabonner en un clic")?.getAttribute("href")).toBe(brand.unsubscribeUrl);
    expect(text).toContain(content.body);
    expect(text).toContain("TOK · Genève, Suisse");
    expect(text).toContain(`Se désabonner : ${brand.unsubscribeUrl}`);
  });

  it("does not invent an unsubscribe destination or an empty editorial button in a preview", () => {
    const { html } = renderMarketingEmail({ ...content, callToAction: "" }, { ...brand, unsubscribeUrl: undefined });
    const document = documentFor(html);
    expect(document.body.textContent).not.toContain("Se désabonner en un clic");
    expect(Array.from(document.links).some((link) => link.textContent?.trim() === "Mettre mon restaurant en avant")).toBe(true);
    expect(Array.from(document.links).filter((link) => link.textContent?.trim())).toHaveLength(1);
  });

  it.each(["http://example.ch/picture.png", "javascript:alert(1)", "https://user:password@example.ch/image.png", 'https://example.ch/" onerror="bad()'])(
    "rejects unsafe image, CTA, brand and unsubscribe URLs: %s", (unsafe) => {
      const { html, text } = renderMarketingEmail({ ...content, visualUrl: unsafe, callToActionUrl: unsafe }, { ...brand, siteUrl: unsafe, unsubscribeUrl: unsafe });
      const document = documentFor(html);
      expect(document.images).toHaveLength(2);
      expect(Array.from(document.images, (image) => image.getAttribute("src"))).toContain("https://www.thetok.ch/marketing/email/tok-logo.jpg");
      expect(Array.from(document.links, (link) => link.getAttribute("href"))).toContain("https://www.thetok.ch");
      expect(html).not.toContain(unsafe);
      expect(text).not.toContain("Se désabonner :");
    });
});
