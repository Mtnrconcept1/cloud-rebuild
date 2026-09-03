import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const tempRoots: string[] = [];

function jsonLd(value: unknown) {
  return `<script id="tok-page-json-ld" type="application/ld+json">${JSON.stringify(value)}</script>`;
}

function htmlPage({
  title,
  robots = "index,follow",
  content = "",
  structuredData,
  publishedAt,
}: {
  title: string;
  robots?: string;
  content?: string;
  structuredData?: unknown;
  publishedAt?: string;
}) {
  return `<!doctype html><html><head><title>${title}</title><meta name="robots" content="${robots}">${publishedAt ? `<meta property="article:published_time" content="${publishedAt}">` : ""}${structuredData ? jsonLd(structuredData) : ""}</head><body><div id="root">${content}</div></body></html>`;
}

function prerendered(heading: string, paragraph: string, links = "") {
  return `<section id="tok-prerendered-content" data-prerendered="true"><h1>${heading}</h1><div><p>${paragraph}</p></div><div></div><nav aria-label="Liens utiles TOK">${links}</nav></section>`;
}

async function writeRoute(root: string, route: string, html: string) {
  const directory = route === "/"
    ? root
    : path.join(root, ...route.replace(/^\//, "").split("/"));
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "index.html"), html, "utf8");
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("SEO crawl hardening", () => {
  it("prunes noindex routes and turns the home/search/news pages into indexable discovery hubs", async () => {
    const dist = await mkdtemp(path.join(tmpdir(), "tok-seo-crawl-"));
    tempRoots.push(dist);

    await writeRoute(dist, "/", htmlPage({
      title: "TOK",
      content: prerendered(
        "TOK",
        "Accueil",
        '<a href="/restaurants/geneve">Genève</a><a href="/restaurants/lausanne">Lausanne</a>',
      ),
    }));
    await writeRoute(dist, "/recherche", htmlPage({
      title: "Recherche restaurants | TOK",
      content: prerendered("Recherche", "Rechercher"),
    }));
    await writeRoute(dist, "/actualites", htmlPage({
      title: "Actualités | TOK",
      content: prerendered("Actualités", "Toutes les actualités"),
      structuredData: { "@context": "https://schema.org", "@type": "CollectionPage" },
    }));

    const cityItemList = {
      "@context": "https://schema.org",
      "@type": "ItemList",
      numberOfItems: 5,
      itemListElement: [
        { "@type": "ListItem", position: 1, url: "https://www.thetok.ch/restaurants/geneve/r/foo" },
        { "@type": "ListItem", position: 2, url: "https://www.thetok.ch/restaurants/geneve/r/dup" },
      ],
    };
    await writeRoute(dist, "/restaurants/geneve", htmlPage({
      title: "Restaurant à Genève : réserver une table | TOK",
      content: prerendered(
        "Restaurants à Genève : réservation, commande et bonnes adresses",
        "5 adresses actives est répertoriées sur cette page.",
        '<a href="/restaurants/geneve/eaux-vives">Eaux-Vives</a><a href="/restaurants/geneve/r/foo">Foo</a><a href="/restaurants/geneve/r/dup">Dup</a>',
      ),
      structuredData: cityItemList,
    }));
    await writeRoute(dist, "/restaurants/lausanne", htmlPage({
      title: "Restaurant à Lausanne : réserver une table | TOK",
      robots: "noindex,follow,noarchive",
      content: prerendered("Restaurants à Lausanne", "Aucun inventaire"),
      structuredData: { "@context": "https://schema.org", "@type": "ItemList", numberOfItems: 0, itemListElement: [] },
    }));
    await writeRoute(dist, "/restaurants/geneve/eaux-vives", htmlPage({
      title: "Restaurants aux Eaux-Vives | TOK",
      robots: "noindex,follow,noarchive",
      content: prerendered("Restaurants aux Eaux-Vives", "Inventaire insuffisant"),
      structuredData: { "@context": "https://schema.org", "@type": "ItemList", numberOfItems: 0, itemListElement: [] },
    }));
    await writeRoute(dist, "/restaurants/geneve/italien", htmlPage({
      title: "Restaurant Italien à Genève | TOK",
      content: prerendered("Restaurants Italien à Genève : commander et réserver", "4 adresses"),
      structuredData: { "@context": "https://schema.org", "@type": "ItemList", numberOfItems: 4, itemListElement: [] },
    }));
    await writeRoute(dist, "/restaurants/geneve/r/foo", htmlPage({
      title: "Foo à Genève | TOK",
      content: prerendered("Foo, restaurant à Genève", "Fiche Foo"),
    }));
    await writeRoute(dist, "/restaurants/geneve/r/dup", htmlPage({
      title: "Dup à Genève | TOK",
      robots: "noindex,follow,noarchive",
      content: prerendered("Dup, restaurant à Genève", "Doublon"),
    }));

    await writeRoute(dist, "/actualites/post-1", htmlPage({
      title: "Nouvelle carte — Foo | TOK",
      publishedAt: "2026-09-02T18:00:00Z",
      content: prerendered("Nouvelle carte — Foo", "Une publication suffisamment riche."),
    }));
    await writeRoute(dist, "/actualites/post-thin", htmlPage({
      title: "Post court | TOK",
      robots: "noindex,follow,noarchive",
      publishedAt: "2026-09-03T01:00:00Z",
      content: prerendered("Post court", "Court"),
    }));

    execFileSync(process.execPath, [path.resolve(process.cwd(), "scripts/harden-seo-crawl.mjs")], {
      cwd: process.cwd(),
      env: { ...process.env, SEO_DIST_DIR: dist },
      stdio: "pipe",
    });

    const home = await readFile(path.join(dist, "index.html"), "utf8");
    expect(home).toContain("Restaurants à Genève");
    expect(home).not.toContain("/restaurants/lausanne");
    expect(home).toContain("1 communes sont actuellement éligibles");

    const search = await readFile(path.join(dist, "recherche", "index.html"), "utf8");
    expect(search).toContain("/restaurants/geneve");
    expect(search).toContain("/restaurants/geneve/italien");
    expect(search).not.toContain("/restaurants/lausanne");
    expect(search).toContain('"@type":"CollectionPage"');

    const geneve = await readFile(path.join(dist, "restaurants", "geneve", "index.html"), "utf8");
    expect(geneve).toContain("5 adresses actives sont répertoriées sur cette page.");
    expect(geneve).not.toContain("/restaurants/geneve/eaux-vives");
    expect(geneve).not.toContain("/restaurants/geneve/r/dup");
    const geneveJson = JSON.parse(geneve.match(/<script id="tok-page-json-ld"[^>]*>([\s\S]*?)<\/script>/)?.[1] || "null");
    expect(geneveJson.itemListElement).toHaveLength(1);
    expect(geneveJson.itemListElement[0].position).toBe(1);

    const actualites = await readFile(path.join(dist, "actualites", "index.html"), "utf8");
    expect(actualites).toContain("/actualites/post-1");
    expect(actualites).not.toContain("/actualites/post-thin");
    expect(actualites).toContain("Nouvelle carte — Foo");
  });
});
