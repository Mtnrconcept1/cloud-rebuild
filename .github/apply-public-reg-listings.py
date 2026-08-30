from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"Expected block not found in {path}: {old[:120]!r}")
    file.write_text(text.replace(old, new, 1), encoding="utf-8")


# App route.
replace_once(
    "src/App.tsx",
    'const RestaurantDetail = lazy(() => import("./pages/RestaurantDetail"));\n',
    'const RestaurantDetail = lazy(() => import("./pages/RestaurantDetail"));\nconst PublicRestaurantListingDetail = lazy(() => import("./pages/PublicRestaurantListingDetail"));\n',
)
replace_once(
    "src/App.tsx",
    '          <Route path="/restaurants/:city" element={<ClientSurfaceRoute><LocalRestaurants /></ClientSurfaceRoute>} />\n',
    '          <Route path="/restaurants/:city" element={<ClientSurfaceRoute><LocalRestaurants /></ClientSurfaceRoute>} />\n          <Route path="/restaurant-indexe/:slug" element={<ClientSurfaceRoute><PublicRestaurantListingDetail /></ClientSurfaceRoute>} />\n',
)

# Public discovery RPC on both search surfaces.
for path in ("src/pages/Recherche.tsx", "src/pages/LocalRestaurants.tsx"):
    replace_once(path, '"search_restaurants_catalog"', '"search_restaurant_discovery_catalog"')

# Search card mapping.
replace_once(
    "src/pages/Recherche.tsx",
    '''function toCardProps(r: any) {\n  return {\n    id: r.id,\n    slug: r.slug || null,\n    name: r.name,\n    cuisine: getRestaurantCuisineSummary(r),\n    rating: r.rating || 0,\n    reviewCount: r.review_count || 0,\n    imageUrl: r.image_url || "",\n    priceRange: r.price_range || 2,\n    deliveryAvailable: !!r.delivery_available,\n    city: r.city || "",\n    address: r.address || "",\n    openingHours: Object.prototype.hasOwnProperty.call(r, "opening_hours") ? r.opening_hours : undefined,\n    supportsReservation: Object.prototype.hasOwnProperty.call(r, "supports_reservation") ? r.supports_reservation : undefined,\n    sponsoredCampaignId: r.campaign_id || undefined,\n    sponsoredPromoImage: r.promo_image || undefined,\n    sponsoredCampaignTitle: r.campaign_title || undefined,\n    sponsoredCampaignBody: r.campaign_body || undefined,\n    sponsoredCampaignCreative: r.campaign_creative || undefined,\n  };\n}\n''',
    '''function toCardProps(r: any) {\n  const isPublicIndexedListing = r.listing_kind === "public_registry";\n  return {\n    id: r.id,\n    slug: r.slug || null,\n    name: r.name,\n    cuisine: getRestaurantCuisineSummary(r),\n    rating: r.rating || 0,\n    reviewCount: r.review_count || 0,\n    imageUrl: r.image_url || "",\n    priceRange: isPublicIndexedListing ? null : r.price_range || 2,\n    deliveryAvailable: isPublicIndexedListing ? false : !!r.delivery_available,\n    city: r.city || "",\n    address: r.address || "",\n    openingHours: Object.prototype.hasOwnProperty.call(r, "opening_hours") ? r.opening_hours : undefined,\n    supportsReservation: isPublicIndexedListing ? false : Object.prototype.hasOwnProperty.call(r, "supports_reservation") ? r.supports_reservation : undefined,\n    isPublicIndexedListing,\n    listingSource: r.listing_source || null,\n    listingClaimStatus: r.listing_claim_status || null,\n    sponsoredCampaignId: isPublicIndexedListing ? undefined : r.campaign_id || undefined,\n    sponsoredPromoImage: isPublicIndexedListing ? undefined : r.promo_image || undefined,\n    sponsoredCampaignTitle: isPublicIndexedListing ? undefined : r.campaign_title || undefined,\n    sponsoredCampaignBody: isPublicIndexedListing ? undefined : r.campaign_body || undefined,\n    sponsoredCampaignCreative: isPublicIndexedListing ? undefined : r.campaign_creative || undefined,\n  };\n}\n''',
)

