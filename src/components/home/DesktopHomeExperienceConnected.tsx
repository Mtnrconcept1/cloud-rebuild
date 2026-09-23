import { useEffect, useMemo, useReducer, useState } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";
import DesktopHomeExperience from "@/components/home/DesktopHomeExperience";
import { getSupabase } from "@/integrations/supabase/client";
import { getCommercialDemoClientRestaurants } from "@/lib/commercialDemoClientCatalog";
import {
  buildHomeRestaurantSections,
  type HomeRestaurantCandidate,
} from "@/lib/homeRestaurantDiscovery";
import { hasRestaurantVisual } from "@/lib/randomizedRestaurantOrder";
import { formatRestaurantCategorySummary } from "@/lib/restaurantCategories";

const supabase = getSupabase();
const DESKTOP_GENEVA_PAGE_SIZE = 54;
const TARGET_GENEVA_VISUALS = 8;
const MAX_GENEVA_CANDIDATE_PAGES = 4;

function mapCandidate(row: any): HomeRestaurantCandidate {
  return {
    ...row,
    cuisine_type: formatRestaurantCategorySummary(
      Array.isArray(row?.category_names) ? row.category_names : [],
      row?.cuisine_type || "",
    ),
  } as HomeRestaurantCandidate;
}

function candidateId(restaurant: HomeRestaurantCandidate) {
  return String(restaurant?.id || "").trim();
}

function mergeUniqueCandidates(groups: readonly (readonly HomeRestaurantCandidate[])[]) {
  const seen = new Set<string>();
  const merged: HomeRestaurantCandidate[] = [];

  for (const group of groups) {
    for (const restaurant of group) {
      const id = candidateId(restaurant);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      merged.push(restaurant);
    }
  }

  return merged;
}

async function fetchGenevaVisualCandidatePool(): Promise<HomeRestaurantCandidate[]> {
  const collected: HomeRestaurantCandidate[] = [];
  const seen = new Set<string>();
  let offset = 0;

  for (let pageIndex = 0; pageIndex < MAX_GENEVA_CANDIDATE_PAGES; pageIndex += 1) {
    const { data, error } = await (supabase.rpc as any)("search_restaurants_catalog_page", {
      p_query: null,
      p_city: "Genève",
      p_cuisine: null,
      p_price_range: null,
      p_delivery_only: false,
      p_min_rating: 0,
      p_sort_by: "pertinence",
      p_sort_direction: "desc",
      p_limit: DESKTOP_GENEVA_PAGE_SIZE,
      p_offset: offset,
    });

    if (error) throw error;
    const page = Array.isArray(data) ? data[0] : data;
    const rawItems = Array.isArray(page?.items) ? page.items : [];

    rawItems.map(mapCandidate).forEach((restaurant) => {
      const id = candidateId(restaurant);
      if (!id || seen.has(id)) return;
      seen.add(id);
      collected.push(restaurant);
    });

    const visualCount = collected.filter(hasRestaurantVisual).length;
    const nextOffset = Number(page?.next_offset);
    if (
      visualCount >= TARGET_GENEVA_VISUALS
      || !Number.isFinite(nextOffset)
      || nextOffset <= offset
    ) {
      break;
    }
    offset = nextOffset;
  }

  const visualCandidates = collected.filter(hasRestaurantVisual);
  const ids = visualCandidates.map(candidateId).filter(Boolean);
  if (ids.length === 0) return [];

  const { data: restaurantDetails, error: detailsError } = await supabase
    .from("restaurants")
    .select("id, latitude, longitude, opening_hours, supports_reservation, supports_dinein, supports_pickup")
    .in("id", ids);

  if (detailsError) return visualCandidates;

  const detailsById = new Map(
    ((restaurantDetails || []) as any[]).map((restaurant) => [String(restaurant.id), restaurant]),
  );

  return visualCandidates.map((restaurant) => ({
    ...restaurant,
    ...(detailsById.get(candidateId(restaurant)) || {}),
  }));
}

function latestCachedRestaurantPool(queryClient: QueryClient, key: string): HomeRestaurantCandidate[] {
  const latestQuery = queryClient
    .getQueryCache()
    .findAll({ queryKey: [key] })
    .filter((query) => Array.isArray(query.state.data))
    .sort((left, right) => right.state.dataUpdatedAt - left.state.dataUpdatedAt)[0];

  return Array.isArray(latestQuery?.state.data)
    ? (latestQuery.state.data as HomeRestaurantCandidate[])
    : [];
}

