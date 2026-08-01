import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { createFallbackMarketingSnapshot } from "@/marketing/fallbackSnapshot";
import {
  approveMarketingCampaign,
  approveMarketingItem,
  cancelMarketingItem,
  completeManualMarketingDelivery,
  completeManualMarketingItem,
  createMarketingCampaignBundle,
  estimateMarketingAudience,
  listMarketingContactsPage,
  listMarketingDeliveriesPage,
  loadMarketingSnapshot,
  revealManualMarketingDeliveryTarget,
  retryMarketingDelivery,
  runMarketingOrchestrator,
  setMarketingGlobalPause,
  suppressMarketingContact,
  syncMarketingClientConsents,
  syncMarketingProspectCatalog,
  upsertMarketingAutomation,
  upsertMarketingRestaurantContact,
} from "@/marketing/marketingClient";
import {
  isPublicMarketingChannel,
  type MarketingAudienceEstimate,
  type MarketingAutomationDraft,
  type MarketingCampaignDraft,
  type MarketingChannelId,
  type MarketingContactListParams,
  type MarketingDeliveryListParams,
  type MarketingRestaurantContactDraft,
  type MarketingSourceSyncBatch,
  type MarketingSourceSyncResume,
} from "@/marketing/types";

export type MarketingActionNotice = {
  tone: "success" | "warning" | "error";
  message: string;
} | null;

function safeActionMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Action refusée par le backend";
  return message.replace(/[\r\n]+/g, " ").slice(0, 180);
}

const SOURCE_SYNC_BATCH_SIZE = 500;
const MAX_SOURCE_SYNC_BATCHES = 20;

type BoundedSourceSyncResult<Resume> = {
  processed: number;
  inserted: number;
  updated: number;
  suppressed: number;
  reconsented: number;
  batches: number;
  complete: boolean;
  resume: Resume | null;
  error: string | null;
};

function emptyBoundedSourceSync<Resume>(): BoundedSourceSyncResult<Resume> {
  return {
    processed: 0,
    inserted: 0,
    updated: 0,
    suppressed: 0,
    reconsented: 0,
    batches: 0,
    complete: false,
    resume: null,
    error: null,
  };
}

function addSyncBatch<Resume>(
  current: BoundedSourceSyncResult<Resume>,
  batch: MarketingSourceSyncBatch,
) {
  return {
    ...current,
    processed: current.processed + batch.processed,
    inserted: current.inserted + batch.inserted,
    updated: current.updated + batch.updated,
    suppressed: current.suppressed + batch.suppressed,
    reconsented: current.reconsented + batch.reconsented,
    batches: current.batches + 1,
  };
}

async function syncProspectCatalogBounded(
  resume: MarketingSourceSyncResume["catalog"],
): Promise<BoundedSourceSyncResult<NonNullable<MarketingSourceSyncResume["catalog"]>>> {
  let progress = emptyBoundedSourceSync<NonNullable<MarketingSourceSyncResume["catalog"]>>();
  let afterSourceObjectId = resume?.afterSourceObjectId || null;
  let untilSourceObjectId = resume?.untilSourceObjectId || null;

  for (let batchIndex = 0; batchIndex < MAX_SOURCE_SYNC_BATCHES; batchIndex += 1) {
    try {
      const batch = await syncMarketingProspectCatalog({
        limit: SOURCE_SYNC_BATCH_SIZE,
        afterSourceObjectId,
        untilSourceObjectId,
      });
      progress = addSyncBatch(progress, batch);
      untilSourceObjectId ||= batch.watermark;
      if (batch.complete) return { ...progress, complete: true, resume: null };
      if (batch.hasMore !== true) throw new Error("État de reprise du catalogue incohérent.");
      if (!batch.nextCursor || !untilSourceObjectId || batch.nextCursor === afterSourceObjectId) {
        throw new Error("Le catalogue n'a pas fourni de curseur de reprise progressif.");
      }
      afterSourceObjectId = batch.nextCursor;
    } catch (error) {
      return {
        ...progress,
        complete: false,
        resume: { afterSourceObjectId, untilSourceObjectId },
        error: safeActionMessage(error),
      };
    }
  }

  return {
    ...progress,
    complete: false,
    resume: { afterSourceObjectId, untilSourceObjectId },
  };
}

