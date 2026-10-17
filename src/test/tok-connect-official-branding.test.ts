import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import {
  TOK_DISCOVERY_OFFICIAL_LOGO_URL,
  TOK_DISCOVERY_WIDGET_HTML,
  buildTokDiscoveryResourceDescriptor,
} from "../../supabase/functions/_shared/tok-connect-discovery-widget";

const officialLogo = "https://www.thetok.ch/logotok.png";
const fullConsole = readFileSync("supabase/functions/tok-connect-full-app-mcp/index.ts", "utf8");

function discoveryWidget() {
  const dom = new JSDOM(TOK_DISCOVERY_WIDGET_HTML, {
    url: "https://www.thetok.ch",
    runScripts: "dangerously",
    beforeParse(window) {
      Object.defineProperty(window, "openai", {
        value: {
          toolOutput: {
            kind: "restaurant_selection",
            title: "Découverte TOK",
            subtitle: "Restaurants disponibles",
            groups: [],
            notes: [],
            restaurants: [{ id: "e3fe6844-5cc8-440c-9536-0e169ef202a7", name: "Chez TOK", city: "Genève", group_key: "all" }],
          },
          setWidgetState: () => undefined,
        },
      });
    },
  });
  return dom;
}

describe("Official TOK branding across ChatGPT MCP widgets", () => {
  it("uses the existing official domain logo and allows its image via a restrictive widget CSP", () => {
    expect(TOK_DISCOVERY_OFFICIAL_LOGO_URL).toBe(officialLogo);
    const descriptor = buildTokDiscoveryResourceDescriptor("https://www.thetok.ch");
    expect(descriptor._meta["openai/widgetCSP"].resource_domains).toContain("https://www.thetok.ch");
    expect(descriptor._meta.ui.csp.connectDomains).toEqual([]);
    expect(TOK_DISCOVERY_WIDGET_HTML).toContain(officialLogo);
  });

  it("displays the official branded image instead of the placeholder TOK square", () => {
    const dom = discoveryWidget();
    try {
      const mark = dom.window.document.querySelector("header.hero .mark");
      const image = mark?.querySelector<HTMLImageElement>("img");
      expect(image).toBeTruthy();
      expect(image?.getAttribute("src")).toBe(officialLogo);
      expect(image?.getAttribute("alt")).toContain("logo officiel");
      expect(mark?.textContent).not.toBe("TOK");
      expect(dom.window.document.querySelectorAll("header.hero .mark img")).toHaveLength(1);
      expect(dom.window.document.body.textContent).toContain("Chez TOK");
    } finally { dom.window.close(); }
  });

  it("falls back to an accessible TOK wordmark if image loading fails", () => {
    const dom = discoveryWidget();
    try {
      const image = dom.window.document.querySelector<HTMLImageElement>("header.hero .mark img");
      expect(image).toBeTruthy();
      image?.dispatchEvent(new dom.window.Event("error"));
      const mark = dom.window.document.querySelector("header.hero .mark");
      expect(mark?.classList.contains("logo-fallback")).toBe(true);
      expect(mark?.textContent).toBe("TOK");
      expect(mark?.querySelector("img")).toBeNull();
    } finally { dom.window.close(); }
  });

  it("keeps the header legible on narrow screens and uses the same logo in restaurant details", () => {
    expect(TOK_DISCOVERY_WIDGET_HTML).toContain("grid-template-columns:56px minmax(0,1fr)");
    expect(TOK_DISCOVERY_WIDGET_HTML).toContain(".hero-side{grid-column:1/-1;");
    expect(TOK_DISCOVERY_WIDGET_HTML).toContain("@media(min-width:760px)");
    expect(TOK_DISCOVERY_WIDGET_HTML).toContain(".detail-top .mark");
    expect(TOK_DISCOVERY_WIDGET_HTML).toContain("detail.rank ? h('span'");
    expect(TOK_DISCOVERY_WIDGET_HTML).toContain("officialTokMark()");
    expect(TOK_DISCOVERY_WIDGET_HTML).not.toContain("innerHTML");
    expect(TOK_DISCOVERY_WIDGET_HTML).not.toContain("<script src");
  });

  it("uses the official TOK logo in the full application console and preserves its mobile layout", () => {
    expect(fullConsole).toContain(officialLogo);
    expect(fullConsole).toContain("alt=\"TOK · logo officiel avec toque de chef et moustache\"");
    expect(fullConsole).toContain(".tok-logo-link img { display: block;");
    expect(fullConsole).toContain("@media (max-width: 620px)");
    expect(fullConsole).toContain("tok-navbar");
  });
});
