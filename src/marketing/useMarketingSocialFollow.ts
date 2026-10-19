import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  addSocialFollowProfile,
  collectSocialFollowProfiles,
  listSocialFollowProfiles,
  listSocialFollowRestaurants,
  recordSocialFollow,
  socialFollowErrorMessage,
  type SocialFollowAddInput,
  type SocialFollowRecordInput,
} from "@/marketing/socialFollowClient";
import type {
  MarketingSocialFollowList,
  MarketingSocialFollowStatus,
  MarketingSocialPlatform,
} from "../../supabase/functions/_shared/marketing-social-follow-contract";

export const SOCIAL_FOLLOW_PAGE_SIZE = 20;
export const SOCIAL_FOLLOW_QUERY_KEY = ["marketing-social-follow"] as const;
export type SocialFollowMode = "profiles" | "restaurants";
type SocialNotice = { tone: "success" | "warning" | "error"; message: string } | null;

export function useSocialFollowSearch(value: string) {
  const [query, setQuery] = useState(value);
  useEffect(() => {
    const timeout = window.setTimeout(() => setQuery(value), 250);
    return () => window.clearTimeout(timeout);
  }, [value]);
  return { query, debouncing: query !== value };
}

export function useMarketingSocialFollow({
  enabled,
  mode,
  query,
  platform,
  status,
  page,
}: {
  enabled: boolean;
  mode: SocialFollowMode;
  query: string;
  platform: MarketingSocialPlatform | "all";
  status: MarketingSocialFollowStatus | "all";
  page: number;
}) {
  const queryClient = useQueryClient();
  const search = useSocialFollowSearch(query);
  const mounted = useRef(false);
  const collectionController = useRef<AbortController | null>(null);
  const mutationRef = useRef<string | null>(null);
  const [collecting, setCollecting] = useState(false);
  const [collectingRestaurantId, setCollectingRestaurantId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<SocialNotice>(null);

  const profilesQuery = useQuery({
    queryKey: [...SOCIAL_FOLLOW_QUERY_KEY, "profiles", mode, search.query, platform, status, page],
    queryFn: ({ signal }) => listSocialFollowProfiles({
      query: mode === "profiles" ? search.query : "",
      platform: mode === "profiles" ? platform : "all",
      status: mode === "profiles" ? status : "all",
      limit: mode === "profiles" ? SOCIAL_FOLLOW_PAGE_SIZE : 1,
      offset: mode === "profiles" ? (page - 1) * SOCIAL_FOLLOW_PAGE_SIZE : 0,
    }, signal),
    enabled: enabled && !search.debouncing,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const restaurantsQuery = useQuery({
    queryKey: [...SOCIAL_FOLLOW_QUERY_KEY, "restaurants", search.query, page],
    queryFn: ({ signal }) => listSocialFollowRestaurants({
      query: search.query,
      limit: SOCIAL_FOLLOW_PAGE_SIZE,
      offset: (page - 1) * SOCIAL_FOLLOW_PAGE_SIZE,
    }, signal),
    enabled: enabled && mode === "restaurants" && !search.debouncing,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  });

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      collectionController.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      collectionController.current?.abort();
      void queryClient.cancelQueries({ queryKey: SOCIAL_FOLLOW_QUERY_KEY });
    }
  }, [enabled, queryClient]);

  const refreshQueries = useCallback(() => queryClient.invalidateQueries(
    { queryKey: SOCIAL_FOLLOW_QUERY_KEY },
    { throwOnError: true },
  ), [queryClient]);

  const refresh = useCallback(async () => {
    setNotice(null);
    try {
      await refreshQueries();
    } catch (error) {
      if (mounted.current) setNotice({ tone: "error", message: socialFollowErrorMessage(error) });
    }
  }, [refreshQueries]);

  const stopCollection = useCallback(() => {
    if (!collectionController.current) return;
    collectionController.current.abort();
    setNotice({
      tone: "warning",
      message: "Collecte arrêtée. Le lot déjà transmis peut encore se terminer sur le serveur. Actualisez l’avancement avant de reprendre.",
    });
  }, []);

  const startCollection = useCallback(async (restaurantId: string | null = null) => {
    if (!enabled || collectionController.current) return;
    const controller = new AbortController();
    collectionController.current = controller;
    setCollecting(true);
    setCollectingRestaurantId(restaurantId);
    setNotice(null);
    try {
      while (!controller.signal.aborted) {
        const result = await collectSocialFollowProfiles(restaurantId, controller.signal);
        if (controller.signal.aborted || !mounted.current) return;
        queryClient.setQueriesData<MarketingSocialFollowList>(
          { queryKey: [...SOCIAL_FOLLOW_QUERY_KEY, "profiles"] },
          (current) => current ? { ...current, collection: result.collection } : current,
        );
        await refreshQueries();
        if (controller.signal.aborted || !mounted.current) return;
        if (restaurantId) {
          const target = result.results.find((item) => item.restaurantId === restaurantId);
          if (result.processed === 0 || !target) {
            setNotice({ tone: "warning", message: "Aucune nouvelle recherche n’a été effectuée pour ce restaurant. Actualisez son état avant de réessayer." });
          } else {
            const messages = {
              success: "Recherche de ce restaurant enregistrée. Les comptes retrouvés restent à vérifier manuellement.",
              no_profiles: "Aucun profil repéré sur le site de ce restaurant. Vous pouvez ajouter un compte trouvé manuellement.",
              no_website: "Ce restaurant n’a pas de site exploitable. Les liens déjà présents dans sa fiche ont été examinés ; vous pouvez ajouter un autre compte manuellement.",
              robots_blocked: "Le site de ce restaurant refuse la recherche. Vous pouvez ajouter un compte trouvé manuellement.",
              error: "La recherche sur le site de ce restaurant n’a pas abouti. Son état est enregistré ; actualisez avant de réessayer.",
            };
            setNotice({ tone: target.status === "error" || target.status === "robots_blocked" ? "warning" : "success", message: messages[target.status] });
          }
          break;
        }
        if (result.collection.pending === 0 || !result.hasMore) {
          setNotice({
            tone: result.collection.processing > 0 || result.collection.pending > 0 ? "warning" : "success",
            message: result.collection.processing > 0
                ? "Les autres lots sont encore réservés sur le serveur. Actualisez, puis reprenez pour poursuivre les restaurants restants."
                : result.collection.pending > 0
                  ? "Des restaurants restent en attente d’une nouvelle tentative. L’avancement est conservé ; actualisez et reprenez lorsqu’un lot est disponible."
                : "Collecte terminée pour les restaurants disponibles. Les comptes retrouvés restent à contrôler manuellement.",
          });
          break;
        }
        if (result.processed === 0) {
          setNotice({ tone: "warning", message: "La collecte attend un lot disponible. L’avancement est conservé ; actualisez avant de reprendre." });
          break;
        }
      }
    } catch (error) {
      if (!controller.signal.aborted && mounted.current) {
        setNotice({
          tone: "error",
          message: `Collecte arrêtée. ${socialFollowErrorMessage(error)} L’avancement déjà enregistré est conservé ; un lot sans réponse peut encore se terminer.`,
        });
      }
    } finally {
      if (collectionController.current === controller) {
        collectionController.current = null;
        if (mounted.current) {
          setCollecting(false);
          setCollectingRestaurantId(null);
        }
      }
    }
  }, [enabled, queryClient, refreshQueries]);

  const save = useCallback(async <T,>(key: string, action: () => Promise<T>): Promise<T | undefined> => {
    if (!enabled) throw new Error("Le centre marketing doit être disponible pour enregistrer ce contrôle.");
    if (mutationRef.current) return undefined;
    mutationRef.current = key;
    setPendingAction(key);
    setNotice(null);
    try {
      const result = await action();
      try {
        await refreshQueries();
      } catch {
        if (mounted.current) setNotice({ tone: "warning", message: "L’enregistrement est confirmé, mais la liste n’a pas pu être actualisée. Rechargez les données." });
      }
      return result;
    } catch (error) {
      // A version/account conflict requires a fresh list before another confirmation.
      await refreshQueries().catch(() => undefined);
      throw error;
    } finally {
      mutationRef.current = null;
      if (mounted.current) setPendingAction(null);
    }
  }, [enabled, refreshQueries]);

  return {
    profiles: enabled && !search.debouncing ? profilesQuery.data : undefined,
    restaurants: enabled && !search.debouncing ? restaurantsQuery.data : undefined,
    loading: enabled && (search.debouncing || profilesQuery.isPending || (mode === "restaurants" && restaurantsQuery.isPending)),
    refreshing: profilesQuery.isFetching || (mode === "restaurants" && restaurantsQuery.isFetching),
    error: profilesQuery.error || (mode === "restaurants" && restaurantsQuery.error)
      ? socialFollowErrorMessage(profilesQuery.error || restaurantsQuery.error) : null,
    collecting,
    collectingRestaurantId,
    pendingAction,
    notice,
    refresh,
    startCollection,
    stopCollection,
    clearNotice: () => setNotice(null),
    record: (input: SocialFollowRecordInput) => save(`record:${input.profileId}`, () => recordSocialFollow(input)),
    add: (input: SocialFollowAddInput) => save("add", () => addSocialFollowProfile(input)),
  };
}

export type MarketingSocialFollowController = ReturnType<typeof useMarketingSocialFollow>;