function normalizeCity(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function genevaOnly(restaurants: HomeRestaurantCandidate[]) {
  return restaurants.filter((restaurant) => normalizeCity(restaurant.city) === "geneve");
}

export default function DesktopHomeExperienceConnected() {
  const queryClient = useQueryClient();
  const commercialDemoFrame = useCommercialDemoFrame();
  const isCommercialDemoClient = commercialDemoFrame?.surface === "client";
  const [, refreshCache] = useReducer((revision: number) => revision + 1, 0);
  const [desktopEnabled, setDesktopEnabled] = useState(() => (
    typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches
  ));

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const media = window.matchMedia("(min-width: 1024px)");
    const sync = () => setDesktopEnabled(media.matches);
    sync();
    media.addEventListener?.("change", sync);
    return () => media.removeEventListener?.("change", sync);
  }, []);

  useEffect(() => {
    if (isCommercialDemoClient || !desktopEnabled) return undefined;

    return queryClient.getQueryCache().subscribe((event) => {
      const queryKey = event.query.queryKey;
      if (!Array.isArray(queryKey)) return;
      const rootKey = String(queryKey[0] || "");
      if (rootKey === "home-candidate-pool" || rootKey === "home-offer-candidate-pool") {
        refreshCache();
      }
    });
  }, [desktopEnabled, isCommercialDemoClient, queryClient]);

  const demoRestaurants = useMemo(
    () => commercialDemoFrame?.surface === "client" && desktopEnabled
      ? getCommercialDemoClientRestaurants(commercialDemoFrame.snapshot).map(mapCandidate)
      : [],
    [commercialDemoFrame, desktopEnabled],
  );

  const cachedCandidates = latestCachedRestaurantPool(queryClient, "home-candidate-pool");
  const cachedOffers = latestCachedRestaurantPool(queryClient, "home-offer-candidate-pool");
  const cachedGenevaCandidates = genevaOnly(cachedCandidates);
  const cachedGenevaVisuals = cachedGenevaCandidates.filter(hasRestaurantVisual);
  const cachedGenevaOffers = genevaOnly(cachedOffers);

  const { data: hydratedGenevaVisuals = [] } = useQuery({
    queryKey: ["desktop-home-geneva-visual-pool"],
    queryFn: fetchGenevaVisualCandidatePool,
    enabled: desktopEnabled && !isCommercialDemoClient && cachedGenevaVisuals.length < TARGET_GENEVA_VISUALS,
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
  });

  const visualCandidates = useMemo(
    () => isCommercialDemoClient
      ? demoRestaurants.filter(hasRestaurantVisual)
      : mergeUniqueCandidates([cachedGenevaVisuals, hydratedGenevaVisuals]).filter(hasRestaurantVisual),
    [cachedGenevaVisuals, demoRestaurants, hydratedGenevaVisuals, isCommercialDemoClient],
  );
  const offerCandidates = isCommercialDemoClient ? [] : cachedGenevaOffers;

  const sections = useMemo(() => buildHomeRestaurantSections({
    candidates: visualCandidates,
    offerCandidates,
    seed: `desktop-home:${new Date().toISOString().slice(0, 10)}`,
    lunchFocus: new Date().getHours() < 16,
    sectionSize: 6,
    trendingSize: 8,
  }), [offerCandidates, visualCandidates]);

  if (!desktopEnabled) return null;

  return (
    <>
      <style>{`
        @media (min-width: 1024px) {
          main:has(> [data-testid="desktop-home-reference-shell"]) {
            padding-bottom: 0 !important;
            background: #fff;
          }
          main > [data-testid="desktop-home-reference-shell"] ~ * {
            display: none !important;
          }
        }
      `}</style>
      <DesktopHomeExperience
        offers={sections.offersCards}
        local={sections.localCards}
        lunch={sections.lunchCards}
        dinner={sections.dinnerCards}
        trending={sections.trendingCards}
        catalogue={visualCandidates}
        nearby={sections.localCards}
        trendingMode={sections.trendingMode}
        city="Genève"
      />
    </>
  );
}
