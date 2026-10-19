import { useCallback, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  loadMarketingDailySeries,
  updateMarketingDailySeries,
  type MarketingDailySeriesInput,
} from "@/marketing/dailySeriesClient";
import { MarketingBffError } from "@/marketing/marketingBffClient";

const QUERY_KEY = ["admin-marketing-daily-series"] as const;

type DailyNotice = { tone: "success" | "error"; message: string } | null;

function errorMessage(error: unknown): string {
  return error instanceof MarketingBffError
    ? error.message
    : "La série quotidienne est momentanément indisponible. Actualisez ses réglages pour réessayer.";
}

export function useMarketingDailySeries({ canMutateBackend }: { canMutateBackend: boolean }) {
  const queryClient = useQueryClient();
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [notice, setNotice] = useState<DailyNotice>(null);
  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: ({ signal }) => loadMarketingDailySeries(signal),
    enabled: canMutateBackend,
    staleTime: 30_000,
    refetchInterval: canMutateBackend && !saving ? 60_000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const refresh = useCallback(async () => {
    if (savingRef.current || !canMutateBackend) return false;
    const result = await query.refetch();
    if (result.isSuccess) {
      setConflict(false);
      setNotice(null);
      return true;
    }
    return false;
  }, [canMutateBackend, query]);

  const save = useCallback(async (input: MarketingDailySeriesInput) => {
    if (savingRef.current || !canMutateBackend || !query.data || query.isError || conflict) return undefined;
    savingRef.current = true;
    setSaving(true);
    setNotice(null);
    try {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const result = await updateMarketingDailySeries(input);
      queryClient.setQueryData(QUERY_KEY, result);
      setNotice({ tone: "success", message: result.series.status === "paused"
        ? "Série en pause. Les brouillons déjà créés restent disponibles."
        : `Série enregistrée : un nouveau brouillon chaque jour à ${result.series.localTime}, heure de Genève.` });
      return result;
    } catch (error) {
      const editConflict = error instanceof MarketingBffError && error.status === 409;
      setConflict(editConflict);
      setNotice({ tone: "error", message: editConflict
        ? "La série a été modifiée depuis son ouverture. Rechargez les réglages, puis vérifiez votre horaire avant d’enregistrer."
        : errorMessage(error) });
      return undefined;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [canMutateBackend, conflict, query.data, query.isError, queryClient]);

  return {
    dashboard: query.data ?? null,
    loading: canMutateBackend && query.isPending,
    refreshing: query.isFetching,
    error: query.isError ? errorMessage(query.error) : null,
    saving,
    conflict,
    notice,
    refresh,
    save,
  };
}
