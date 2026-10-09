import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const config = JSON.parse(readFileSync("vercel.json", "utf8"));
const sources: string[] = config.rewrites.filter((rule: { destination: string }) => rule.destination === "/index.html").map((rule: { source: string }) => rule.source);
function serves(path: string) {
  return sources.some(source => new RegExp("^" + source
    .replace(/\/:path\*/g, "(?:/.*)?")
    .replace(/:surface\(([^)]+)\)/g, "(?:$1)")
    .replace(/\/:[a-zA-Z]+/g, "/[^/]+") + "/?$").test(path));
}
const missing = ["/coming-soon", "/parametres/securite", "/creneaux-garantis", "/flex-prix-bas", "/match-groupes", "/multi-restaurant", "/multi-stop", "/garantie-qualite", "/abonnement", "/tok-pulse", "/tok-connect/mcp-widget", "/restaurant/cc47c8c6-752f-406c-8c2f-ed04ebd0ca20", "/restaurateurs/lausanne"];
describe("production direct-link serving regressions", () => {
  it.each(missing)("serves the registered application route %s", path => expect(serves(path)).toBe(true));
  it.each(["/this-route-does-not-exist", "/assets/missing.js", "/api/missing", "/restaurateurs/geneve", "/restaurateurs/google-business", "/restaurateurs/alternative-commission-couvert"])("does not turn unknown assets/API routes or pre-rendered SEO pages into the SPA shell: %s", path => expect(serves(path)).toBe(false));
});
