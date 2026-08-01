import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readProjectFile(path: string) {
  const absolutePath = resolve(process.cwd(), path);
  expect(existsSync(absolutePath), `${path} should exist`).toBe(true);
  return readFileSync(absolutePath, "utf8");
}

describe("Actualites global search and public post SEO", () => {
  it("searches the complete public feed through the paginated server RPC", () => {
    const hooks = readProjectFile("src/hooks/useSocialFeed.ts");
    const page = readProjectFile("src/pages/Actualites.tsx");

    expect(hooks).toContain("export function useSearchActualitesPosts");
    expect(hooks).toContain('"search_actualites_posts"');
    expect(hooks).toContain("p_offset: offset");
    expect(hooks).toContain("nextOffset");
    expect(page).toContain("useSearchActualitesPosts");
    expect(page).toContain("debouncedSearchQuery");
    expect(page).toContain("Recherche dans toutes les actualités");
    expect(page).toContain('aria-live="polite"');
    expect(page).not.toContain("actualites-search-legacy");
    expect(page.match(/<h1/g)).toHaveLength(1);
  });

  it("provides a permanent public route and keeps legacy share links compatible", () => {
    const app = readProjectFile("src/App.tsx");
    const feed = readProjectFile("src/lib/socialFeed.ts");
    const listing = readProjectFile("src/pages/Actualites.tsx");
    const detail = readProjectFile("src/pages/ActualitePost.tsx");

    expect(app).toContain('path="/actualites/:postId"');
    expect(feed).toContain("`/actualites/${encodeURIComponent(postId)}`");
    expect(feed).not.toContain("/actualites?post=");
    expect(listing).toContain("navigate(`/actualites/${encodeURIComponent(highlightedPostId)}`");
    expect(detail).toContain("useSocialPostById");
    expect(detail).toContain("<SocialPostCard post={post}");
  });

  it("emits article, image, canonical and accessible media metadata", () => {
    const seo = readProjectFile("src/hooks/useSeoMeta.ts");
    const detail = readProjectFile("src/pages/ActualitePost.tsx");
    const card = readProjectFile("src/components/social/SocialPostCard.tsx");
    const carousel = readProjectFile("src/components/social/SocialMediaCarousel.tsx");

    expect(seo).toContain("articlePublishedTime");
    expect(seo).toContain("og:image:alt");
    expect(seo).toContain("og:image:width");
    expect(seo).toContain("twitter:image:alt");
    expect(detail).toContain('"@type": "Article"');
    expect(detail).toContain('"@type": "ImageObject"');
    expect(detail).toContain("articlePublishedTime: publishedAt");
    expect(card).toContain("<article aria-labelledby=");
    expect(card).toContain("<time");
    expect(carousel).toContain("Média précédent");
    expect(carousel).toContain("Agrandir l’image");
  });

  it("pre-renders quality public posts into the sitemap with crawler-visible article metadata", () => {
    const prerender = readProjectFile("scripts/prerender-seo.mjs");

    expect(prerender).toContain("MAX_DYNAMIC_ACTUALITES");
    expect(prerender).toContain("MIN_ACTUALITE_TEXT_LENGTH");
    expect(prerender).toContain("indexableTextLength");
    expect(prerender).toContain("ACTUALITES_PRERENDER_BATCH_SIZE");
    expect(prerender).toContain("async function collectDynamicActualitesPages");
    expect(prerender).toContain('.from("social_posts")');
    expect(prerender).toContain(".range(offset, offset + batchSize - 1)");
    expect(prerender).toContain("const postPath = `/actualites/${post.id}`");
    expect(prerender).toContain('ogType: "article"');
    expect(prerender).toContain('"@type": "Article"');
    expect(prerender).toContain('property="article:published_time"');
    expect(prerender).toContain('name="twitter:image:alt"');
    expect(prerender).toContain("collectDynamicActualitesPages()");
  });
});
