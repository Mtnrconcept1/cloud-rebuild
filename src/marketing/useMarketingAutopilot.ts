import { useCallback, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  createMarketingAutopilotClientRequestId,
  isRetryableMarketingAutopilotError,
  loadMarketingAutopilotDashboard,
  prepareMarketingAutomationAction,
  simulateMarketingAutomation,
  updateMarketingProviderControl,
  upsertMarketingAsset,
} from "@/marketing/autopilotClient";
import {
  createFallbackMarketingAutopilotDashboard,
  type MarketingAssetInput,
  type MarketingAutomationSimulation,
  type MarketingAutomationTemplateKey,
  type MarketingProviderControlInput,
} from "@/marketing/autopilotTypes";

export type MarketingAutopilotNotice = {
  tone: "success" | "warning" | "error";
  message: string;
} | null;

type MarketingDraftAttempt = {
  automationKey: string;
  automationInput: Record<string, unknown>;
  clientRequestId: string;
  reason: string;
  simulationKey: string;
};

function safeMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Action Autopilot refusée par le backend.";
  return message.replace(/[\r\n]+/g, " ").slice(0, 200);
}

export function useMarketingAutopilot({ enabled = true }: { enabled?: boolean } = {}) {
  const fallback = useRef(createFallbackMarketingAutopilotDashboard());
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<MarketingAutopilotNotice>(null);
  const [simulation, setSimulation] = useState<MarketingAutomationSimulation | null>(null);
  const draftAttempts = useRef(new Map<string, MarketingDraftAttempt>());

  const dashboardQuery = useQuery({
    queryKey: ["admin-marketing-autopilot-dashboard"],
    queryFn: loadMarketingAutopilotDashboard,
    enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const dashboard = dashboardQuery.data || fallback.current;

  const runAction = useCallback(async <T,>(key: string, action: () => Promise<T>) => {
    if (dashboard.source !== "backend") {
      setNotice({
        tone: "error",
        message: "Backend Autopilot non confirmé : aucune action n'a été enregistrée, même localement.",
      });
      return undefined;
    }
    setPendingAction(key);
    setNotice(null);
    try {
      return await action();
    } catch (error) {
      setNotice({ tone: "error", message: safeMessage(error) });
      return undefined;
    } finally {
      setPendingAction(null);
    }
  }, [dashboard.source]);

  const simulate = useCallback(async (templateKey: MarketingAutomationTemplateKey) => {
    const result = await runAction(`simulate:${templateKey}`, () => simulateMarketingAutomation(templateKey));
    if (result) {
      setSimulation(result);
      setNotice({
        tone: result.status === "blocked" ? "warning" : "success",
        message: result.status === "blocked"
          ? "Simulation terminée : les blocages doivent être levés avant de préparer un brouillon."
          : "Simulation terminée. Aucun envoi, publication, achat ou dépense n'a été déclenché.",
      });
    }
    return result;
  }, [runAction]);

  const prepareDraft = useCallback(async (reason: string) => {
    if (!simulation?.id || simulation.status === "blocked") {
      setNotice({ tone: "error", message: "Une simulation valide et non bloquée est requise." });
      return undefined;
    }
    if (reason.trim().length < 8) {
      setNotice({ tone: "error", message: "Le motif du brouillon doit contenir au moins 8 caractères." });
      return undefined;
    }
    if (dashboard.source !== "backend") {
      setNotice({
        tone: "error",
        message: "Backend Autopilot non confirmé : aucun brouillon n'a été préparé.",
      });
      return undefined;
    }
    const attemptKey = `${simulation.templateKey}:${simulation.id}`;
    let attempt = draftAttempts.current.get(attemptKey);
    if (!attempt) {
      try {
        attempt = {
          automationKey: simulation.templateKey,
          automationInput: simulation.input,
          clientRequestId: createMarketingAutopilotClientRequestId(),
          reason: reason.trim(),
          simulationKey: simulation.id,
        };
      } catch (error) {
        setNotice({ tone: "error", message: safeMessage(error) });
        return undefined;
      }
      draftAttempts.current.set(attemptKey, attempt);
    }
    let failure: unknown;
    const result = await runAction("prepare-draft", async () => {
      try {
        return await prepareMarketingAutomationAction(attempt);
      } catch (error) {
        failure = error;
        throw error;
      }
    });
    if (result) {
      draftAttempts.current.delete(attemptKey);
      setNotice({
        tone: "success",
        message: "Brouillon préparé et journalisé. Toutes les actions externes restent bloquées.",
      });
      setSimulation(null);
      await dashboardQuery.refetch();
    } else if (failure && isRetryableMarketingAutopilotError(failure)) {
      setNotice({
        tone: "warning",
        message: "Réponse serveur non confirmée. Réessayez : le même reçu de simulation, le même motif et le même identifiant idempotent seront réutilisés.",
      });
    } else if (failure) {
      draftAttempts.current.delete(attemptKey);
    }
    return result;
  }, [dashboard.source, dashboardQuery, runAction, simulation]);

  const saveProviderControl = useCallback(async (input: MarketingProviderControlInput) => {
    if (!input.provider || input.reason.trim().length < 8) {
      setNotice({ tone: "error", message: "Un fournisseur et un motif d'au moins 8 caractères sont requis." });
      return undefined;
    }
    const result = await runAction(`provider:${input.provider}`, () => updateMarketingProviderControl({
      ...input,
      reason: input.reason.trim(),
    }));
    if (result !== undefined) {
      setNotice({
        tone: "success",
        message: input.status === "unconfigured"
          ? "Le fournisseur reste non configuré et la décision a été journalisée."
          : "Pause fournisseur enregistrée. Aucune action externe n'est autorisée.",
      });
      await dashboardQuery.refetch();
    }
    return result;
  }, [dashboardQuery, runAction]);

  const saveAssetMetadata = useCallback(async (input: MarketingAssetInput, expectedUpdatedAt: string | null = null) => {
    const result = await runAction("save-asset", () => upsertMarketingAsset(input, expectedUpdatedAt));
    if (result !== undefined) {
      setNotice({ tone: "success", message: "Métadonnées de l'asset enregistrées sans publication ni impression." });
      await dashboardQuery.refetch();
    }
    return result;
  }, [dashboardQuery, runAction]);

  return {
    dashboard,
    loading: enabled && dashboardQuery.isPending,
    refreshing: dashboardQuery.isFetching,
    error: dashboardQuery.error ? safeMessage(dashboardQuery.error) : null,
    pendingAction,
    notice,
    simulation,
    refresh: dashboardQuery.refetch,
    clearNotice: () => setNotice(null),
    clearSimulation: () => setSimulation(null),
    simulate,
    prepareDraft,
    saveProviderControl,
    saveAssetMetadata,
  };
}

export type MarketingAutopilotController = ReturnType<typeof useMarketingAutopilot>;
