from pathlib import Path
import re


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"Expected block not found in {path}: {old[:180]!r}")
    file.write_text(text.replace(old, new, 1), encoding="utf-8")


# Preserve the existing commercial-demo guard assertions while also preventing
# public registry cards from querying operational restaurant data.
replace_once(
    "src/components/RestaurantCard.tsx",
    "    enabled: !isCommercialDemoClient && !isPublicIndexedListing && shouldFetchReservationProfile && supportsReservation !== false,\n",
    "    enabled: !isCommercialDemoClient && shouldFetchReservationProfile && !isPublicIndexedListing && supportsReservation !== false,\n",
)
replace_once(
    "src/components/RestaurantCard.tsx",
    "    enabled: !isCommercialDemoClient && !isPublicIndexedListing && canShowReservationSlots,\n",
    "    enabled: !isCommercialDemoClient && canShowReservationSlots && !isPublicIndexedListing,\n",
)

# Static asset validation intentionally cannot resolve template-literal paths.
# Convert each generated illustration rule to an explicit checked public path.
helper_path = Path("src/lib/publicRestaurantIllustrations.ts")
helper = helper_path.read_text(encoding="utf-8")
helper = helper.replace(
    "const RULES: Array<{ keys: string[]; slug: string; label: string }> = [",
    "const RULES: Array<{ keys: string[]; src: string; label: string }> = [",
    1,
)
helper, replacement_count = re.subn(
    r'\{ keys: (\[[^\n]+?\]), slug: "([^"]+)", label: "([^"]+)" \}',
    lambda match: f'{{ keys: {match.group(1)}, src: "/images/public-listings/{match.group(2)}.svg", label: "{match.group(3)}" }}',
    helper,
)
if replacement_count != 15:
    raise SystemExit(f"expected 15 illustration rules, rewrote {replacement_count}")
old_dynamic_return = '      return { src: `/images/public-listings/${rule.slug}.svg`, label: rule.label };'
new_static_return = '      return { src: rule.src, label: rule.label };'
if old_dynamic_return not in helper:
    raise SystemExit("dynamic public illustration path not found")
helper = helper.replace(old_dynamic_return, new_static_return, 1)
if "${rule.slug}" in helper:
    raise SystemExit("dynamic public illustration reference still present")
helper_path.write_text(helper, encoding="utf-8")

# The public-registry discovery RPC intentionally replaces search_restaurants_catalog
# on Recherche and LocalRestaurants. Keep the original demo-isolation test semantics,
# but assert against the new SECURITY DEFINER RPC rather than the superseded call.
test_path = Path("src/test/commercial-demo-client-data-isolation.test.ts")
test = test_path.read_text(encoding="utf-8")
test = test.replace(
    'it("never reaches the SECURITY DEFINER restaurant catalog RPC in client demo mode", () => {',
    'it("never reaches the SECURITY DEFINER restaurant discovery RPC in client demo mode", () => {',
    1,
)
search_old = '''    expect(search.match(/search_restaurants_catalog/g) ?? []).toHaveLength(1);\n    expectDemoGuardBeforeProductionCall(\n      search,\n      '(supabase.rpc as any)("search_restaurants_catalog"',\n      "if (isCommercialDemoClient)",\n    );\n'''
search_new = '''    expect(search.match(/search_restaurant_discovery_catalog/g) ?? []).toHaveLength(1);\n    expectDemoGuardBeforeProductionCall(\n      search,\n      '(supabase.rpc as any)("search_restaurant_discovery_catalog"',\n      "if (isCommercialDemoClient)",\n    );\n'''
local_old = '''    expect(local.match(/search_restaurants_catalog/g) ?? []).toHaveLength(1);\n    expectDemoGuardBeforeProductionCall(\n      local,\n      '(supabase.rpc as any)("search_restaurants_catalog"',\n      "if (isCommercialDemoClient)",\n    );\n'''
local_new = '''    expect(local.match(/search_restaurant_discovery_catalog/g) ?? []).toHaveLength(1);\n    expectDemoGuardBeforeProductionCall(\n      local,\n      '(supabase.rpc as any)("search_restaurant_discovery_catalog"',\n      "if (isCommercialDemoClient)",\n    );\n'''
if search_old not in test or local_old not in test:
    raise SystemExit("commercial demo discovery guard assertions not found")
test = test.replace(search_old, search_new, 1).replace(local_old, local_new, 1)
test_path.write_text(test, encoding="utf-8")

print("Public registry CI compatibility patch applied")
