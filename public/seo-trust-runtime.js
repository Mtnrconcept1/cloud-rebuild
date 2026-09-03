(() => {
  const ROOT_TITLE = "TOK - Restaurants à Genève : adresses, réservation et commande";
  const ROOT_DESCRIPTION = "Trouvez des restaurants à Genève et dans les communes genevoises. Comparez cuisines et adresses, puis réservez ou commandez lorsque le service est activé.";
  const SEARCH_TITLE = "Recherche de restaurants à Genève | TOK";
  const SEARCH_DESCRIPTION = "Recherchez un restaurant à Genève et dans les communes genevoises par ville, cuisine, note, offre ou service réellement disponible sur TOK.";
  const INTENT_SEGMENTS = new Set(["reservation", "pas-cher", "meilleurs"]);
  const GENERIC_STRUCTURED_IMAGE_PATHS = new Set([
    "/fond3.png",
    "/images/kebab-box-spread.jpeg",
    "/placeholder.svg",
  ]);

  let scheduled = false;
  let applying = false;

  const setMeta = (selector, value) => {
    const element = document.head.querySelector(selector);
    if (!element || element.getAttribute("content") === value) return;
    element.setAttribute("content", value);
  };

  const setCopy = (title, description) => {
    if (document.title !== title) document.title = title;
    setMeta('meta[name="description"]', description);
    setMeta('meta[property="og:title"]', title);
    setMeta('meta[property="og:description"]', description);
    setMeta('meta[property="og:image:alt"]', title);
    setMeta('meta[name="twitter:title"]', title);
    setMeta('meta[name="twitter:description"]', description);
    setMeta('meta[name="twitter:image:alt"]', title);
  };

  const isGenericStructuredImage = (value) => {
    if (typeof value !== "string" || !value.trim()) return false;
    try {
      const url = new URL(value, "https://www.thetok.ch");
      return url.hostname === "www.thetok.ch" && GENERIC_STRUCTURED_IMAGE_PATHS.has(url.pathname);
    } catch {
      return false;
    }
  };

  const sanitizeImageValue = (value) => {
    if (typeof value === "string") return isGenericStructuredImage(value) ? undefined : value;
    if (Array.isArray(value)) {
      const filtered = value.map(sanitizeImageValue).filter((item) => item !== undefined && item !== null);
      return filtered.length ? filtered : undefined;
    }
    if (value && typeof value === "object") {
      if (isGenericStructuredImage(value.url)) return undefined;
      return sanitizeStructuredData(value);
    }
    return value;
  };

  const sanitizeStructuredData = (value) => {
    if (Array.isArray(value)) return value.map(sanitizeStructuredData).filter((item) => item !== undefined);
    if (!value || typeof value !== "object") return value;

    const output = {};
    for (const [key, item] of Object.entries(value)) {
      if (key === "image" || key === "primaryImageOfPage") {
        const sanitized = sanitizeImageValue(item);
        if (sanitized !== undefined) output[key] = sanitized;
        continue;
      }
      if (key === "priceRange" && typeof item === "string" && /^CHF(?: CHF){0,3}$/.test(item.trim())) {
        output[key] = "$".repeat(item.trim().split(/\s+/).length);
        continue;
      }
      output[key] = sanitizeStructuredData(item);
    }
    return output;
  };

  const sanitizeJsonLd = () => {
    const script = document.getElementById("tok-page-json-ld");
    if (!script?.textContent) return;
    try {
      const before = script.textContent;
      const after = JSON.stringify(sanitizeStructuredData(JSON.parse(before)));
      if (after !== before) script.textContent = after;
    } catch {
      // Leave invalid legacy JSON-LD untouched; build-time validation remains authoritative.
    }
  };

  const hardenLocalCopy = (path) => {
    const parts = path.split("/").filter(Boolean);
    if (parts[0] !== "restaurants" || parts.length < 2 || parts.includes("r")) return;

    const category = parts[2] || "";
    const title = document.title;
    if (!category) {
      const match = title.match(/^Restaurant à (.+?) : réserver une table \| TOK$/i)
        || title.match(/^Restaurants à (.+?) : bonnes adresses \| TOK$/i);
      if (match) {
        const city = match[1].trim();
        setCopy(
          `Restaurants à ${city} : bonnes adresses | TOK`,
          `Trouvez des restaurants à ${city} : cuisines, adresses et services renseignés. Réservation ou commande uniquement lorsque ces services sont activés sur TOK.`,
        );
      }
    } else if (!INTENT_SEGMENTS.has(category)) {
      const pizza = title.match(/^Pizzeria à (.+?) : les meilleures adresses \| TOK$/i)
        || title.match(/^Pizzerias à (.+?) : adresses et services \| TOK$/i);
      if (pizza) {
        const city = pizza[1].trim();
        setCopy(
          `Pizzerias à ${city} : adresses et services | TOK`,
          `Trouvez une pizzeria à ${city}, comparez les adresses et consultez les services réellement renseignés sur TOK.`,
        );
      } else {
        const generic = title.match(/^Restaurant (.+?) à (.+?) \| TOK$/i);
        if (generic) {
          const cuisine = generic[1].trim();
          const city = generic[2].trim();
          setCopy(
            title,
            `Trouvez les restaurants ${cuisine} à ${city} sur TOK : adresses et services réellement renseignés.`,
          );
        }
      }
    }

    const robots = document.head.querySelector('meta[name="robots"]');
    if (robots?.content.startsWith("noindex") && robots.content !== "noindex,nofollow,noarchive") {
      robots.content = "noindex,nofollow,noarchive";
    }
  };

  const applyTrustSignals = () => {
    if (applying) return;
    applying = true;
    try {
      const path = window.location.pathname.replace(/\/+$/, "") || "/";
      if (path === "/") setCopy(ROOT_TITLE, ROOT_DESCRIPTION);
      else if (path === "/recherche") setCopy(SEARCH_TITLE, SEARCH_DESCRIPTION);
      else hardenLocalCopy(path);
      sanitizeJsonLd();
    } finally {
      applying = false;
    }
  };

  const scheduleApply = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      applyTrustSignals();
    });
  };

  applyTrustSignals();
  document.addEventListener("DOMContentLoaded", scheduleApply, { once: true });
  window.addEventListener("popstate", scheduleApply);
  new MutationObserver(scheduleApply).observe(document.head, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });
})();
