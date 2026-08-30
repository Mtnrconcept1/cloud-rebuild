from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"Expected block not found in {path}: {old[:140]!r}")
    file.write_text(text.replace(old, new, 1), encoding="utf-8")


# Generate original TOK-owned category illustrations. These are deliberately generic and
# never claim to depict the indexed establishment itself.
illustrations = {
    "pizza": ("Pizzeria", "#f97316", "#fb923c"),
    "kebab": ("Kebab", "#dc2626", "#f59e0b"),
    "gastronomique": ("Gastronomique", "#7c3aed", "#c084fc"),
    "francais": ("Français", "#2563eb", "#ef4444"),
    "italien": ("Italien", "#16a34a", "#ef4444"),
    "japonais": ("Japonais", "#e11d48", "#111827"),
    "asiatique": ("Asiatique", "#ea580c", "#dc2626"),
    "indien": ("Indien", "#d97706", "#7c3aed"),
    "oriental": ("Oriental", "#0f766e", "#f59e0b"),
    "poisson": ("Poissons & mer", "#0284c7", "#06b6d4"),
    "vegetarien": ("Végétarien", "#16a34a", "#84cc16"),
    "cafe": ("Café & brunch", "#92400e", "#d97706"),
    "burger": ("Burger", "#b45309", "#ef4444"),
    "grill": ("Grill", "#991b1b", "#f97316"),
    "mediterraneen": ("Méditerranéen", "#0891b2", "#f59e0b"),
    "bar": ("Bar & café", "#4338ca", "#a855f7"),
    "restaurant": ("Restaurant", "#f97316", "#14b8a6"),
}

assets = Path("public/images/public-listings")
assets.mkdir(parents=True, exist_ok=True)
for slug, (label, accent, accent2) in illustrations.items():
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 750" role="img" aria-labelledby="title desc">
  <title id="title">Illustration TOK — {label}</title>
  <desc id="desc">Illustration générique de catégorie, ne représentant pas un établissement précis.</desc>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fff7ed"/>
      <stop offset="0.52" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#f8fafc"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="{accent}"/>
      <stop offset="1" stop-color="{accent2}"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#0f172a" flood-opacity="0.16"/>
    </filter>
  </defs>
  <rect width="1200" height="750" rx="54" fill="url(#bg)"/>
  <circle cx="1020" cy="115" r="170" fill="{accent}" opacity="0.10"/>
  <circle cx="135" cy="640" r="230" fill="{accent2}" opacity="0.08"/>
  <g transform="translate(135 92)" filter="url(#shadow)">
    <rect width="930" height="566" rx="48" fill="#fff" opacity="0.94"/>
    <g transform="translate(90 76)">
      <circle cx="210" cy="210" r="168" fill="#f8fafc" stroke="url(#accent)" stroke-width="18"/>
      <circle cx="210" cy="210" r="112" fill="none" stroke="#cbd5e1" stroke-width="10"/>
      <path d="M70 65v290M42 65v112c0 26 18 44 42 44s42-18 42-44V65M350 65v290M350 65c56 38 70 98 0 156" fill="none" stroke="#334155" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="210" cy="210" r="34" fill="url(#accent)"/>
    </g>
    <g transform="translate(500 155)">
      <text x="0" y="0" font-family="system-ui,-apple-system,Segoe UI,sans-serif" font-size="34" font-weight="800" fill="{accent}">TOK • IMAGE D’ILLUSTRATION</text>
      <text x="0" y="88" font-family="system-ui,-apple-system,Segoe UI,sans-serif" font-size="68" font-weight="900" fill="#0f172a">{label}</text>
      <rect x="0" y="128" width="300" height="14" rx="7" fill="url(#accent)"/>
      <text x="0" y="205" font-family="system-ui,-apple-system,Segoe UI,sans-serif" font-size="27" font-weight="600" fill="#64748b">Visuel générique de catégorie</text>
      <text x="0" y="246" font-family="system-ui,-apple-system,Segoe UI,sans-serif" font-size="25" fill="#64748b">Ne représente pas nécessairement le restaurant.</text>
    </g>
  </g>
