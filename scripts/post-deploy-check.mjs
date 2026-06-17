import process from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_TARGETS = [
  {
    url: "https://www.thetok.ch/",
    expect: ["TOK", "Réservez"],
  },
  {
    url: "https://www.thetok.ch/manifest.json",
    expect: ["TOK", "Réservez, commandez, profitez"],
    contentType: "application/manifest+json",
  },
  {
    url: "https://www.thetok.ch/robots.txt",
    expect: ["Sitemap: https://www.thetok.ch/sitemap.xml"],
  },
  {
    url: "https://www.thetok.ch/sitemap.xml",
    expect: [
      "https://www.thetok.ch/restaurateurs/geneve",
      "https://www.thetok.ch/restaurateurs/google-business",
    ],
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
      if (!response.ok) {
        failures.push(`${target.url} returned ${response.status}`);
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
