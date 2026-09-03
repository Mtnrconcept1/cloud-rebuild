import process from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_TARGETS = [
  {
    url: "https://www.thetok.ch/",
    expect: [
      "TOK - Restaurants à Genève : adresses, réservation et commande",
      "Communes avec inventaire public",
      "Restaurants à Genève et dans les communes genevoises",
    ],
    reject: ["restaurant en Suisse"],
  },
  {
    url: "https://www.thetok.ch/recherche",
    expect: [
      "Recherche de restaurants à Genève | TOK",
      "Trouvez un restaurant par commune, cuisine et besoin",
      "Communes disponibles",
      "Cuisines et recherches locales",
    ],
    reject: ["Suisse romande"],
  },
  {
    url: "https://www.thetok.ch/actualites",
    expect: ["Actualités des restaurants sur TOK"],
  },
  {
    url: "https://www.thetok.ch/manifest.json",
    expect: ["TOK", "Réservez, commandez, profitez"],
    contentType: "application/manifest+json",
  },
  {
    url: "https://www.thetok.ch/robots.txt",
    expect: [
      "User-agent: OAI-SearchBot",
      "User-agent: GPTBot",
      "Sitemap: https://www.thetok.ch/sitemap.xml",
    ],
  },
  {
    url: "https://www.thetok.ch/sitemap.xml",
    expect: [
      "https://www.thetok.ch/sitemap-pages.xml",
      "https://www.thetok.ch/sitemap-restaurants.xml",
      "<lastmod>2026-09-03</lastmod>",
    ],
  },
  {
    url: "https://www.thetok.ch/sitemap-pages.xml",
    expect: [
      "https://www.thetok.ch/restaurateurs/geneve",
      "https://www.thetok.ch/restaurateurs/google-business",
    ],
  },
  {
    url: "https://www.thetok.ch/sitemap-restaurants.xml",
    expect: ["<urlset", "https://www.thetok.ch/restaurants/", "<lastmod>2026-09-03</lastmod>"],
    reject: ["moto911.com", "Safran_Open", "menus_side_image.7077f229.jpeg"],
  },
  {
    url: "https://www.thetok.ch/restaurants/geneve",
    expect: ["adresses actives sont répertoriées sur cette page"],
    reject: ["adresses actives est répertoriées sur cette page"],
  },
  {
    url: "https://www.thetok.ch/restaurants/carouge",
    expect: [
      "Restaurants à Carouge : bonnes adresses | TOK",
      "adresses, cuisines et services disponibles",
    ],
    reject: ["réserver une table | TOK"],
  },
  {
    url: "https://www.thetok.ch/restaurants/lausanne",
    expect: ["noindex,nofollow,noarchive"],
  },
  {
    url: "https://www.thetok.ch/restaurants/carouge/r/creperie-du-vieux-carouge",
    expect: ["Crêperie du Vieux-Carouge", "tok-nearby-seo-context", "distances sont calculées à vol d’oiseau"],
  },
  {
    url: "https://www.thetok.ch/restaurants/carouge/r/le-jardin-de-pinchat",
    expect: ["Le Jardin de Pinchat", "tok-nearby-seo-context"],
    jsonLdExpect: ['"priceRange":"$$"'],
    jsonLdReject: ["fond3.png", "kebab-box-spread.jpeg", "CHF CHF"],
  },
  {
    url: "https://www.thetok.ch/restaurants/geneve/r/le-samourai",
    expect: ["Le Samouraï"],
    reject: [">Monsite<", '"name":"Monsite"'],
  },
  {
    url: "https://www.thetok.ch/restaurants/geneve/r/mamasan-paquis-1c1d4df5",
    expect: ["Mamasan - Pâquis"],
    reject: ["Mamasan Web"],
  },
  {
    url: "https://www.thetok.ch/restaurants/geneve/r/shogun",
    expect: ["Shogun", "https://www.thetok.ch/fond3.png"],
    reject: ["moto911.com"],
  },
  {
    url: "https://www.thetok.ch/restaurants/geneve/r/restaurant-le-safran",
    expect: ["Restaurant Le Safran", "https://www.thetok.ch/fond3.png"],
    reject: ["Safran_Open", "safran.com/hubfs"],
  },
  {
    url: "https://www.thetok.ch/restaurateurs/geneve",
    expect: [
      "La plateforme restaurateur pour transformer la demande locale",
      "Plan d'activation Genève",
      "Optimiser Google Business",
    ],
  },
  {
    url: "https://www.thetok.ch/restaurateurs/google-business",
    expect: [
      "Transformez votre fiche Google Business en canal direct",
      "Bascule du bouton Google",
      "Remplacer le bouton quand les services sont prêts",
    ],
  },
  {
    url: "https://www.thetok.ch/auth/callback",
    expect: ["<div id=\"root\""],
    expectedHeaders: {
      "x-robots-tag": "noindex",
    },
  },
  {
    url: "https://www.thetok.ch/route-inexistante-seo-post-deploy-check",
    expectedStatus: 404,
    expect: ["Page introuvable", "noindex,nofollow,noarchive"],
  },
];

