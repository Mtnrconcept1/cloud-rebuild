import { useEffect, useMemo, useState } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";

import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";
import DesktopHomeExperience from "@/components/home/DesktopHomeExperience";
import { getCommercialDemoClientRestaurants } from "@/lib/commercialDemoClientCatalog";
import {
  buildHomeRestaurantSections,
  type HomeRestaurantCandidate,
} from "@/lib/homeRestaurantDiscovery";
import { formatRestaurantCategorySummary } from "@/lib/restaurantCategories";

function mapCandidate(row: any): HomeRestaurantCandidate {
  return {
    ...row,
    cuisine_type: formatRestaurantCategorySummary(
      Array.isArray(row?.category_names) ? row.category_names : [],
      row?.cuisine_type || "",
    ),
  } as HomeRestaurantCandidate;
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

function preferGeneva(restaurants: HomeRestaurantCandidate[]) {
  const genevaRestaurants = restaurants.filter((restaurant) => normalizeCity(restaurant.city) === "geneve");
  return genevaRestaurants.length > 0 ? genevaRestaurants : restaurants;
}

export default function DesktopHomeExperienceConnected() {
  const queryClient = useQueryClient();
  const commercialDemoFrame = useCommercialDemoFrame();
  const isCommercialDemoClient = commercialDemoFrame?.surface === "client";
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

  const demoRestaurants = useMemo(
    () => isCommercialDemoClient && desktopEnabled
      ? getCommercialDemoClientRestaurants(commercialDemoFrame.snapshot).map(mapCandidate)
      : [],
    [commercialDemoFrame, desktopEnabled, isCommercialDemoClient],
  );

  const cachedCandidates = latestCachedRestaurantPool(queryClient, "home-candidate-pool");
  const cachedOffers = latestCachedRestaurantPool(queryClient, "home-offer-candidate-pool");
  const baseCandidates = isCommercialDemoClient ? demoRestaurants : cachedCandidates;
  const baseOffers = isCommercialDemoClient ? [] : cachedOffers;
  const candidates = preferGeneva(baseCandidates);
  const genevaOffers = baseOffers.filter((restaurant) => normalizeCity(restaurant.city) === "geneve");
  const offerCandidates = candidates.some((restaurant) => normalizeCity(restaurant.city) === "geneve")
    ? genevaOffers
    : baseOffers;

  const sections = useMemo(() => buildHomeRestaurantSections({
    candidates,
    offerCandidates,
    seed: `desktop-home:${new Date().toISOString().slice(0, 10)}`,
    lunchFocus: new Date().getHours() < 16,
  }), [candidates, offerCandidates]);

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
        favorites={sections.localCards}
        best={sections.trendingCards}
        nearby={sections.localCards}
        city="Genève"
      />
    </>
  );
}