# Local page card mapping.
replace_once(
    "src/pages/LocalRestaurants.tsx",
    '''function toCardProps(restaurant: any) {\n  const categoryNames = Array.isArray(restaurant?.category_names) ? restaurant.category_names : [];\n  return {\n    id: restaurant.id,\n    slug: restaurant.slug || null,\n    name: restaurant.name,\n    cuisine: formatRestaurantCategorySummary(categoryNames, restaurant.cuisine_type || ""),\n    rating: restaurant.rating || 0,\n    reviewCount: restaurant.review_count || 0,\n    imageUrl: restaurant.image_url || "",\n    priceRange: restaurant.price_range || 2,\n    deliveryAvailable: Boolean(restaurant.delivery_available),\n    city: restaurant.city || "",\n    address: restaurant.address || "",\n    openingHours: Object.prototype.hasOwnProperty.call(restaurant, "opening_hours") ? restaurant.opening_hours : undefined,\n    supportsReservation: Object.prototype.hasOwnProperty.call(restaurant, "supports_reservation") ? restaurant.supports_reservation : undefined,\n  };\n}\n''',
    '''function toCardProps(restaurant: any) {\n  const categoryNames = Array.isArray(restaurant?.category_names) ? restaurant.category_names : [];\n  const isPublicIndexedListing = restaurant.listing_kind === "public_registry";\n  return {\n    id: restaurant.id,\n    slug: restaurant.slug || null,\n    name: restaurant.name,\n    cuisine: formatRestaurantCategorySummary(categoryNames, restaurant.cuisine_type || ""),\n    rating: restaurant.rating || 0,\n    reviewCount: restaurant.review_count || 0,\n    imageUrl: restaurant.image_url || "",\n    priceRange: isPublicIndexedListing ? null : restaurant.price_range || 2,\n    deliveryAvailable: isPublicIndexedListing ? false : Boolean(restaurant.delivery_available),\n    city: restaurant.city || "",\n    address: restaurant.address || "",\n    openingHours: Object.prototype.hasOwnProperty.call(restaurant, "opening_hours") ? restaurant.opening_hours : undefined,\n    supportsReservation: isPublicIndexedListing ? false : Object.prototype.hasOwnProperty.call(restaurant, "supports_reservation") ? restaurant.supports_reservation : undefined,\n    isPublicIndexedListing,\n    listingSource: restaurant.listing_source || null,\n    listingClaimStatus: restaurant.listing_claim_status || null,\n  };\n}\n''',
)