async function fetchText(target) {
  const response = await fetch(target.url, {
    redirect: "follow",
    headers: {
      "user-agent": "tok-post-deploy-check/1.0",
    },
  });

  const text = await response.text();
  return { response, text };
}

function jsonLdPayload(text) {
  const match = String(text).match(/<script\b[^>]*id=["']tok-page-json-ld["'][^>]*>([\s\S]*?)<\/script>/i);
  return match?.[1] || "";
}

export async function runPostDeployCheck(targets = DEFAULT_TARGETS) {
  const failures = [];

  for (const target of targets) {
    try {
      const { response, text } = await fetchText(target);
      const expectedStatus = target.expectedStatus || 200;
      if (response.status !== expectedStatus) {
        failures.push(`${target.url} returned ${response.status}, expected ${expectedStatus}`);
        continue;
      }

      const contentType = response.headers.get("content-type") || "";
      if (target.contentType && !contentType.includes(target.contentType) && !contentType.includes("application/json")) {
        failures.push(`${target.url} returned unexpected content-type ${contentType}`);
      }

      for (const expected of target.expect || []) {
        if (!text.includes(expected)) {
          failures.push(`${target.url} is missing expected content: ${expected}`);
        }
      }

      for (const rejected of target.reject || []) {
        if (text.includes(rejected)) {
          failures.push(`${target.url} contains rejected content: ${rejected}`);
        }
      }

      if ((target.jsonLdExpect?.length || 0) > 0 || (target.jsonLdReject?.length || 0) > 0) {
        const jsonLd = jsonLdPayload(text);
        if (!jsonLd) {
          failures.push(`${target.url} is missing tok-page-json-ld`);
        } else {
          for (const expected of target.jsonLdExpect || []) {
            if (!jsonLd.includes(expected)) failures.push(`${target.url} JSON-LD is missing expected content: ${expected}`);
          }
          for (const rejected of target.jsonLdReject || []) {
            if (jsonLd.includes(rejected)) failures.push(`${target.url} JSON-LD contains rejected content: ${rejected}`);
          }
        }
      }

      for (const [headerName, expected] of Object.entries(target.expectedHeaders || {})) {
        const actual = response.headers.get(headerName) || "";
        if (!actual.toLowerCase().includes(String(expected).toLowerCase())) {
          failures.push(`${target.url} returned unexpected ${headerName}: ${actual || "(missing)"}`);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${target.url} failed: ${message}`);
    }
  }

  return {
    ok: failures.length === 0,
    failures,
  };
}

function printResult(result) {
  console.log("TOK post-deploy check");
  console.log("=====================");
  console.log(`Result: ${result.ok ? "OK" : "FAIL"}`);
  for (const failure of result.failures) {
    console.log(`- ${failure}`);
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  const result = await runPostDeployCheck();
  printResult(result);
  process.exit(result.ok ? 0 : 1);
}
