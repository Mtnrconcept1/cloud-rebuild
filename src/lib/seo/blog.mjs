import articles from "../../content/blog.json" with { type: "json" };

const ORIGIN = "https://www.thetok.ch";
const IMAGE = `${ORIGIN}/fond3.png`;
const BLOG_TITLE = "Le blog TOK : restaurants à Genève, réservation et bons plans";
const BLOG_DESCRIPTION = "Guides TOK pour découvrir les restaurants à Genève, réserver une table, précommander, profiter des offres et piloter votre restaurant.";

export const blogArticles = articles;
export const BLOG_STYLESHEET_PATH = "/blog.css";
const bySlug = new Map(articles.map((article) => [article.slug, article]));

function escape(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function safeHref(value) {
  if (/[\s\\\u0000-\u001f]/u.test(value) || value.startsWith("//")) return null;
  if (value.startsWith("/") || value.startsWith("#")) return value;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.origin === ORIGIN ? `${url.pathname}${url.search}${url.hash}` : url.href;
  } catch {
    return null;
  }
}

function inline(value) {
  return String(value).split(/(\[[^\]\n]+\]\([^\s)]+\)|\*\*[^*]+\*\*)/g).map((part) => {
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      const href = safeHref(link[2]);
      return href ? `<a href="${escape(href)}">${escape(link[1])}</a>` : escape(link[1]);
    }
    if (part.startsWith("**") && part.endsWith("**")) return `<strong>${escape(part.slice(2, -2))}</strong>`;
    return escape(part);
  }).join("");
}