</svg>'''
    (assets / f"{slug}.svg").write_text(svg, encoding="utf-8")

helper = '''export type PublicRestaurantIllustration = {\n  src: string;\n  label: string;\n};\n\ntype PublicRestaurantIllustrationInput = {\n  name?: string | null;\n  cuisine?: string | null;\n  activity?: string | null;\n  category?: string | null;\n};\n\nfunction normalize(value: unknown) {\n  return String(value || \"\")\n    .toLowerCase()\n    .normalize(\"NFD\")\n    .replace(/[\\u0300-\\u036f]/g, \"\");\n}\n\nconst RULES: Array<{ keys: string[]; slug: string; label: string }> = [\n  { keys: [\"pizza\", \"pizzeria\"], slug: \"pizza\", label: \"Pizzeria\" },\n  { keys: [\"kebab\", \"doner\", \"shawarma\", \"dürüm\", \"durum\"], slug: \"kebab\", label: \"Kebab\" },\n  { keys: [\"gastronom\", \"fine dining\", \"haute cuisine\"], slug: \"gastronomique\", label: \"Gastronomique\" },\n  { keys: [\"sushi\", \"japon\", \"ramen\", \"yakitori\"], slug: \"japonais\", label: \"Japonais\" },\n  { keys: [\"indien\", \"indian\", \"curry\", \"tandoori\"], slug: \"indien\", label: \"Indien\" },\n  { keys: [\"libanais\", \"levant\", \"oriental\", \"falafel\"], slug: \"oriental\", label: \"Oriental\" },\n  { keys: [\"thai\", \"chinois\", \"asiatique\", \"vietnam\", \"korean\", \"coreen\"], slug: \"asiatique\", label: \"Asiatique\" },\n  { keys: [\"burger\", \"hamburger\", \"smash\"], slug: \"burger\", label: \"Burger\" },\n  { keys: [\"poisson\", \"fruits de mer\", \"seafood\", \"perche\"], slug: \"poisson\", label: \"Poissons & mer\" },\n  { keys: [\"vegetar\", \"vegan\", \"healthy\", \"salade\"], slug: \"vegetarien\", label: \"Végétarien\" },\n  { keys: [\"grill\", \"steak\", \"bbq\", \"barbecue\", \"viande\"], slug: \"grill\", label: \"Grill\" },\n  { keys: [\"mediterr\", \"grec\", \"greek\"], slug: \"mediterraneen\", label: \"Méditerranéen\" },\n  { keys: [\"italien\", \"italian\", \"trattoria\", \"pasta\"], slug: \"italien\", label: \"Italien\" },\n  { keys: [\"francais\", \"brasserie\", \"bistro\", \"traditionnel\"], slug: \"francais\", label: \"Français / traditionnel\" },\n  { keys: [\"brunch\", \"coffee\", \"salon de the\", \"tea room\", \"cafe\"], slug: \"cafe\", label: \"Café & brunch\" },\n];\n\nexport function getPublicRestaurantIllustration(input: PublicRestaurantIllustrationInput): PublicRestaurantIllustration {\n  // Deliberately do not use the broad REG category \"Restaurant/cafe/snack/tea-room\"\n  // for keyword inference, otherwise almost every source row would be classified as a café.\n  const haystack = normalize(`${input.name || \"\"} ${input.cuisine || \"\"} ${input.activity || \"\"}`);\n  for (const rule of RULES) {\n    if (rule.keys.some((key) => haystack.includes(normalize(key)))) {\n      return { src: `/images/public-listings/${rule.slug}.svg`, label: rule.label };\n    }\n  }\n  if (normalize(input.category) === \"bar\") {\n    return { src: \"/images/public-listings/bar.svg\", label: \"Bar & café\" };\n  }\n  return { src: \"/images/public-listings/restaurant.svg\", label: \"Restaurant\" };\n}\n'''
Path("src/lib/publicRestaurantIllustrations.ts").write_text(helper, encoding="utf-8")

# Add generic illustration + public professional phone to cards.
replace_once(
    "src/components/RestaurantCard.tsx",
    'import { ArrowRight, Bike, Database, Heart, MapPin, Percent, Sparkles } from "lucide-react";',
    'import { ArrowRight, Bike, Database, Heart, ImageIcon, MapPin, Percent, Phone, Sparkles } from "lucide-react";',
)
replace_once(
    "src/components/RestaurantCard.tsx",
    'import { getConfiguredServiceSettings } from "@/lib/serviceSettings";\n',
    'import { getConfiguredServiceSettings } from "@/lib/serviceSettings";\nimport { getPublicRestaurantIllustration } from "@/lib/publicRestaurantIllustrations";\n',
)
replace_once(
    "src/components/RestaurantCard.tsx",
    '  listingClaimStatus?: string | null;\n  address?: string;\n',
    '  listingClaimStatus?: string | null;\n  phone?: string | null;\n  address?: string;\n',
)
replace_once(
    "src/components/RestaurantCard.tsx",
    '  listingClaimStatus,\n  sponsoredCampaignId,\n',
    '  listingClaimStatus,\n  phone,\n  sponsoredCampaignId,\n',
)
replace_once(
    "src/components/RestaurantCard.tsx",
    '  const resolvedImage = isPublicIndexedListing ? "/logotok.png" : getImageUrl(sponsoredPromoImage || imageUrl, cuisine);\n  const optimizedImage = getOptimizedImageUrl(resolvedImage, "card");\n  const optimizedSrcSet = getOptimizedImageSrcSet(resolvedImage, "card");\n',
    '  const publicIllustration = getPublicRestaurantIllustration({ name, cuisine });\n  const resolvedImage = isPublicIndexedListing ? publicIllustration.src : getImageUrl(sponsoredPromoImage || imageUrl, cuisine);\n  const optimizedImage = isPublicIndexedListing ? resolvedImage : getOptimizedImageUrl(resolvedImage, "card");\n  const optimizedSrcSet = isPublicIndexedListing ? undefined : getOptimizedImageSrcSet(resolvedImage, "card");\n',
)
replace_once(
    "src/components/RestaurantCard.tsx",
    '            alt={name}\n',
    '            alt={isPublicIndexedListing ? `Image d’illustration ${publicIllustration.label.toLowerCase()}` : name}\n',
)
replace_once(
    "src/components/RestaurantCard.tsx",
    '''            {isPublicIndexedListing ? (\n              <Badge className="gap-1 border-none bg-slate-900/85 text-[9px] font-bold text-white shadow-sm backdrop-blur-md">\n                <Database className="h-3 w-3" /> Indexé depuis une base publique\n              </Badge>\n            ) : null}\n''',
    '''            {isPublicIndexedListing ? (\n              <>\n                <Badge className="gap-1 border-none bg-slate-900/85 text-[9px] font-bold text-white shadow-sm backdrop-blur-md">\n                  <Database className="h-3 w-3" /> Indexé depuis une base publique\n                </Badge>\n                <Badge className="gap-1 border border-white/30 bg-white/90 text-[9px] font-bold text-slate-900 shadow-sm backdrop-blur-md">\n                  <ImageIcon className="h-3 w-3" /> Image d’illustration\n                </Badge>\n              </>\n            ) : null}\n''',
)
replace_once(
    "src/components/RestaurantCard.tsx",
    '''          {address ? (\n            <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground dark:text-slate-300/90">\n              {address}\n            </p>\n          ) : (\n            <p className="mt-2 text-sm leading-6 text-muted-foreground dark:text-slate-300/90">\n              Ouvrez la fiche pour voir le menu, les disponibilités et les détails.\n            </p>\n          )}\n\n          {isSponsored ? (\n''',
    '''          {address ? (\n            <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground dark:text-slate-300/90">\n              {address}\n            </p>\n          ) : (\n            <p className="mt-2 text-sm leading-6 text-muted-foreground dark:text-slate-300/90">\n              Ouvrez la fiche pour voir le menu, les disponibilités et les détails.\n            </p>\n          )}\n\n          {isPublicIndexedListing && phone ? (\n            <a\n              href={`tel:${phone}`}\n              data-card-action="public-phone"\n              onClick={stopNestedCardAction}\n              className="mt-3 inline-flex w-fit items-center gap-2 text-sm font-semibold text-primary hover:underline"\n              aria-label={`Appeler ${name} au ${phone}`}\n            >\n              <Phone className="h-4 w-4" />\n              {phone}\n            </a>\n          ) : null}\n\n          {isSponsored ? (\n''',
)

# Pass the professional public phone from the discovery RPC into both card surfaces.
replace_once(
    "src/pages/Recherche.tsx",
    '    listingClaimStatus: r.listing_claim_status || null,\n    sponsoredCampaignId:',
    '    listingClaimStatus: r.listing_claim_status || null,\n    phone: r.phone || null,\n    sponsoredCampaignId:',
)
replace_once(
    "src/pages/LocalRestaurants.tsx",
    '    listingClaimStatus: restaurant.listing_claim_status || null,\n  };\n}',
    '    listingClaimStatus: restaurant.listing_claim_status || null,\n    phone: restaurant.phone || null,\n  };\n}',
)

# Detail page: use the same original category illustration and keep the public phone visible.
replace_once(
    "src/pages/PublicRestaurantListingDetail.tsx",
    'import { submitContactSupport } from "@/lib/support/contactSupport";\n',
    'import { submitContactSupport } from "@/lib/support/contactSupport";\nimport { getPublicRestaurantIllustration } from "@/lib/publicRestaurantIllustrations";\n',
)
replace_once(
    "src/pages/PublicRestaurantListingDetail.tsx",
    '  const claimPending = listing.claim_status === "claim_pending";\n\n  const submitRemovalRequest',
    '  const claimPending = listing.claim_status === "claim_pending";\n  const illustration = getPublicRestaurantIllustration({ name: listing.name, activity: listing.activity_detail, category: listing.category });\n\n  const submitRemovalRequest',
)
replace_once(
    "src/pages/PublicRestaurantListingDetail.tsx",
    '''          <div className="flex min-h-56 items-center justify-center bg-gradient-to-br from-muted via-background to-primary/10 p-8 text-center">\n            <div className="space-y-3">\n              <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border bg-background shadow-sm">\n                <Database className="h-8 w-8 text-primary" />\n              </div>\n              <Badge variant="secondary">Indexé depuis une base de données publique</Badge>\n              <h1 className="font-display text-3xl font-bold md:text-5xl">{listing.name}</h1>\n              <p className="text-muted-foreground">{listing.category === "Bar" ? "Bar" : "Restaurant / café"} · {listing.city}</p>\n            </div>\n          </div>\n''',
    '''          <div className="relative min-h-72 overflow-hidden bg-muted">\n            <img\n              src={illustration.src}\n              alt={`Image d’illustration ${illustration.label.toLowerCase()}`}\n              className="absolute inset-0 h-full w-full object-cover"\n              width={1200}\n              height={750}\n            />\n            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/35 to-slate-950/10" />\n            <div className="relative flex min-h-72 items-end p-6 text-white md:p-9">\n              <div className="space-y-3">\n                <div className="flex flex-wrap gap-2">\n                  <Badge className="gap-1 bg-slate-950/80 text-white"><Database className="h-3.5 w-3.5" /> Indexé depuis une base de données publique</Badge>\n                  <Badge className="bg-white/90 text-slate-900">Image d’illustration · {illustration.label}</Badge>\n                </div>\n                <h1 className="font-display text-3xl font-bold md:text-5xl">{listing.name}</h1>\n                <p className="text-white/85">{listing.category === "Bar" ? "Bar" : "Restaurant / café"} · {listing.city}</p>\n                <p className="max-w-2xl text-xs text-white/75">Visuel générique de catégorie : il ne représente pas nécessairement cet établissement.</p>\n              </div>\n            </div>\n          </div>\n''',
)
replace_once(
    "src/pages/PublicRestaurantListingDetail.tsx",
    '{listing.phone ? <a className="flex items-center gap-2 text-sm text-primary hover:underline" href={`tel:${listing.phone}`}><Phone className="h-4 w-4" />{listing.phone}</a> : null}',
    '{listing.phone ? <a className="flex items-center gap-2 text-sm font-semibold text-primary hover:underline" href={`tel:${listing.phone}`} aria-label={`Appeler ${listing.name} au ${listing.phone}`}><Phone className="h-4 w-4" /><span><span className="sr-only">Téléphone professionnel public : </span>{listing.phone}</span></a> : null}',
)
replace_once(
    "src/pages/PublicRestaurantListingDetail.tsx",
    "TOK n'affiche ici que des informations professionnelles publiques et n'utilise aucune photo tierce pour cette fiche.",
    "TOK n'affiche ici que des informations professionnelles publiques. Le visuel de catégorie est une illustration générique créée pour TOK et ne constitue pas une photo de cet établissement.",
)

print("Public registry image and phone enhancement applied")