async function syncClientConsentsBounded(
  resume: MarketingSourceSyncResume["consents"],
): Promise<BoundedSourceSyncResult<NonNullable<MarketingSourceSyncResume["consents"]>>> {
  let progress = emptyBoundedSourceSync<NonNullable<MarketingSourceSyncResume["consents"]>>();
  let cursor = resume?.cursor || null;

  for (let batchIndex = 0; batchIndex < MAX_SOURCE_SYNC_BATCHES; batchIndex += 1) {
    try {
      const batch = await syncMarketingClientConsents({
        limit: SOURCE_SYNC_BATCH_SIZE,
        cursor,
      });
      progress = addSyncBatch(progress, batch);
      if (batch.complete) return { ...progress, complete: true, resume: null };
      if (batch.hasMore !== true) throw new Error("État de reprise des consentements incohérent.");
      if (!batch.nextCursor || batch.nextCursor === cursor) {
        throw new Error("Les consentements n'ont pas fourni de curseur de reprise progressif.");
      }
      cursor = batch.nextCursor;
    } catch (error) {
      return {
        ...progress,
        complete: false,
        resume: { cursor },
        error: safeActionMessage(error),
      };
    }
  }

  return {
    ...progress,
    complete: false,
    resume: { cursor },
  };
}

export function useMarketingOperations(calendarRange?: { from: string; to: string }) {
  const initialSnapshot = useRef(createFallbackMarketingSnapshot());
  const [snapshot, setSnapshot] = useState(initialSnapshot.current);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<MarketingActionNotice>(null);
  const [contactsRevision, setContactsRevision] = useState(0);
  const [deliveriesRevision, setDeliveriesRevision] = useState(0);
  const [sourceSyncResume, setSourceSyncResume] = useState<MarketingSourceSyncResume>({
    catalog: null,
    consents: null,
    catalogComplete: false,
    consentsComplete: false,
  });

  const snapshotQuery = useQuery({
    queryKey: [
      "admin-marketing-operations-snapshot",
      calendarRange?.from || "default",
      calendarRange?.to || "default",
    ],
    queryFn: () => loadMarketingSnapshot({
      calendarFrom: calendarRange?.from,
      calendarTo: calendarRange?.to,
    }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  useEffect(() => {
    if (snapshotQuery.data) setSnapshot(snapshotQuery.data);
  }, [snapshotQuery.data]);

  const runAction = useCallback(async <T,>(key: string, action: () => Promise<T>) => {
    setPendingAction(key);
    setNotice(null);
    try {
      return await action();
    } catch (error) {
      const message = safeActionMessage(error);
      setNotice({ tone: "error", message });
      return undefined;
    } finally {
      setPendingAction(null);
    }
  }, []);

  const loadContactsPage = useCallback((params: MarketingContactListParams) => (
    listMarketingContactsPage(params)
  ), []);

  const loadDeliveriesPage = useCallback((params: MarketingDeliveryListParams) => (
    listMarketingDeliveriesPage(params)
  ), []);

  const saveCampaign = useCallback(async (draft: MarketingCampaignDraft) => {
    if (snapshot.source === "fallback") {
      setNotice({
        tone: "error",
        message: "Backend indisponible : la campagne n'a pas été enregistrée, même localement.",
      });
      return null;
    }

    return runAction("save-campaign", async () => {
      if (draft.id) {
        throw new Error("La modification d'une campagne existante doit utiliser le flux d'édition avec verrou optimiste.");
      }
      if (!draft.clientRequestId) {
        throw new Error("Identifiant idempotent de création manquant.");
      }
      if (!draft.audienceFilter || typeof draft.audienceFilter.audience_kind !== "string") {
        throw new Error("Définition d'audience invalide : aucun ciblage n'a été exécuté.");
      }
      const audienceFilter = draft.audienceFilter;
      const audienceEstimate = await estimateMarketingAudience(audienceFilter, draft.channels);
      const unavailableChannels = draft.channels.filter((channel) => ![
        "available",
        "manual",
      ].includes(audienceEstimate.availabilityByChannel[channel] || "blocked_configuration"));
      if (unavailableChannels.length) {
        const labels = unavailableChannels.map((channel) => (
          snapshot.channels.find((item) => item.id === channel)?.label || channel
        ));
        throw new Error(`Canal indisponible après revalidation serveur : ${labels.join(", ")}.`);
      }
      const ineligibleIndividualChannels = draft.channels.filter((channel) => (
        !isPublicMarketingChannel(channel)
        && (audienceEstimate.byChannel[channel] ?? 0) <= 0
      ));
      if (ineligibleIndividualChannels.length) {
        const labels = ineligibleIndividualChannels.map((channel) => (
          snapshot.channels.find((item) => item.id === channel)?.label || channel
        ));
        throw new Error(`Aucun contact éligible pour ${labels.join(", ")} : aucun brouillon n'a été créé.`);
      }
      if (!draft.startsAt) {
        throw new Error("Une date souhaitée est requise pour préparer le calendrier.");
      }
      const items = draft.channels.map((channel) => ({
        title: `${draft.name} · ${channel}`,
        channel,
        status: "draft",
        scheduled_at: draft.startsAt,
        timezone: "Europe/Zurich",
        targeting: audienceFilter,
        audience_name: draft.audienceName,
        audience_size: isPublicMarketingChannel(channel)
          ? 0
          : audienceEstimate.byChannel[channel] ?? audienceEstimate.eligible,
        content: { message: draft.message },
        approval_status: "pending",
      }));
      const bundle = await createMarketingCampaignBundle(draft, items, draft.clientRequestId);
      if (bundle.complete !== true) {
        throw new Error("Le backend n'a pas confirmé la transaction complète ; le wizard reste ouvert.");
      }
      await snapshotQuery.refetch();
      setNotice({
        tone: "success",
        message: `Campagne et ${bundle.items.length} élément(s) calendrier enregistrés atomiquement en brouillon${bundle.duplicate ? " (retry idempotent)" : ""}. Aucun envoi n'a démarré.`,
      });
      return bundle;
    });
  }, [runAction, snapshot, snapshotQuery]);

  const recommendChannels = useCallback(async (
    audienceFilter: Record<string, unknown>,
    channels: MarketingChannelId[],
  ): Promise<MarketingAudienceEstimate | undefined> => {
    if (snapshot.source === "fallback") {
      setNotice({ tone: "error", message: "Recommandation impossible sans estimation backend." });
      return undefined;
    }
    return runAction("recommend-channels", () => estimateMarketingAudience(audienceFilter, channels));
  }, [runAction, snapshot.source]);

  const approveCampaign = useCallback(async (campaignId: string, reason: string) => {
    if (snapshot.source === "fallback") {
      setNotice({ tone: "error", message: "Approbation impossible sans backend." });
      return false;
    }
    return runAction(`approve-campaign-${campaignId}`, async () => {
      const result = await approveMarketingCampaign(campaignId, reason);
      const approvedAt = typeof result.approved_at === "string" ? result.approved_at : new Date().toISOString();
      setSnapshot((current) => ({
        ...current,
        campaigns: current.campaigns.map((campaign) => campaign.id === campaignId
          ? {
              ...campaign,
              status: typeof result.status === "string"
                ? result.status as typeof campaign.status
                : campaign.status,
              approvedAt,
              updatedAt: typeof result.updated_at === "string" ? result.updated_at : campaign.updatedAt,
            }
          : campaign),
      }));
      setNotice({ tone: "success", message: "Campagne approuvée. Ses éléments restent à approuver et planifier individuellement." });
      return true;
    });
  }, [runAction, snapshot.source]);

  const approveItem = useCallback(async (itemId: string, scheduledAt: string) => {
    if (snapshot.source === "fallback") {
      setNotice({ tone: "error", message: "Planification impossible sans backend." });
      return false;
    }
    return runAction(`approve-item-${itemId}`, async () => {
      const result = await approveMarketingItem(itemId, scheduledAt);
      setSnapshot((current) => ({
        ...current,
        calendar: current.calendar.map((item) => item.id === itemId
          ? {
              ...item,
              status: "scheduled",
              approvalStatus: "approved",
              scheduledAt: typeof result.scheduled_at === "string" ? result.scheduled_at : scheduledAt,
              updatedAt: typeof result.updated_at === "string" ? result.updated_at : item.updatedAt,
            }
          : item),
      }));
      setNotice({ tone: "success", message: "Élément approuvé et planifié. Aucun envoi immédiat n'a été lancé." });
      return true;
    });
  }, [runAction, snapshot.source]);

  const toggleGlobalPause = useCallback(async (paused: boolean, reason: string) => {
    if (snapshot.source === "fallback") {
      setNotice({
        tone: "error",
        message: "Pause globale indisponible hors backend : aucun état serveur n'a été modifié.",
      });
      return false;
    }

    return runAction("global-pause", async () => {
      await setMarketingGlobalPause(paused, reason);
      setSnapshot((current) => ({
        ...current,
        overview: {
          ...current.overview,
          globalPaused: paused,
          globalPauseReason: paused ? reason : null,
          updatedAt: new Date().toISOString(),
        },
      }));
      setNotice({
        tone: paused ? "warning" : "success",
        message: paused
          ? "Pause globale activée : l'orchestrateur refusera les nouveaux traitements."
          : "Pause globale levée. Les éléments approuvés pourront reprendre selon leur calendrier.",
      });
      return true;
    });
  }, [runAction, snapshot.source]);

  const saveAutomation = useCallback(async (draft: MarketingAutomationDraft) => {
    if (snapshot.source === "fallback") {
      setNotice({ tone: "error", message: "Backend indisponible : l'automatisation n'a pas été enregistrée." });
      return null;
    }
    return runAction("save-automation", async () => {
      const current = snapshot.automations.find((item) => item.id === draft.id);
      const automation = await upsertMarketingAutomation(draft, current?.updatedAt);
      setSnapshot((value) => ({
        ...value,
        automations: [automation, ...value.automations.filter((item) => item.id !== automation.id)],
      }));
      setNotice({ tone: "success", message: "Automatisation enregistrée en pause, prête pour validation." });
      return automation;
    });
  }, [runAction, snapshot]);

  const syncSources = useCallback(async () => {
    if (snapshot.source === "fallback") {
      setNotice({ tone: "error", message: "Synchronisation impossible sans backend marketing." });
      return null;
    }
    return runAction("sync-sources", async () => {
      const [catalogResult, consentsResult] = await Promise.all([
        sourceSyncResume.catalogComplete
          ? Promise.resolve({
              ...emptyBoundedSourceSync<NonNullable<MarketingSourceSyncResume["catalog"]>>(),
              complete: true,
            })
          : syncProspectCatalogBounded(sourceSyncResume.catalog),
        sourceSyncResume.consentsComplete
          ? Promise.resolve({
              ...emptyBoundedSourceSync<NonNullable<MarketingSourceSyncResume["consents"]>>(),
              complete: true,
            })
          : syncClientConsentsBounded(sourceSyncResume.consents),
      ]);
      setContactsRevision((current) => current + 1);
      await snapshotQuery.refetch();
      const complete = catalogResult.complete && consentsResult.complete;
      setSourceSyncResume(complete ? {
        catalog: null,
        consents: null,
        catalogComplete: false,
        consentsComplete: false,
      } : {
        catalog: catalogResult.resume,
        consents: consentsResult.resume,
        catalogComplete: catalogResult.complete,
        consentsComplete: consentsResult.complete,
      });

      const processed = catalogResult.processed + consentsResult.processed;
      if (processed === 0 && catalogResult.error && consentsResult.error) {
        throw new Error(`Aucune source synchronisée : ${catalogResult.error}. Relancez l'action pour réessayer.`);
      }

      const catalogInserted = catalogResult.inserted;
      const clientsInserted = consentsResult.inserted;
      const clientsUpdated = consentsResult.updated;
      const suppressed = consentsResult.suppressed;
      const reconsented = consentsResult.reconsented;
      const batches = catalogResult.batches + consentsResult.batches;
      setNotice({
        tone: complete ? "success" : "warning",
        message: `${complete ? "Sources synchronisées" : "Synchronisation bornée ou interrompue"} en ${batches} lot(s) : ${catalogInserted} prospect(s) ajouté(s), ${clientsInserted} client(s) ajouté(s), ${clientsUpdated} client(s) mis à jour, ${suppressed} opposition(s) et ${reconsented} réactivation(s) appliquée(s). ${complete ? "Le cycle est terminé." : "Relancez Synchroniser les sources pour reprendre depuis le dernier curseur confirmé."} Aucune donnée personnelle brute n'est retournée.`,
      });
      return { complete, batches, catalogInserted, clientsInserted, clientsUpdated, suppressed, reconsented };
    });
  }, [runAction, snapshot.source, snapshotQuery, sourceSyncResume]);

  const retryDelivery = useCallback(async (deliveryId: string) => {
    if (snapshot.source === "fallback") {
      setNotice({ tone: "error", message: "Nouvelle tentative impossible tant que le backend marketing est indisponible." });
      return false;
    }
    return runAction(`retry-${deliveryId}`, async () => {
      await retryMarketingDelivery(deliveryId);
      setNotice({ tone: "success", message: "Nouvelle tentative mise en file de façon idempotente." });
      setDeliveriesRevision((current) => current + 1);
      await snapshotQuery.refetch();
      return true;
    });
  }, [runAction, snapshot.source, snapshotQuery]);

  const qualifyRestaurantContact = useCallback(async (draft: MarketingRestaurantContactDraft) => {
    if (snapshot.source === "fallback") {
      setNotice({ tone: "error", message: "Qualification impossible sans backend marketing." });
      return null;
    }
    return runAction(`qualify-contact-${draft.id || "new"}`, async () => {
      const contact = await upsertMarketingRestaurantContact(draft);
      setContactsRevision((current) => current + 1);
      await snapshotQuery.refetch();
      setNotice({
        tone: "success",
        message: "Restaurant qualifié et preuve juridique journalisée. Aucun envoi n'a été déclenché.",
      });
      return contact;
    });
  }, [runAction, snapshot.source, snapshotQuery]);

  const suppressContact = useCallback(async (contactId: string, reason: string) => {
    if (snapshot.source === "fallback") {
      setNotice({ tone: "error", message: "Opposition impossible sans backend marketing." });
      return false;
    }
    return runAction(`suppress-contact-${contactId}`, async () => {
      await suppressMarketingContact(contactId, reason);
      setContactsRevision((current) => current + 1);
      await snapshotQuery.refetch();
      setNotice({
        tone: "warning",
        message: "Opposition enregistrée : les tâches encore en attente ont été annulées.",
      });
      return true;
    });
  }, [runAction, snapshot.source, snapshotQuery]);

  const revealManualTarget = useCallback(async (deliveryId: string, reason: string) => {
    if (snapshot.source === "fallback") {
      setNotice({ tone: "error", message: "Révélation impossible sans backend marketing." });
      return undefined;
    }
    return runAction(`reveal-manual-${deliveryId}`, () => (
      revealManualMarketingDeliveryTarget(deliveryId, reason)
    ));
  }, [runAction, snapshot.source]);

  const completeManualDelivery = useCallback(async (
    deliveryId: string,
    outcome: "completed" | "failed",
    note: string,
  ) => {
    if (snapshot.source === "fallback") {
      setNotice({ tone: "error", message: "Clôture manuelle impossible sans backend marketing." });
      return false;
    }
    return runAction(`complete-manual-${deliveryId}`, async () => {
      const result = await completeManualMarketingDelivery(deliveryId, outcome, note);
      const status = typeof result.status === "string"
        ? result.status as "sent" | "failed"
        : outcome === "completed" ? "sent" : "failed";
      const now = new Date().toISOString();
      setSnapshot((current) => ({
        ...current,
        deliveries: current.deliveries.map((delivery) => delivery.id === deliveryId
          ? {
              ...delivery,
              status,
              sentAt: status === "sent" ? delivery.sentAt || now : delivery.sentAt,
              manualOutcome: outcome,
              manualNote: note.slice(0, 2_000),
              updatedAt: typeof result.updated_at === "string" ? result.updated_at : now,
            }
          : delivery),
      }));
      setNotice({
        tone: outcome === "completed" ? "success" : "warning",
        message: outcome === "completed"
          ? "Action terrain marquée effectuée et journalisée."
          : "Action terrain marquée en échec avec sa note de suivi.",
      });
      setDeliveriesRevision((current) => current + 1);
      await snapshotQuery.refetch();
      return true;
    });
  }, [runAction, snapshot.source, snapshotQuery]);

  const cancelItem = useCallback(async (itemId: string, reason: string) => {
    if (snapshot.source === "fallback") {
      setNotice({ tone: "error", message: "Annulation impossible tant que le backend marketing est indisponible." });
      return false;
    }
    return runAction(`cancel-${itemId}`, async () => {
      await cancelMarketingItem(itemId, reason);
      setSnapshot((current) => ({
        ...current,
        calendar: current.calendar.map((item) => item.id === itemId ? { ...item, status: "cancelled" } : item),
      }));
      setNotice({ tone: "success", message: "Élément annulé et décision journalisée." });
      return true;
    });
  }, [runAction, snapshot.source]);

  const completeManualItem = useCallback(async (
    itemId: string,
    outcome: "published" | "failed",
    note: string,
  ) => {
    if (snapshot.source === "fallback") {
      setNotice({ tone: "error", message: "Clôture de publication impossible sans backend marketing." });
      return false;
    }
    return runAction(`complete-manual-item-${itemId}`, async () => {
      const result = await completeManualMarketingItem(itemId, outcome, note);
      const status = typeof result.status === "string"
        ? result.status as "published" | "failed"
        : outcome;
      const now = new Date().toISOString();
      setSnapshot((current) => ({
        ...current,
        calendar: current.calendar.map((item) => item.id === itemId
          ? {
              ...item,
              status,
              manualOutcome: outcome,
              manualNote: note.slice(0, 2_000),
              publishedAt: outcome === "published"
                ? typeof result.published_at === "string" ? result.published_at : now
                : item.publishedAt,
              updatedAt: typeof result.updated_at === "string" ? result.updated_at : now,
            }
          : item),
      }));
      setNotice({
        tone: outcome === "published" ? "success" : "warning",
        message: outcome === "published"
          ? "Publication manuelle marquée publiée et journalisée."
          : "Publication manuelle marquée en échec avec sa note de suivi.",
      });
      await snapshotQuery.refetch();
      return true;
    });
  }, [runAction, snapshot.source, snapshotQuery]);

  const runDue = useCallback(async () => {
    if (snapshot.source === "fallback") {
      setNotice({ tone: "error", message: "Orchestrateur indisponible tant que le backend marketing est hors ligne." });
      return false;
    }
    if (snapshot.overview.globalPaused) {
      setNotice({ tone: "error", message: "La pause globale interdit l'exécution." });
      return false;
    }
    if (!snapshot.overview.schedulerReady) {
      setNotice({ tone: "error", message: "Planificateur indisponible : le backend n'a confirmé aucun moteur d'exécution prêt." });
      return false;
    }
    return runAction("run-due", async () => {
      await runMarketingOrchestrator("run_due", undefined, 25);
      setNotice({ tone: "success", message: "Traitement des éléments dus lancé, dans la limite de 25." });
      setDeliveriesRevision((current) => current + 1);
      await snapshotQuery.refetch();
      return true;
    });
  }, [runAction, snapshot.overview.globalPaused, snapshot.overview.schedulerReady, snapshot.source, snapshotQuery]);

  const refresh = useCallback(async () => {
    const result = await snapshotQuery.refetch();
    setContactsRevision((current) => current + 1);
    setDeliveriesRevision((current) => current + 1);
    return result;
  }, [snapshotQuery]);

  return {
    snapshot,
    loading: snapshotQuery.isLoading,
    refreshing: snapshotQuery.isFetching,
    pendingAction,
    notice,
    clearNotice: () => setNotice(null),
    refresh,
    loadContactsPage,
    loadDeliveriesPage,
    contactsRevision,
    deliveriesRevision,
    saveCampaign,
    recommendChannels,
    approveCampaign,
    approveItem,
    toggleGlobalPause,
    saveAutomation,
    syncSources,
    qualifyRestaurantContact,
    suppressContact,
    retryDelivery,
    revealManualTarget,
    completeManualDelivery,
    cancelItem,
    completeManualItem,
    runDue,
    canMutateBackend: snapshot.source !== "fallback",
  };
}
