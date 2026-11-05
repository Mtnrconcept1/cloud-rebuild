import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("TOK Connect marketing widget routing regression", () => {
  const gateway = read("supabase/functions/tok-connect-chatgpt/index.ts");
  const fullApp = read("supabase/functions/tok-connect-full-app-mcp/index.ts");

  it("dispatches full-app HTML widget resources to the full-app MCP before generic fallback", () => {
    const dispatch = gateway.indexOf('uri === "ui://tok-connect/full-app-console-v1.html"');
    const fallback = gateway.indexOf("return await fallbackRead(req, rpc);", dispatch);
    expect(dispatch).toBeGreaterThan(-1);
    expect(fallback).toBeGreaterThan(dispatch);
    expect(gateway.slice(dispatch, fallback)).toContain("internalMcp(FULL_APP_MCP, rpc, req)");
    expect(fullApp).toContain('mimeType: "text/html;profile=mcp-app"');
    expect(fullApp).toContain('text: FULL_APP_WIDGET_HTML');
  });

  it("exposes the marketing administrator focus with a working entry", () => {
    expect(fullApp).toContain('"marketing_operations"');
    expect(fullApp).toContain('"overview", "client", "restaurateur", "admin", "marketing"');
    expect(fullApp).toContain('focus === "marketing"');
    expect(fullApp).toContain("https://marketing.thetok.ch/marketing?view=campaigns");
    expect(fullApp).toContain("Ouvrir Marketing TOK");
  });
});
