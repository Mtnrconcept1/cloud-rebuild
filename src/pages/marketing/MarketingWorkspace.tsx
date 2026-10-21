import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import MarketingWorkspaceChrome from "@/components/marketing/MarketingWorkspaceChrome";
import MarketingActivityView from "@/components/marketing/views/MarketingActivityView";
import MarketingAgentView from "@/components/marketing/views/MarketingAgentView";
import MarketingFaqView from "@/components/marketing/views/MarketingFaqView";
import MarketingAudiencesView from "@/components/marketing/views/MarketingAudiencesView";
import MarketingAutomationsView from "@/components/marketing/views/MarketingAutomationsView";
import MarketingCalendarView from "@/components/marketing/views/MarketingCalendarView";
import MarketingCampaignsView from "@/components/marketing/views/MarketingCampaignsView";
import MarketingIntegrationsView from "@/components/marketing/views/MarketingIntegrationsView";
import MarketingGovernanceView from "@/components/marketing/views/MarketingGovernanceView";
import MarketingOverviewView from "@/components/marketing/views/MarketingOverviewView";
import MarketingOutreachView from "@/components/marketing/views/MarketingOutreachView";
import MarketingInstagramView from "@/components/marketing/views/MarketingInstagramView";
import MarketingResultsView from "@/components/marketing/views/MarketingResultsView";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { useMarketingAutopilot } from "@/marketing/useMarketingAutopilot";
import { useMarketingOperations } from "@/marketing/useMarketingOperations";
import { loadMarketingReviewContext } from "@/marketing/marketingClient";
import { useMarketingUrlState, type MarketingNavigate, type MarketingUrlState } from "@/marketing/useMarketingUrlState";
import { currentMarketingMonthRange } from "@/marketing/zurichTime";
import type { MarketingView } from "@/marketing/types";

const VIEW_TITLES: Record<MarketingView, string> = {
  overview: "Vue d’ensemble",
  agent: "Studio IA",
  calendar: "Calendrier",
  campaigns: "Campagnes",
  audiences: "CRM et audiences",
  automations: "Automatisations",
  activity: "Distribution",
  results: "Analytics",
  integrations: "Intégrations",
  governance: "Gouvernance",
  outreach: "Prospection et backlinks",
  instagram: "Veille Instagram",
  faq: "Mode d’emploi",
};

function LoadingWorkspace() {
  return (
    <div className="space-y-5" role="status" aria-live="polite">
      <span className="sr-only">Chargement du centre marketing</span>
      <Skeleton className="h-48 w-full rounded-3xl" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-32 rounded-2xl" />)}</div>
      <Skeleton className="h-80 w-full rounded-2xl" />
    </div>
  );
}

