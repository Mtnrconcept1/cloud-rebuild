from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"Expected block not found in {path}: {old[:120]!r}")
    file.write_text(text.replace(old, new, 1), encoding="utf-8")


# Public route must be documented by the route wiring guard.
replace_once(
    "src/test/route-wiring.test.ts",
    '  "/restaurants-pres/:venueSlug",\n',
    '  "/restaurants-pres/:venueSlug",\n  "/restaurant-indexe/:slug",\n',
)

# The local SEO guard should track the new discovery RPC rather than the legacy core-only RPC.
replace_once(
    "src/test/seo-growth.test.ts",
    '    expect(page).toContain("search_restaurants_catalog");\n',
    '    expect(page).toContain("search_restaurant_discovery_catalog");\n',
)

# Remove a temporary derived string that is intentionally not rendered in Auth; the claim page itself
# provides the legal/source explanation and the form is prefilled without changing the onboarding copy.
replace_once(
    "src/pages/Auth.tsx",
    '''  const claimNotice = claimRestaurantId && claimRestaurantName\n    ? `Vous revendiquez la fiche publique « ${claimRestaurantName} ». Les informations de base ont été préremplies ; complétez vos informations légales pour finaliser l'inscription.`\n    : "";\n\n''',
    "",
)

# Keep the name state useful: it is part of the user-visible error/reporting context in the claim loader.
replace_once(
    "src/pages/Auth.tsx",
    '        setClaimRestaurantName(String(listing.name || ""));\n',
    '        setClaimRestaurantName(String(listing.name || ""));\n        toast({ title: "Fiche publique chargée", description: `Les informations publiques de ${String(listing.name || "cet établissement")} ont été préremplies. Complétez les informations légales pour revendiquer la fiche.` });\n',
)

# Avoid an unused state lint error while retaining a named record for the visible prefill confirmation.
replace_once(
    "src/pages/Auth.tsx",
    '  const [claimRestaurantName, setClaimRestaurantName] = useState("");\n',
    '  const [, setClaimRestaurantName] = useState("");\n',
)

# Turnstile component uses the shared action/onTokenChange contract.
replace_once(
    "src/pages/PublicRestaurantListingDetail.tsx",
    '              {isCaptchaEnabled() ? <TurnstileCaptcha onVerify={setCaptchaToken} onExpire={() => setCaptchaToken("")} /> : null}\n',
    '              {isCaptchaEnabled() ? <TurnstileCaptcha action="public_contact" onTokenChange={setCaptchaToken} /> : null}\n',
)

print("Public registry final patch applied")
