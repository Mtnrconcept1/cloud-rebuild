import type { MarketingBacklinkRel } from "@/marketing/types";

export function findTokBacklink(html:string, source:string, target:string) {
  const expected = new URL(target);
  if (expected.protocol !== "https:" || !["thetok.ch","www.thetok.ch"].includes(expected.hostname) || expected.port || expected.username || expected.password) throw new Error("Indiquez une URL HTTPS du site TOK.");
  expected.hash = "";
  const template=document.createElement("template");
  template.innerHTML=html;
  const base=template.content.querySelector("base[href]")?.getAttribute("href");
  const baseUrl=base ? new URL(base,source).href : source;
  for (const anchor of template.content.querySelectorAll("a[href]")) {
    const href=anchor.getAttribute("href")?.trim();
    if (!href) continue;
    let dest: URL;
    try { dest = new URL(href,baseUrl); } catch { continue; }
    dest.hash="";
    if (dest.href !== expected.href) continue;
    const rel=(anchor.getAttribute("rel") || "").toLowerCase().split(/\s+/);
    const kind:MarketingBacklinkRel = rel.includes("sponsored") ? "sponsored" : rel.includes("ugc") ? "ugc" : rel.includes("nofollow") ? "nofollow" : "follow";
    return {kind, rel:rel.filter(Boolean).join(" "), anchor:(anchor.textContent || anchor.querySelector("img")?.alt || "").trim().slice(0,240)};
  }
  return null;
}