export default function MarketingWorkspace() {
  const { state: urlFilters, update: updateUrlFilters, setView: setUrlView } = useMarketingUrlState();
  const [uploadPending, setUploadPending] = useState(false);
  const [uploadFilters, setUploadFilters] = useState<MarketingUrlState | null>(null);
  // Browser back/forward changes searchParams without using the chrome's
  // callbacks. Keep the current editor mounted until its upload completes.
  const filters = uploadPending && uploadFilters ? uploadFilters : urlFilters;
  useSeoMeta({
    title: `${VIEW_TITLES[filters.view]} · Marketing TOK`,
    description: "Gérez vos campagnes, leurs approbations et leur calendrier dans l’espace marketing TOK sécurisé.",
    path: "/marketing",
    robots: "noindex,nofollow,noarchive",
  });
  const uploadPendingRef = useRef(false);
  const onUploadPendingChange = useCallback((pending: boolean) => {
    uploadPendingRef.current = pending;
    setUploadFilters(pending ? urlFilters : null);
    setUploadPending(pending);
  }, [urlFilters]);
  const setView = useCallback<MarketingNavigate>((view, target) => {
    if (!uploadPendingRef.current) {
      if (target) setUrlView(view, target);
      else setUrlView(view);
    }
  }, [setUrlView]);
  const updateFilters = useCallback((patch: Partial<MarketingUrlState>) => {
    if (!uploadPendingRef.current) updateUrlFilters(patch);
  }, [updateUrlFilters]);
  useEffect(() => {
    if (!uploadPending) return;
    const preventLeavingDuringUpload = (event: BeforeUnloadEvent) => {
      if (!uploadPendingRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", preventLeavingDuringUpload);
    return () => { window.removeEventListener("beforeunload", preventLeavingDuringUpload); };
  }, [uploadPending]);
  const autopilotEnabled = ["automations", "integrations", "results", "governance"].includes(filters.view);
  const autopilot = useMarketingAutopilot({
    enabled: autopilotEnabled,
    from: filters.view === "results" ? filters.from : undefined,
    to: filters.view === "results" ? filters.to : undefined,
  });
  const defaultCalendarRange = currentMarketingMonthRange();
  const operations = useMarketingOperations(filters.view === "calendar"
    ? {
        from: filters.from || defaultCalendarRange.from,
        to: filters.to || defaultCalendarRange.to,
      }
    : undefined);
  const reviewRequested = (filters.view === "calendar" || filters.view === "campaigns")
    && Boolean(filters.campaignId || filters.itemId);
  const snapshotSelectedItem = operations.snapshot.calendar.find((item) => item.id === filters.itemId);
  const invalidReviewSelection = reviewRequested && Boolean(filters.campaignId && snapshotSelectedItem
    && snapshotSelectedItem.campaignId !== filters.campaignId);
  const campaignMissing = Boolean(filters.campaignId && !operations.snapshot.campaigns.some((campaign) => campaign.id === filters.campaignId));
  const itemMissing = Boolean(filters.itemId && !operations.snapshot.calendar.some((item) => item.id === filters.itemId));
  const reviewContext = useQuery({
    queryKey: ["admin-marketing-review-context", filters.campaignId || "", filters.itemId || ""],
    queryFn: () => loadMarketingReviewContext({ campaignId: filters.campaignId, itemId: filters.itemId }),
    enabled: reviewRequested && !invalidReviewSelection && !operations.loading && (campaignMissing || itemMissing),
    staleTime: 0,
    retry: false,
  });
  // The shared snapshot is authoritative after every mutation. A detail read
  // only fills rows outside the bounded calendar/campaign sample.
  const snapshot = useMemo(() => {
    const campaign = reviewRequested ? reviewContext.data?.campaign : null;
    const item = reviewRequested ? reviewContext.data?.item : null;
    return {
      ...operations.snapshot,
      campaigns: campaign && campaign.id === filters.campaignId && !operations.snapshot.campaigns.some((row) => row.id === campaign.id)
        ? [...operations.snapshot.campaigns, campaign]
        : operations.snapshot.campaigns,
      calendar: item && item.id === filters.itemId && (!filters.campaignId || item.campaignId === filters.campaignId)
        && !operations.snapshot.calendar.some((row) => row.id === item.id)
        ? [...operations.snapshot.calendar, item]
        : operations.snapshot.calendar,
    };
  }, [operations.snapshot, reviewContext.data, reviewRequested, filters.campaignId, filters.itemId]);
  const reviewStillMissing = reviewRequested && (invalidReviewSelection
    ||
    Boolean(filters.campaignId && !snapshot.campaigns.some((campaign) => campaign.id === filters.campaignId))
    || Boolean(filters.itemId && !snapshot.calendar.some((item) => item.id === filters.itemId))
  );
  const reviewNeedsContext = reviewRequested && (campaignMissing || itemMissing);
  const reviewLoading = reviewNeedsContext && !invalidReviewSelection && (operations.loading || reviewContext.isPending || reviewContext.isFetching);
  const reviewUnavailable = invalidReviewSelection || (reviewNeedsContext && !reviewLoading && (reviewContext.isError || reviewStillMissing));
  const reviewError = reviewUnavailable
    ? invalidReviewSelection
      ? "Le lien de sélection ne correspond pas à cette campagne. Ouvrez la publication depuis sa campagne."
      : "Cette campagne ou cette publication n’a pas pu être confirmée. Actualisez les données avant de l’approuver."
    : null;
  const canMutateReview = operations.canMutateBackend && !reviewLoading && !reviewUnavailable;
  const noticeIcon = operations.notice?.tone === "success" ? CheckCircle2 : operations.notice?.tone === "error" ? AlertCircle : Info;
  const NoticeIcon = noticeIcon;

  const content = operations.loading ? <LoadingWorkspace /> : (() => {
    switch (filters.view) {
      case "faq":
        return <MarketingFaqView />;
      case "agent":
        return <MarketingAgentView snapshot={snapshot} canMutateBackend={operations.canMutateBackend} onNavigate={setView} onGenerated={operations.refresh} onUploadPendingChange={onUploadPendingChange} />;
      case "calendar":
        return <MarketingCalendarView snapshot={snapshot} filters={filters} canMutateBackend={canMutateReview} reviewPending={reviewLoading} reviewError={reviewError} pendingAction={operations.pendingAction} onFiltersChange={updateFilters} onNavigate={setView} onCancel={operations.cancelItem} onApprove={operations.approveItem} onCompleteManual={operations.completeManualItem} />;
      case "campaigns":
        return <MarketingCampaignsView snapshot={snapshot} filters={filters} canMutateBackend={canMutateReview} reviewPending={reviewLoading} reviewError={reviewError} savePending={operations.pendingAction === "save-campaign"} pendingAction={operations.pendingAction} onFiltersChange={updateFilters} onSave={operations.saveCampaign} onApprove={operations.approveCampaign} onRecommendChannels={operations.recommendChannels} onItemsUpdated={operations.refresh} onNavigate={setView} onUploadPendingChange={onUploadPendingChange} />;
      case "audiences":
        return <MarketingAudiencesView snapshot={operations.snapshot} filters={filters} canMutateBackend={operations.canMutateBackend} pendingAction={operations.pendingAction} onFiltersChange={updateFilters} onNavigate={setView} onSyncSources={operations.syncSources} onLoadContactsPage={operations.loadContactsPage} contactsRevision={operations.contactsRevision} onQualifyContact={operations.qualifyRestaurantContact} onSuppressContact={operations.suppressContact} />;
      case "automations":
        return <MarketingAutomationsView snapshot={operations.snapshot} canMutateBackend={operations.canMutateBackend} pendingAction={operations.pendingAction} autopilot={autopilot.dashboard} autopilotLoading={autopilot.loading} autopilotError={autopilot.error} autopilotPendingAction={autopilot.pendingAction} simulation={autopilot.simulation} onRefreshAutopilot={() => { void autopilot.refresh(); }} onSimulate={autopilot.simulate} onPrepareDraft={autopilot.prepareDraft} onClearSimulation={autopilot.clearSimulation} onSave={operations.saveAutomation} onNavigate={setView} />;
      case "activity":
        return <MarketingActivityView snapshot={operations.snapshot} filters={filters} canMutateBackend={operations.canMutateBackend} pendingAction={operations.pendingAction} onFiltersChange={updateFilters} onLoadDeliveriesPage={operations.loadDeliveriesPage} deliveriesRevision={operations.deliveriesRevision} onRetry={operations.retryDelivery} onRevealManualTarget={operations.revealManualTarget} onCompleteManual={operations.completeManualDelivery} />;
      case "results":
        return <MarketingResultsView snapshot={operations.snapshot} filters={filters} autopilot={autopilot.dashboard} autopilotLoading={autopilot.loading || autopilot.refreshing} autopilotError={autopilot.error} onFiltersChange={updateFilters} onRefreshAutopilot={() => { void autopilot.refresh(); }} />;
      case "integrations":
        return <MarketingIntegrationsView snapshot={operations.snapshot} filters={filters} autopilot={autopilot.dashboard} autopilotLoading={autopilot.loading} autopilotError={autopilot.error} autopilotPendingAction={autopilot.pendingAction} onFiltersChange={updateFilters} onRefreshAutopilot={() => { void autopilot.refresh(); }} onSaveProviderControl={autopilot.saveProviderControl} />;
      case "governance":
        return <MarketingGovernanceView autopilot={autopilot.dashboard} loading={autopilot.loading} error={autopilot.error} refreshing={autopilot.refreshing} onRefresh={() => { void autopilot.refresh(); }} onNavigate={setView} />;
      case "outreach":
        return <MarketingOutreachView canMutateBackend={operations.canMutateBackend} />;
      case "instagram":
        return <MarketingInstagramView canMutateBackend={operations.canMutateBackend} />;
      case "overview":
      default:
        return <MarketingOverviewView snapshot={snapshot} canMutateBackend={operations.canMutateBackend} runPending={operations.pendingAction === "run-due"} onRunDue={operations.runDue} onNavigate={setView} />;
    }
  })();

  return (
    <MarketingWorkspaceChrome
      activeView={filters.view}
      snapshot={snapshot}
      canMutateBackend={operations.canMutateBackend}
      refreshing={operations.refreshing}
      pausePending={operations.pendingAction === "global-pause"}
      navigationLocked={uploadPending}
      onViewChange={setView}
      onRefresh={() => { if (!uploadPendingRef.current) void operations.refresh(); }}
      onTogglePause={operations.toggleGlobalPause}
    >
      {uploadPending ? <p role="status" className="mb-4 rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900">Import de l’image en cours. Patientez avant de quitter cet écran.</p> : null}
      {reviewLoading ? <p role="status" className="mb-4 rounded-xl border bg-background p-3 text-sm">Chargement de la campagne et de la publication sélectionnées…</p> : null}
      {reviewUnavailable ? <Alert variant="destructive" className="mb-4"><AlertCircle className="h-4 w-4" /><AlertTitle>Élément sélectionné indisponible</AlertTitle><AlertDescription>{reviewError}{!invalidReviewSelection ? <Button type="button" variant="outline" size="sm" className="ml-3 mt-2" onClick={() => { void reviewContext.refetch(); }}>Réessayer</Button> : null}</AlertDescription></Alert> : null}
      {operations.notice ? (
        <Alert className={cn("mb-5 pr-12", operations.notice.tone === "success" && "border-emerald-500/25 bg-emerald-500/5", operations.notice.tone === "warning" && "border-amber-500/25 bg-amber-500/5")} variant={operations.notice.tone === "error" ? "destructive" : "default"}>
          <NoticeIcon className="h-4 w-4" />
          <AlertTitle>{operations.notice.tone === "success" ? "Action confirmée" : operations.notice.tone === "warning" ? "Attention" : "Action impossible"}</AlertTitle>
          <AlertDescription>{operations.notice.message}</AlertDescription>
          <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1 h-9 w-9" onClick={operations.clearNotice} aria-label="Fermer le message"><X className="h-4 w-4" /></Button>
        </Alert>
      ) : null}
      {autopilot.notice ? (
        <Alert className={cn("mb-5 pr-12", autopilot.notice.tone === "success" && "border-emerald-500/25 bg-emerald-500/5", autopilot.notice.tone === "warning" && "border-amber-500/25 bg-amber-500/5")} variant={autopilot.notice.tone === "error" ? "destructive" : "default"}>
          {autopilot.notice.tone === "success" ? <CheckCircle2 className="h-4 w-4" /> : autopilot.notice.tone === "error" ? <AlertCircle className="h-4 w-4" /> : <Info className="h-4 w-4" />}
          <AlertTitle>{autopilot.notice.tone === "success" ? "Cockpit mis à jour" : autopilot.notice.tone === "warning" ? "Contrôle requis" : "Action Autopilot impossible"}</AlertTitle>
          <AlertDescription>{autopilot.notice.message}</AlertDescription>
          <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1 h-9 w-9" onClick={autopilot.clearNotice} aria-label="Fermer le message Autopilot"><X className="h-4 w-4" /></Button>
        </Alert>
      ) : null}
      {content}
    </MarketingWorkspaceChrome>
  );
}