# Restaurant card: public-indexed records are deliberately non-operational and use TOK-owned neutral art.
replace_once(
    "src/components/RestaurantCard.tsx",
    'import { ArrowRight, Bike, Heart, MapPin, Percent, Sparkles } from "lucide-react";',
    'import { ArrowRight, Bike, Database, Heart, MapPin, Percent, Sparkles } from "lucide-react";',
)
replace_once(
    "src/components/RestaurantCard.tsx",
    '''  priceRange: number;\n  deliveryAvailable: boolean;\n  city: string;\n''',
    '''  priceRange: number | null;\n  deliveryAvailable: boolean;\n  city: string;\n  isPublicIndexedListing?: boolean;\n  listingSource?: string | null;\n  listingClaimStatus?: string | null;\n''',
)
replace_once(
    "src/components/RestaurantCard.tsx",
    '''  supportsReservation,\n  sponsoredCampaignId,\n''',
    '''  supportsReservation,\n  isPublicIndexedListing = false,\n  listingSource,\n  listingClaimStatus,\n  sponsoredCampaignId,\n''',
)
replace_once(
    "src/components/RestaurantCard.tsx",
    '  const resolvedImage = getImageUrl(sponsoredPromoImage || imageUrl, cuisine);\n',
    '  const resolvedImage = isPublicIndexedListing ? "/logotok.png" : getImageUrl(sponsoredPromoImage || imageUrl, cuisine);\n',
)
replace_once(
    "src/components/RestaurantCard.tsx",
    '    enabled: Boolean(user && !isCommercialDemoClient),\n',
    '    enabled: Boolean(user && !isCommercialDemoClient && !isPublicIndexedListing),\n',
)
replace_once(
    "src/components/RestaurantCard.tsx",
    '''  const toggleFavorite = async (e: React.MouseEvent) => {\n    e.stopPropagation();\n''',
    '''  const toggleFavorite = async (e: React.MouseEvent) => {\n    e.stopPropagation();\n    if (isPublicIndexedListing) return;\n''',
)
replace_once(
    "src/components/RestaurantCard.tsx",
    '    enabled: !isCommercialDemoClient,\n',
    '    enabled: !isCommercialDemoClient && !isPublicIndexedListing,\n',
)
replace_once(
    "src/components/RestaurantCard.tsx",
    '    enabled: !isCommercialDemoClient && shouldFetchReservationProfile && supportsReservation !== false,\n',
    '    enabled: !isCommercialDemoClient && !isPublicIndexedListing && shouldFetchReservationProfile && supportsReservation !== false,\n',
)
replace_once(
    "src/components/RestaurantCard.tsx",
    '    enabled: !isCommercialDemoClient && canShowReservationSlots,\n',
    '    enabled: !isCommercialDemoClient && !isPublicIndexedListing && canShowReservationSlots,\n',
)
replace_once(
    "src/components/RestaurantCard.tsx",
    '''  useEffect(() => {\n    if (isCommercialDemoClient) return;\n    if (isSponsored && sponsoredCampaignId) return;\n''',
    '''  useEffect(() => {\n    if (isCommercialDemoClient || isPublicIndexedListing) return;\n    if (isSponsored && sponsoredCampaignId) return;\n''',
)
replace_once(
    "src/components/RestaurantCard.tsx",
    '  const restaurantPath = buildRestaurantSeoPath({ id, name, city, slug });\n',
    '  const restaurantPath = isPublicIndexedListing && slug ? `/restaurant-indexe/${encodeURIComponent(slug)}` : buildRestaurantSeoPath({ id, name, city, slug });\n',
)
replace_once(
    "src/components/RestaurantCard.tsx",
    '''  const trackRestaurantNavigation = () => {\n    if (isCommercialDemoClient) return;\n''',
    '''  const trackRestaurantNavigation = () => {\n    if (isCommercialDemoClient || isPublicIndexedListing) return;\n''',
)
replace_once(
    "src/components/RestaurantCard.tsx",
    '            priceRange={priceRange}\n',
    '            priceRange={priceRange || 2}\n',
)
replace_once(
    "src/components/RestaurantCard.tsx",
    '''            {showDelivery ? (\n              <Badge className="gap-1 border-none bg-primary/95 text-[9px] font-bold uppercase text-white shadow-sm backdrop-blur-md">\n                <Bike className="h-3 w-3" /> Livraison\n              </Badge>\n            ) : null}\n''',
    '''            {isPublicIndexedListing ? (\n              <Badge className="gap-1 border-none bg-slate-900/85 text-[9px] font-bold text-white shadow-sm backdrop-blur-md">\n                <Database className="h-3 w-3" /> Indexé depuis une base publique\n              </Badge>\n            ) : null}\n            {showDelivery ? (\n              <Badge className="gap-1 border-none bg-primary/95 text-[9px] font-bold uppercase text-white shadow-sm backdrop-blur-md">\n                <Bike className="h-3 w-3" /> Livraison\n              </Badge>\n            ) : null}\n''',
)
replace_once(
    "src/components/RestaurantCard.tsx",
    '''          <button\n            className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/90 backdrop-blur-sm transition-colors hover:bg-white dark:border dark:border-white/20 dark:bg-slate-950/80 dark:shadow-[0_0_22px_rgba(255,255,255,0.08)] dark:hover:bg-slate-900"\n            onClick={toggleFavorite}\n          >\n            <Heart className={isFavorite ? "h-4 w-4 fill-red-500 text-red-500" : "h-4 w-4 text-muted-foreground dark:text-white/80"} />\n          </button>\n''',
    '''          {!isPublicIndexedListing ? (\n            <button\n              data-card-action="favorite"\n              className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/90 backdrop-blur-sm transition-colors hover:bg-white dark:border dark:border-white/20 dark:bg-slate-950/80 dark:shadow-[0_0_22px_rgba(255,255,255,0.08)] dark:hover:bg-slate-900"\n              onClick={toggleFavorite}\n            >\n              <Heart className={isFavorite ? "h-4 w-4 fill-red-500 text-red-500" : "h-4 w-4 text-muted-foreground dark:text-white/80"} />\n            </button>\n          ) : null}\n''',
)
replace_once(
    "src/components/RestaurantCard.tsx",
    '''                {cuisine ? <span className="max-w-full truncate">{cuisine}</span> : null}\n                {cuisine ? <span className="text-border">/</span> : null}\n                <PriceRangeIcons range={priceRange} />\n''',
    '''                {cuisine ? <span className="max-w-full truncate">{cuisine}</span> : null}\n                {cuisine && priceRange ? <span className="text-border">/</span> : null}\n                {priceRange ? <PriceRangeIcons range={priceRange} /> : null}\n                {isPublicIndexedListing ? <span className="normal-case tracking-normal text-muted-foreground">{listingClaimStatus === "claim_pending" ? "Revendication en cours" : listingSource || "Source publique"}</span> : null}\n''',
)

