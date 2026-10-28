import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TOK_DISCOVERY_WIDGET_HTML } from "../../supabase/functions/_shared/tok-connect-discovery-widget";
import {
  buildTokConnectPreviewDocument,
  getTokConnectPreviewWidgetScript,
  TOK_CONNECT_PREVIEW_BRIDGE_SCRIPT_PATH,
  TOK_CONNECT_PREVIEW_WIDGET_SCRIPT_PATH,
} from "@/lib/tok-connect-preview";

const origin = "https://www.thetok.ch";
const channel = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const windows: JSDOM[] = [];
function execute(html: string) {
  const dom = new JSDOM(html, { url: "https://widget.example", runScripts: "outside-only" });
  windows.push(dom);
  const parent = { postMessage: vi.fn() };
  Object.defineProperty(dom.window, "parent", { value: parent });
  Object.defineProperty(dom.window, "matchMedia", { value: () => ({ matches: false, addEventListener() {} }) });
  for (const script of dom.window.document.querySelectorAll("script")) {
    const src = script.getAttribute("src");
    const code = src === TOK_CONNECT_PREVIEW_BRIDGE_SCRIPT_PATH
      ? readFileSync("public/tok-connect-preview-bridge.js", "utf8")
      : src === TOK_CONNECT_PREVIEW_WIDGET_SCRIPT_PATH
        ? getTokConnectPreviewWidgetScript()
        : script.textContent || "";
    if (src && src !== TOK_CONNECT_PREVIEW_BRIDGE_SCRIPT_PATH && src !== TOK_CONNECT_PREVIEW_WIDGET_SCRIPT_PATH) {
      throw new Error("Unexpected widget script source: " + src);
    }
    dom.window.eval(code);
  }
  return { dom, parent, api: (dom.window as unknown as { openai: Record<string, any> }).openai };
}
afterEach(() => { for (const dom of windows.splice(0)) dom.window.close(); });

describe("widget host message boundaries", () => {
  it("production ignores legacy preview messages and exposes no preview bridge", () => {
    const { dom, parent } = execute(TOK_DISCOVERY_WIDGET_HTML);
    const initial = dom.window.document.body.textContent;
    dom.window.dispatchEvent(new dom.window.MessageEvent("message", {
      source: parent as unknown as Window, origin: "https://untrusted.example", data: { type: "tok_connect_preview", payload: { forged: true } },
    }));
    expect(dom.window.document.body.textContent).toBe(initial);
    expect(parent.postMessage).not.toHaveBeenCalled();
    expect(TOK_DISCOVERY_WIDGET_HTML).not.toContain("tok_connect_preview");
    expect(TOK_DISCOVERY_WIDGET_HTML).toContain("openai:set_globals");
  });
  it("keeps the website CSP strict while loading both preview scripts externally", () => {
    const html = buildTokConnectPreviewDocument(origin, channel);
    const document = new JSDOM(html).window.document;
    const scripts = Array.from(document.querySelectorAll("script"));
    expect(scripts.map((script) => script.getAttribute("src"))).toEqual([
      TOK_CONNECT_PREVIEW_BRIDGE_SCRIPT_PATH,
      TOK_CONNECT_PREVIEW_WIDGET_SCRIPT_PATH,
    ]);
    expect(scripts.every((script) => !script.textContent?.trim())).toBe(true);
    expect(getTokConnectPreviewWidgetScript()).toContain("function bootstrap()");
    expect(readFileSync("vite.config.ts", "utf8")).toContain("tokConnectPreviewWidgetPlugin()");
    const config = JSON.parse(readFileSync("vercel.json", "utf8")) as {
      headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
    };
    const csp = config.headers.find((entry) => entry.source === "/(.*)")?.headers
      .find((entry) => entry.key === "Content-Security-Policy")?.value || "";
    expect(csp).toContain("script-src 'self'");
    expect(csp.split(";").find((directive) => directive.includes("script-src"))).not.toContain("'unsafe-inline'");
  });
  it("preview requires the exact parent, origin and per-instance channel", () => {
    const { dom, parent, api } = execute(buildTokConnectPreviewDocument(origin, channel));
    const send = (from: object, eventOrigin: string, token: string) => dom.window.dispatchEvent(new dom.window.MessageEvent("message", {
      source: from as Window, origin: eventOrigin, data: { type: "tok_connect_preview", channel: token, payload: { accepted: true } },
    }));
    send(parent, "https://untrusted.example", channel);
    send({}, origin, channel);
    send(parent, origin, "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb");
    expect(api.toolOutput).toBeNull();
    send(parent, origin, channel);
    expect(api.toolOutput).toEqual({ accepted: true });
    expect(parent.postMessage).toHaveBeenCalledWith({ type: "tok_connect_widget_ready", channel }, origin);
  });
  it("preview tool replies cannot be spoofed by another frame or origin", async () => {
    const { dom, parent, api } = execute(buildTokConnectPreviewDocument(origin, channel));
    const result = api.callTool("get_restaurant_details", { restaurant_id: "synthetic" });
    let settled = false;
    void result.then(() => { settled = true; });
    const data = { type: "tok_preview_result", id: "call-1", channel, result: { marker: "accepted" } };
    for (const [source, eventOrigin] of [[{}, origin], [parent, "https://untrusted.example"]] as const) {
      dom.window.dispatchEvent(new dom.window.MessageEvent("message", { source: source as Window, origin: eventOrigin, data }));
    }
    await Promise.resolve();
    expect(settled).toBe(false);
    dom.window.dispatchEvent(new dom.window.MessageEvent("message", { source: parent as unknown as Window, origin, data }));
    await expect(result).resolves.toEqual({ marker: "accepted" });
  });
});
