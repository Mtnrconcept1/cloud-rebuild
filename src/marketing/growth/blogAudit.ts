export type BlogProbe = { url: string; checkedAt: string; status: number; html: string | null; robotsHeader: string | null };
export function auditBlogPage(probe: BlogProbe) {
  const findings: { label:string; ok:boolean; detail:string }[] = [];
  const check = (label:string, ok:boolean, detail:string) => findings.push({label,ok,detail});
  check("Réponse HTTP", probe.status === 200 && probe.html !== null, String(probe.status));
  if (!probe.html) return findings;
  // Keep scripts and subresources inert. Never insert the fetched HTML into the live page.
  const template = document.createElement("template"); template.innerHTML = probe.html;
  const page = template.content;
  const titles = page.querySelectorAll("title");
  const descriptions = page.querySelectorAll('meta[name="description" i]');
  const canonicals = page.querySelectorAll('link[rel~="canonical" i]');
  const canonical = canonicals[0]?.getAttribute("href") ?? "";
  const headings = page.querySelectorAll("h1");
  const robots = [...page.querySelectorAll('meta[name="robots" i],meta[name="googlebot" i]')].map(tag => tag.getAttribute("content")).concat(probe.robotsHeader).filter(Boolean).join(", ");
  check("Titre", titles.length === 1 && !!titles[0].textContent?.trim(), titles[0]?.textContent || "Absent");
  const description = descriptions[0]?.getAttribute("content")?.trim() ?? "";
  check("Méta-description", descriptions.length === 1 && !!description, description || "Absente");
  check("Canonique", canonicals.length === 1 && canonical === probe.url, canonical || "Absente");
  check("Titre principal", headings.length === 1 && !!headings[0].textContent?.trim(), String(headings.length));
  check("Directives d’indexation", !/\b(noindex|none)\b/i.test(robots), robots || "Aucune directive explicite");
  const missingAlt = [...page.querySelectorAll("img")].filter(img => !img.hasAttribute("alt")).length;
  check("Alternatives des images", missingAlt === 0, missingAlt + " sans attribut alt");
  const expected = new URL(probe.url).pathname === "/blog" ? "Blog" : "BlogPosting";
  let found = false, broken = 0;
  for (const script of page.querySelectorAll('script[type="application/ld+json" i]')) {
    try {
      const root = JSON.parse(script.textContent ?? "");
      const nodes = Array.isArray(root) ? root : Array.isArray(root?.["@graph"]) ? root["@graph"] : [root];
      if (nodes.some(node => [node?.["@type"]].flat().includes(expected))) found = true;
    } catch { broken++; }
  }
  check("Données structurées", found && !broken, expected + (found ? " présent" : " absent") + " · " + broken + " JSON invalide(s)");
  return findings;
}
