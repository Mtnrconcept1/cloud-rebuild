#!/usr/bin/env python3
from pathlib import Path
import runpy

ROOT = Path(__file__).resolve().parents[1]


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    return source.replace(old, new, 1)


patch_path = ROOT / ".github/seo-entity-patch.py"
patch_source = patch_path.read_text(encoding="utf-8")
patch_source = replace_once(
    patch_source,
    "updated, count = re.subn(pattern, replacement, text, count=1, flags=re.DOTALL)",
    "updated, count = re.subn(pattern, lambda _match: replacement, text, count=1, flags=re.DOTALL)",
    "regex replacement helper",
)
patch_path.write_text(patch_source, encoding="utf-8")
runpy.run_path(str(patch_path), run_name="__main__")

docs_path = ROOT / "docs/skills/TOK_SEO_SKILL.md"
docs_path.write_text(
    docs_path.read_text(encoding="utf-8").rstrip() + "\n",
    encoding="utf-8",
)

growth_path = ROOT / "src/test/seo-growth.test.ts"
growth_source = growth_path.read_text(encoding="utf-8")

growth_source = replace_once(
    growth_source,
    '    const restaurantDetail = read("src/pages/RestaurantDetail.tsx");\n'
    '    const seo = read("src/hooks/useSeoMeta.ts");',
    '    const restaurantDetail = read("src/pages/RestaurantDetail.tsx");\n'
    '    const restaurantEntity = read("src/lib/seo/restaurantEntity.mjs");\n'
    '    const seo = read("src/hooks/useSeoMeta.ts");',
    "SEO growth shared entity fixture",
)
growth_source = replace_once(
    growth_source,
    '    expect(restaurantDetail).toContain("buildRestaurantDetailJsonLd");',
    '    expect(restaurantDetail).toContain("buildRestaurantSeoModel");',
    "SEO growth shared entity builder guard",
)
growth_source = replace_once(
    growth_source,
    '    expect(restaurantDetail).toContain(\'"@type": "Restaurant"\');',
    '    expect(restaurantDetail).toContain("jsonLd: restaurantSeoModel?.jsonLd || null");',
    "SEO growth React JSON-LD ownership guard",
)
growth_source = replace_once(
    growth_source,
    '    expect(restaurantDetail).toContain("const restaurantPath = canonicalPath || `/restaurant/${restaurantId}`");',
    '    expect(restaurantDetail).toContain("<nav aria-label=");',
    "SEO growth visible breadcrumb guard",
)
growth_source = replace_once(
    growth_source,
    '    expect(restaurantDetail).toContain("buildCanonicalUrl(restaurantPath)");',
    '    expect(restaurantEntity).toContain("export function buildRestaurantSeoModel");\n'
    '    expect(restaurantEntity).toContain(\'"@type": "Restaurant"\');\n'
    '    expect(restaurantEntity).toContain(\'"@type": "WebPage"\');\n'
    '    expect(restaurantEntity).toContain(\'"@type": "BreadcrumbList"\');\n'
    '    expect(restaurantEntity).toContain(\'"@type": "Menu"\');',
    "SEO growth entity graph guards",
)
growth_path.write_text(growth_source, encoding="utf-8")

responsive_path = ROOT / "src/test/responsive-seo-regressions.test.ts"
responsive_source = responsive_path.read_text(encoding="utf-8")

responsive_source = replace_once(
    responsive_source,
    '    const prerender = read("scripts/prerender-seo.mjs");\n'
    '    const notFound = read("src/pages/NotFound.tsx");',
    '    const prerender = read("scripts/prerender-seo.mjs");\n'
    '    const restaurantEntity = read("src/lib/seo/restaurantEntity.mjs");\n'
    '    const notFound = read("src/pages/NotFound.tsx");',
    "responsive SEO shared entity fixture",
)
responsive_source = replace_once(
    responsive_source,
    '    expect(prerender).toContain("restaurant.rating && Number(restaurant.review_count) > 0");',
    '    expect(prerender).toContain("buildRestaurantSeoModel");\n'
    '    expect(restaurantEntity).toContain("const aggregateRating = normalizedReviewCount > 0");\n'
    '    expect(restaurantEntity).toContain(\'"@type": "AggregateRating"\');',
    "responsive SEO rating provenance guard",
)
responsive_path.write_text(responsive_source, encoding="utf-8")

print("Restaurant entity SEO patch and regression guards prepared successfully.")