# Auth recovery type and claim metadata.
replace_once(
    "src/lib/privilegedSignupRecovery.ts",
    '''  commercialReferralToken?: string;\n  createdAt: number;\n''',
    '''  commercialReferralToken?: string;\n  claimRestaurantId?: string;\n  createdAt: number;\n''',
)
replace_once(
    "src/lib/privilegedSignupRecovery.ts",
    '''    commercialReferralToken: input.commercialReferralToken,\n    createdAt: now,\n''',
    '''    commercialReferralToken: input.commercialReferralToken,\n    claimRestaurantId: input.claimRestaurantId,\n    createdAt: now,\n''',
)
replace_once(
    "src/pages/Auth.tsx",
    '''  contractContentSha256?: string | null;\n  commercialReferralToken?: string;\n};\n''',
    '''  contractContentSha256?: string | null;\n  commercialReferralToken?: string;\n  claimRestaurantId?: string;\n};\n''',
)
replace_once(
    "src/pages/Auth.tsx",
    '''              onboarding_source: "auth_signup_confirmed",\n              signup_operation_id: operationId,\n''',
    '''              onboarding_source: "auth_signup_confirmed",\n              signup_operation_id: operationId,\n              public_listing_id: payload.claimRestaurantId || null,\n''',
)
replace_once(
    "src/pages/Auth.tsx",
    '''  const [searchParams] = useSearchParams();\n  const [commercialReferralToken, setCommercialReferralToken] = useState(() => {\n''',
    '''  const [searchParams] = useSearchParams();\n  const claimRestaurantSlug = String(searchParams.get("claimRestaurant") || "").trim().toLowerCase();\n  const [commercialReferralToken, setCommercialReferralToken] = useState(() => {\n''',
)
replace_once(
    "src/pages/Auth.tsx",
    '''  const [signupForm, setSignupForm] =\n    useState<SignupFormState>(EMPTY_SIGNUP_FORM);\n  const [loading, setLoading] = useState(false);\n''',
    '''  const [signupForm, setSignupForm] =\n    useState<SignupFormState>(EMPTY_SIGNUP_FORM);\n  const [claimRestaurantId, setClaimRestaurantId] = useState("");\n  const [claimRestaurantName, setClaimRestaurantName] = useState("");\n  const [loading, setLoading] = useState(false);\n''',
)
replace_once(
    "src/pages/Auth.tsx",
    '''  useEffect(() => {\n    authMountedRef.current = true;\n''',
    '''  useEffect(() => {\n    if (!claimRestaurantSlug || isLogin || roleMode !== "restaurateur") return;\n    let cancelled = false;\n    void (supabase.rpc as any)("get_public_restaurant_listing", { p_slug: claimRestaurantSlug })\n      .then(({ data, error }: { data?: any[] | null; error?: Error | null }) => {\n        if (cancelled) return;\n        if (error) throw error;\n        const listing = (data || [])[0];\n        if (!listing || listing.claim_status !== "unclaimed") {\n          toast({ title: "Fiche non revendicable", description: "Cette fiche est déjà revendiquée ou en cours de vérification.", variant: "destructive" });\n          return;\n        }\n        setClaimRestaurantId(String(listing.id || ""));\n        setClaimRestaurantName(String(listing.name || ""));\n        setSignupForm((current) => ({\n          ...current,\n          restaurantName: current.restaurantName || String(listing.name || ""),\n          businessName: current.businessName || String(listing.name || ""),\n          city: current.city || String(listing.city || ""),\n          address: current.address || String(listing.address || ""),\n          phone: current.phone || String(listing.phone || ""),\n        }));\n      })\n      .catch((error: unknown) => {\n        if (cancelled) return;\n        toast({ title: "Fiche indisponible", description: error instanceof Error ? error.message : "Impossible de charger la fiche publique.", variant: "destructive" });\n      });\n    return () => { cancelled = true; };\n  }, [claimRestaurantSlug, isLogin, roleMode, toast]);\n\n  useEffect(() => {\n    authMountedRef.current = true;\n''',
)
replace_once(
    "src/pages/Auth.tsx",
    '''        const recoveredReferralToken =\n          recovery?.commercialReferralToken || commercialReferralToken;\n''',
    '''        const recoveredReferralToken =\n          recovery?.commercialReferralToken || commercialReferralToken;\n        const recoveredClaimRestaurantId =\n          recovery?.claimRestaurantId || String(safe.public_listing_id || claimRestaurantId || "");\n        if (recoveredClaimRestaurantId) setClaimRestaurantId(recoveredClaimRestaurantId);\n''',
)
replace_once(
    "src/pages/Auth.tsx",
    '''          commercialReferralToken:\n            draft.requested_role === "restaurateur"\n              ? recoveredReferralToken || undefined\n              : undefined,\n        };\n''',
    '''          commercialReferralToken:\n            draft.requested_role === "restaurateur"\n              ? recoveredReferralToken || undefined\n              : undefined,\n          claimRestaurantId:\n            draft.requested_role === "restaurateur"\n              ? recoveredClaimRestaurantId || undefined\n              : undefined,\n        };\n''',
)
replace_once(
    "src/pages/Auth.tsx",
    '''            commercialReferralToken:\n              submittedRole === "restaurateur"\n                ? commercialReferralToken || undefined\n                : undefined,\n          });\n''',
    '''            commercialReferralToken:\n              submittedRole === "restaurateur"\n                ? commercialReferralToken || undefined\n                : undefined,\n            claimRestaurantId:\n              submittedRole === "restaurateur"\n                ? claimRestaurantId || undefined\n                : undefined,\n          });\n''',
)
replace_once(
    "src/pages/Auth.tsx",
    '''                    signup_subscription_billing_period:\n                      submittedRole === "restaurateur"\n                        ? submittedOnboardingChoices.subscriptionBillingPeriod\n                        : null,\n''',
    '''                    signup_subscription_billing_period:\n                      submittedRole === "restaurateur"\n                        ? submittedOnboardingChoices.subscriptionBillingPeriod\n                        : null,\n                    signup_public_listing_id:\n                      submittedRole === "restaurateur"\n                        ? claimRestaurantId || null\n                        : null,\n''',
)
replace_once(
    "src/pages/Auth.tsx",
    '''        commercialReferralToken:\n          submittedRole === "restaurateur"\n            ? commercialReferralToken || undefined\n            : undefined,\n      };\n''',
    '''        commercialReferralToken:\n          submittedRole === "restaurateur"\n            ? commercialReferralToken || undefined\n            : undefined,\n        claimRestaurantId:\n          submittedRole === "restaurateur"\n            ? claimRestaurantId || undefined\n            : undefined,\n      };\n''',
)
# Restore claim id from local confirmation draft.
replace_once(
    "src/pages/Auth.tsx",
    '''        setRoleMode(draft.role);\n        privilegedSignupOperationRef.current = {\n''',
    '''        setRoleMode(draft.role);\n        if (draft.claimRestaurantId) setClaimRestaurantId(draft.claimRestaurantId);\n        privilegedSignupOperationRef.current = {\n''',
)

# Visible claim notice near the signup form heading if this is a claim flow.
replace_once(
    "src/pages/Auth.tsx",
    '''  const requiredDocuments = useMemo(\n''',
    '''  const claimNotice = claimRestaurantId && claimRestaurantName\n    ? `Vous revendiquez la fiche publique « ${claimRestaurantName} ». Les informations de base ont été préremplies ; complétez vos informations légales pour finaliser l'inscription.`\n    : "";\n\n  const requiredDocuments = useMemo(\n''',
)

print("Public registry frontend/auth patch applied")
