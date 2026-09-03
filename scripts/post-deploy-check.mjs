import process from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_TARGETS = [
  {
    url: "https://www.thetok.ch/",
    expect: ["TOK", "Communes avec inventaire public"],
  },
  {
    url: "https://www.thetok.ch/recherche",
    expect: ["Trouvez un restaurant par commune, cuisine et besoin", "Communes disponibles", "Cuisines et recherches locales"],
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
    expect: ["<urlset", "https://www.thetok.ch/restaurants/"],
    reject: ["moto911.com", "Safran_Open", "menus_side_image.7077f229.jpeg"],
  },
  {
    url: "https://www.thetok.ch/restaurants/geneve",
    expect: ["adresses actives sont répertoriées sur cette page"],
    reject: ["adresses actives est répertoriées sur cette page"],
  },
  {
    url: "https://www.thetok.ch/restaurants/carouge/r/creperie-du-vieux-carouge",
    expect: ["Crêperie du Vieux-Carouge", "tok-nearby-seo-context", "distances sont calculées à vol d’oiseau"],
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
