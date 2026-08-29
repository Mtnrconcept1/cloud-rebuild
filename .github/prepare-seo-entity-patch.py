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

test_path = ROOT / "src/test/seo-growth.test.ts"
test_source = test_path.read_text(encoding="utf-8")

test_source = replace_once(
    test_source,
    '    const restaurantDetail = read("src/pages/RestaurantDetail.tsx");\n    const seo = read("src/hooks/useSeoMeta.ts");',
    '    const restaurantDetail = read("src/pages/RestaurantDetail.tsx");\n    const restaurantEntity = read("src/lib/seo/restaurantEntity.mjs");\n    const seo = read("src/hooks/useSeoMeta.ts");',
    "restaurant entity test fixture",
)

test_source = replace_once(
    test_source,
    '    expect(restaurantDetail).toContain("buildRestaurantDetailJsonLd");',
    '    expect(restaurantDetail).toContain("buildRestaurantSeoModel");',
    "shared SEO builder guard",
)

test_source = replace_once(
    test_source,
    '    expect(restaurantDetail).toContain(\'"@type": "Restaurant"\');',
    '    expect(restaurantDetail).toContain("jsonLd: restaurantSeoModel?.jsonLd || null");',
    "React JSON-LD guard",
)

test_source = replace_once(
    test_source,
    '    expect(restaurantDetail).toContain("const restaurantPath = canonicalPath || `/restaurant/${restaurantId}`");',
    '    expect(restaurantDetail).toContain("<nav aria-label=");',
    "visible breadcrumb guard",
)

test_source = replace_once(
    test_source,
    '    expect(restaurantDetail).toContain("buildCanonicalUrl(restaurantPath)");',
    '    expect(restaurantEntity).toContain("export function buildRestaurantSeoModel");\n'
    '    expect(restaurantEntity).toContain(\'"@type": "Restaurant"\');\n'
    '    expect(restaurantEntity).toContain(\'"@type": "WebPage"\');\n'
    '    expect(restaurantEntity).toContain(\'"@type": "BreadcrumbList"\');',
    "entity graph guards",
)

test_path.write_text(test_source, encoding="utf-8")
print("Restaurant entity SEO patch and test guard prepared successfully.")