// Editorial blocks are versioned with the source. No raw HTML is accepted,
// including in links and table cells. The same renderer serves React and crawlers.
export function renderBlogBody(blocks) {
  return blocks.map((block) => {
    if (block.type === "paragraph") return `<p>${inline(block.text)}</p>`;
    if (block.type === "heading") {
      const level = block.level === 3 ? 3 : 2;
      return `<h${level} id="${escape(block.id)}">${escape(block.text)}</h${level}>`;
    }
    if (block.type === "list") {
      const tag = block.ordered ? "ol" : "ul";
      return `<${tag}>${block.items.map((item) => `<li>${inline(item)}</li>`).join("")}</${tag}>`;
    }
    if (block.type === "table") return `<div class="tok-blog-table"><table><thead><tr>${block.headers.map((cell) => `<th scope="col">${inline(cell)}</th>`).join("")}</tr></thead><tbody>${block.rows.map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    throw new Error(`Unsupported blog block: ${block.type}`);
  }).join("\n");
}

function dateLabel(value) {
  return new Intl.DateTimeFormat("fr-CH", { dateStyle: "long", timeZone: "Europe/Zurich" }).format(new Date(`${value}T12:00:00Z`));
}

function coverPath(article) {
  return "/blog-images/" + encodeURIComponent(article.slug) + ".webp";
}

function cover(article, loading) {
  if (!article.coverAlt) return "";
  return `<img src="${coverPath(article)}" alt="${escape(article.coverAlt)}" width="1672" height="941" loading="${loading}" style="display:block;width:100%;height:auto">`;
}

function articleCard(article) {
  return `<article class="tok-blog-card">${cover(article, "lazy")}<p class="tok-blog-eyebrow">${escape(article.category)}</p><h3><a href="/blog/${escape(article.slug)}">${escape(article.title)}</a></h3><p>${escape(article.description)}</p><p class="tok-blog-card-meta">${Math.ceil(article.wordCount / 200)} min de lecture · <time datetime="${escape(article.modifiedAt)}">${escape(dateLabel(article.modifiedAt))}</time></p><a class="tok-blog-text-link" href="/blog/${escape(article.slug)}">Lire le guide <span aria-hidden="true">→</span><span class="tok-blog-sr-only"> : ${escape(article.title)}</span></a></article>`;
}

function editorialFooter() {
  return `<footer class="tok-blog-footer"><a href="/blog">Tous les guides TOK</a><a href="/recherche">Trouver un restaurant</a><a href="/restaurateurs/geneve">Pour les restaurateurs</a><a href="/contact">Contacter la rédaction</a><a href="/politique-confidentialite">Confidentialité</a></footer>`;
}

function breadcrumbs(article) {
  return `<nav class="tok-blog-breadcrumb" aria-label="Fil d’Ariane"><a href="/">Accueil</a><span aria-hidden="true">/</span>${article ? `<a href="/blog">Blog TOK</a><span aria-hidden="true">/</span><span aria-current="page">${escape(article.category)}</span>` : '<span aria-current="page">Blog TOK</span>'}</nav>`;
}

function renderIndex() {
  const categories = [...new Set(articles.map((article) => article.category))];
  return `<div class="tok-blog">${breadcrumbs()}<main id="blog-main"><header class="tok-blog-hero"><div><p class="tok-blog-eyebrow">LE JOURNAL TOK · GENÈVE</p><h1>Des idées à savourer.<br><em>Des adresses à découvrir.</em></h1><p>Réserver une table, préparer sa pause déjeuner ou découvrir un bon plan : nos guides vous accompagnent, de l’envie au repas.</p><a class="tok-blog-button" href="/recherche">Trouver ma prochaine table</a></div><img src="/fond3.png" alt="Univers visuel TOK à Genève" width="1200" height="630" fetchpriority="high"></header><section class="tok-blog-intro" aria-labelledby="blog-guides"><p class="tok-blog-eyebrow">LE GOÛT DES BONNES IDÉES</p><h2 id="blog-guides">Le restaurant, en pratique.</h2><p>Des explications claires sur la réservation, la précommande, les offres anti-gaspi et la fidélité. Et, pour les professionnels, des repères pour organiser et faire connaître leur restaurant.</p><nav class="tok-blog-topics" aria-label="Thèmes du blog">${categories.map((category, i) => `<a href="#theme-${i}">${escape(category)}</a>`).join("")}</nav></section>${categories.map((category, i) => `<section class="tok-blog-category" aria-labelledby="theme-${i}"><div class="tok-blog-section-title"><h2 id="theme-${i}">${escape(category)}</h2><p>Guides et conseils TOK</p></div><div class="tok-blog-grid">${articles.filter((article) => article.category === category).map(articleCard).join("")}</div></section>`).join("")}<aside class="tok-blog-cta"><p class="tok-blog-eyebrow">À VOUS DE CHOISIR</p><h2>Votre prochaine découverte commence ici.</h2><p>Comparez les cuisines et les adresses à Genève, puis consultez les services proposés par chaque établissement.</p><a class="tok-blog-button" href="/recherche">Explorer les restaurants</a></aside></main>${editorialFooter()}</div>`;
}

function renderArticle(article) {
  const headings = article.blocks.filter((block) => block.type === "heading" && block.level === 2 && block.text !== "En bref");
  const toc = `<nav class="tok-blog-toc" aria-label="Sommaire de l’article"><h2>Dans ce guide</h2><ol>${headings.map((heading) => `<li><a href="#${escape(heading.id)}">${escape(heading.text)}</a></li>`).join("")}</ol></nav>`;
  const related = article.related.map((slug) => bySlug.get(slug)).filter(Boolean);
  return `<div class="tok-blog">${breadcrumbs(article)}<main id="blog-main"><header class="tok-blog-article-header"><a class="tok-blog-text-link" href="/blog">← Tous les articles</a><p class="tok-blog-eyebrow">${escape(article.category)}</p><h1>${escape(article.title)}</h1><p class="tok-blog-deck">${escape(article.description)}</p><p class="tok-blog-byline">Par ${escape(article.author)} · Mis à jour le <time datetime="${escape(article.modifiedAt)}">${escape(dateLabel(article.modifiedAt))}</time> · ${Math.ceil(article.wordCount / 200)} min de lecture</p>${cover(article, "eager")}</header><div class="tok-blog-reading"><aside>${toc}</aside><article class="tok-blog-prose" aria-label="Article complet">${renderBlogBody(article.blocks)}</article></div><section class="tok-blog-related" aria-labelledby="blog-related"><h2 id="blog-related">À lire pour votre prochaine sortie</h2><nav class="tok-blog-grid" aria-label="Articles à lire ensuite">${related.map(articleCard).join("")}</nav></section></main>${editorialFooter()}</div>`;
}

function articleSchema(article) {
  const url = `${ORIGIN}/blog/${article.slug}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "BlogPosting", "@id": `${url}#article`, image: article.coverAlt ? ORIGIN + coverPath(article) : IMAGE, headline: article.title, description: article.description, mainEntityOfPage: url, url, inLanguage: "fr-CH", datePublished: article.publishedAt, dateModified: article.modifiedAt, wordCount: article.wordCount, articleSection: article.category, isPartOf: { "@id": `${ORIGIN}/blog#blog` }, author: { "@type": "Organization", name: "Rédaction TOK", url: `${ORIGIN}/a-propos` }, publisher: { "@type": "Organization", name: "TOK", url: ORIGIN, logo: { "@type": "ImageObject", url: `${ORIGIN}/logotok.png` } } },
      { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Accueil", item: ORIGIN }, { "@type": "ListItem", position: 2, name: "Blog TOK", item: `${ORIGIN}/blog` }, { "@type": "ListItem", position: 3, name: article.title, item: url }] },
    ],
  };
}

let cachedPages;
export function getBlogSeoPages() {
  if (cachedPages) return cachedPages;
  cachedPages = [
    { path: "/blog", title: BLOG_TITLE, description: BLOG_DESCRIPTION, image: IMAGE, modifiedAt: "2026-11-01", staticHtml: renderIndex(), jsonLd: { "@context": "https://schema.org", "@type": "Blog", "@id": `${ORIGIN}/blog#blog`, name: "Le blog TOK", url: `${ORIGIN}/blog`, inLanguage: "fr-CH", description: BLOG_DESCRIPTION, blogPost: articles.map((article) => ({ "@id": `${ORIGIN}/blog/${article.slug}#article` })) } },
    ...articles.map((article) => ({ path: `/blog/${article.slug}`, title: article.title, description: article.description, image: article.coverAlt ? ORIGIN + coverPath(article) : IMAGE, ogType: "article", publishedAt: article.publishedAt, modifiedAt: article.modifiedAt, staticHtml: renderArticle(article), jsonLd: articleSchema(article) })),
  ];
  for (const page of cachedPages) page.lastmod = page.modifiedAt;
  return cachedPages;
}

// Only exact known slugs are public pages. Unknown routes use the existing 404.
export function getBlogPage(slug) {
  if (slug && !bySlug.has(slug)) return null;
  return getBlogSeoPages().find((page) => page.path === (slug ? `/blog/${slug}` : "/blog")) || null;
}
