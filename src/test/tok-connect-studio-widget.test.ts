import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const gatewaySource = readFileSync("supabase/functions/tok-connect-chatgpt/index.ts", "utf8");
const start = gatewaySource.indexOf("const ACTION_WINDOW_HTML =");
const end = gatewaySource.indexOf("function jsonRpcResult", start);
if (start < 0 || end < start) throw new Error("TOK action widget resource missing");
const js = ts.transpileModule(gatewaySource.slice(start, end), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const html = new Function(js + ";return ACTION_WINDOW_HTML;")() as string;

function render(payload: Record<string, unknown>) {
  const dom = new JSDOM(html, {
    url: "https://www.thetok.ch",
    runScripts: "dangerously",
    beforeParse(window) {
      Object.defineProperty(window, "openai", {
        value: { toolOutput: { structuredContent: payload } },
        configurable: true,
      });
    },
  });
  return dom.window.document;
}

describe("TOK MCP restaurant action widget", () => {
  it("renders an unlaunched Campaign Studio draft without suggesting publication", () => {
    const document = render({
      ok: true, data: { run: { status: "draft", plan: { title: "Campagne du midi" } } },
    });
    expect(document.getElementById("tool")?.textContent).toBe("Studio Marketing");
    expect(document.getElementById("actions")?.textContent).toContain("Brouillon enregistré");
    expect(document.getElementById("actions")?.textContent).toContain("Aucune campagne publiée");
    expect(document.getElementById("actions")?.textContent).toContain("Campagne du midi");
  });

  it("displays an actual native TOK photo and does not add artwork overlays", () => {
    const imageUrl = "https://wwcrtyoueexyxkkikaos.supabase.co/storage/v1/object/public/restaurant-images/example.png";
    const document = render({ ok: true, data: { assetId: "native-asset", gallery_image_url: imageUrl } });
    const image = document.querySelector<HTMLImageElement>("#actions img");
    expect(document.getElementById("tool")?.textContent).toBe("Visuel TOK généré");
    expect(image?.src).toBe(imageUrl);
    expect(document.getElementById("actions")?.textContent).toContain("Publication et association au menu distinctes");
    expect(gatewaySource).toContain("resource_domains: [PUBLIC_ORIGIN, SUPABASE_URL]");
  });

  it("shows native menu updates and marks refusals rather than inventing success", () => {
    const document = render({ ok: true, item: { id: "123", name: "Burger maison", image_url: "https://example.invalid/menu.png" } });
    expect(document.getElementById("tool")?.textContent).toBe("Menu TOK");
    expect(document.getElementById("actions")?.textContent).toContain("Burger maison");
    const rejected = render({ ok: false, error: { code: "restaurant_not_owned" } });
    expect(rejected.getElementById("tool")?.textContent).toBe("Action refusée");
    expect(rejected.getElementById("actions")?.textContent).toContain("TOK a refusé");
  });
  it("renders the canonical stored marketing result through the gateway resource", () => {
    const imageUrl = "https://wwcrtyoueexyxkkikaos.supabase.co/storage/v1/object/public/restaurant-images/visual.png";
    const document = render({ marketing_visual: { status: "stored", image_url: imageUrl }, replayed: false });
    expect(document.querySelector("#tool")?.textContent).toBe("Visuel TOK généré");
    expect(document.querySelector("#actions img")?.getAttribute("src")).toBe(imageUrl);
    expect(document.querySelector("#actions")?.textContent).toContain("Aucune publication automatique");
  });

  it("does not claim an image was stored for a preview or failed generation", () => {
    const imageUrl = "https://wwcrtyoueexyxkkikaos.supabase.co/storage/v1/object/public/restaurant-images/visual.png";
    const preview = render({ marketing_visual: { status: "preview", image_url: imageUrl } });
    expect(preview.querySelector("#actions img")).toBeNull();
    const refused = render({ ok: false, error: { code: "ai_credits_exhausted" } });
    expect(refused.querySelector("#tool")?.textContent).toBe("Action refusée");
    expect(refused.querySelector("#actions img")).toBeNull();
  });

});
