import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { blogArticles, getBlogSeoPages, renderBlogBody } from "../src/lib/seo/blog.mjs";

const launchSlugs = [
    "reserver-table-geneve-tok",
    "zero-attente-precommande-geneve",
    "anti-gaspi-geneve-paniers-tok",
    "miamz-fidelite-dons-solidaires",
    "ventes-flash-restaurants-geneve",
    "tok-dor-creations-chefs",
    "tok-one-avantages-geneve",
    "trouver-restaurant-geneve-tok",
    "tok-connect-chatgpt-restaurants",
    "tableau-bord-restaurateur-tok",
    "marketing-restaurant-tok",
    "reservations-tok-prix-table"
  ];
test("native blog preserves the launch guides and verifies every published article", () => {
  const pages = getBlogSeoPages();
  const slugs = new Set(blogArticles.map(article => article.slug));
  for (const slug of launchSlugs) assert.ok(slugs.has(slug), `Guide initial absent : ${slug}`);
  assert.equal(slugs.size, blogArticles.length);
  assert.equal(pages.length, blogArticles.length + 1);
  assert.equal(new Set(pages.map(page => page.title)).size, pages.length);
  assert.equal(new Set(pages.map(page => page.description)).size, pages.length);
  for (const article of blogArticles) {
    const page = pages.find((entry) => entry.path === `/blog/${article.slug}`);
    assert.ok(page);
    assert.ok(page.description.length <= 160);
    assert.ok(article.wordCount >= 650);
    if (launchSlugs.includes(article.slug)) assert.ok(page.staticHtml.includes("<table>"));
    assert.ok(article.blocks.some(block => block.type === "heading"));
    assert.equal((page.staticHtml.match(/<h1[ >]/g) || []).length, 1);
    assert.ok(page.staticHtml.includes('aria-label="Fil d’Ariane"'));
    assert.ok(page.staticHtml.includes('href="/blog"'));
    assert.ok(page.staticHtml.includes('aria-label="Articles à lire ensuite"'));
    assert.ok(!page.staticHtml.includes("blog.thetok.ch"));
    const headingIds = new Set([...page.staticHtml.matchAll(/id="([^"]+)"/g)].map((match) => match[1]));
    for (const match of page.staticHtml.matchAll(/href="#([^"]+)"/g)) assert.ok(headingIds.has(match[1]));
    const graph = page.jsonLd["@graph"];
    const schema = graph.find((entry) => entry["@type"] === "BlogPosting");
    assert.equal(schema.headline, article.title);
    assert.equal(schema.mainEntityOfPage, `https://www.thetok.ch/blog/${article.slug}`);
    assert.equal(schema.author.name, "Rédaction TOK");
    assert.ok(graph.some((entry) => entry["@type"] === "BreadcrumbList"));
    assert.ok(!JSON.stringify(graph).includes("aggregateRating"));
  }
  for (const article of blogArticles) assert.ok(pages[0].staticHtml.includes(`href="/blog/${article.slug}"`));
});

test("blog rendering escapes HTML and rejects executable and protocol-relative links", () => {
  const html = renderBlogBody([
    { type: "paragraph", text: '<img src=x onerror=alert(1)> [piège](javascript:alert) [externe](//evil.example) **utile**' },
    { type: "paragraph", text: '[TOK](https://www.thetok.ch/recherche) [Guide](/blog) [Section](#faq)' },
  ]);
  assert.ok(!html.includes("<img"));
  assert.ok(!html.includes('href="javascript:'));
  assert.ok(!html.includes('href="//evil'));
  assert.ok(html.includes("&lt;img"));
  assert.ok(html.includes("<strong>utile</strong>"));
  assert.ok(html.includes('href="/recherche"'));
  assert.ok(html.includes('href="#faq"'));
});

test("production prerender emits complete blog HTML and a sitemap without any publishing API", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "tok-native-blog-"));
  try {
    await mkdir(path.join(root, "dist"));
    await mkdir(path.join(root, "public"));
    await writeFile(path.join(root, "dist/index.html"), '<!doctype html><html lang="fr"><head><title>TOK</title></head><body><div id="root"></div></body></html>');
    const env = { ...process.env, SEO_STRICT_DYNAMIC: "0" };
    for (const key of Object.keys(env)) if (/SUPABASE/.test(key)) delete env[key];
    execFileSync(process.execPath, [fileURLToPath(new URL("./prerender-seo.mjs", import.meta.url))], { cwd: root, env, stdio: "pipe" });
    execFileSync(process.execPath, [fileURLToPath(new URL("./harden-seo-crawl.mjs", import.meta.url))], { cwd: root, env, stdio: "pipe" });
    execFileSync(process.execPath, [fileURLToPath(new URL("./harden-seo-trust-signals.mjs", import.meta.url))], { cwd: root, env, stdio: "pipe" });
    assert.ok((await readFile(path.join(root, "dist/index.html"), "utf8")).includes('href="/blog"'));
    const sitemap = await readFile(path.join(root, "dist/sitemap-blog.xml"), "utf8");
    const index = await readFile(path.join(root, "dist/sitemap.xml"), "utf8");
    assert.ok(index.includes("https://www.thetok.ch/sitemap-blog.xml"));
    assert.equal((sitemap.match(/<url>/g) || []).length, blogArticles.length + 1);
    for (const article of blogArticles) {
      const url = `https://www.thetok.ch/blog/${article.slug}`;
      const html = await readFile(path.join(root, "dist/blog", article.slug, "index.html"), "utf8");
      assert.ok(html.includes(`rel="canonical" href="${url}"`));
      assert.ok(html.includes('name="robots" content="index,follow'));
      assert.ok(html.includes('property="og:type" content="article"'));
      assert.ok(html.includes('href="/blog.css"'));
      if (launchSlugs.includes(article.slug)) assert.ok(html.includes("Notre point de vue"));
      assert.ok(html.includes("application/ld+json"));
      assert.ok(sitemap.includes(url));
      assert.ok(!html.includes("babylovegrowth"));
      const schema = JSON.parse(html.match(/<script id="tok-page-json-ld"[^>]*>([\s\S]*?)<\/script>/)[1]);
      const posting = schema["@graph"].find((entry) => entry["@type"] === "BlogPosting");
      assert.deepEqual(posting, getBlogSeoPages().find((page) => page.path.endsWith(article.slug)).jsonLd["@graph"][0]);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
