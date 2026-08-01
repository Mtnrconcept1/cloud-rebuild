import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

import MarketingWorkspaceChrome from "@/components/marketing/MarketingWorkspaceChrome";
import MarketingActivityView from "@/components/marketing/views/MarketingActivityView";
import MarketingAudiencesView from "@/components/marketing/views/MarketingAudiencesView";
import MarketingAutomationsView from "@/components/marketing/views/MarketingAutomationsView";
import MarketingCalendarView from "@/components/marketing/views/MarketingCalendarView";
import MarketingCampaignsView from "@/components/marketing/views/MarketingCampaignsView";
import MarketingIntegrationsView from "@/components/marketing/views/MarketingIntegrationsView";
import MarketingOverviewView from "@/components/marketing/views/MarketingOverviewView";
import MarketingResultsView from "@/components/marketing/views/MarketingResultsView";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useMarketingOperations } from "@/marketing/useMarketingOperations";
import { useMarketingUrlState } from "@/marketing/useMarketingUrlState";
import { currentMarketingMonthRange } from "@/marketing/zurichTime";

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
  const { state: filters, update: updateFilters, setView } = useMarketingUrlState();
  const defaultCalendarRange = currentMarketingMonthRange();
  const operations = useMarketingOperations(filters.view === "calendar"
    ? {
        from: filters.from || defaultCalendarRange.from,
        to: filters.to || defaultCalendarRange.to,
      }
    : undefined);
  const noticeIcon = operations.notice?.tone === "success" ? CheckCircle2 : operations.notice?.tone === "error" ? AlertCircle : Info;
  const NoticeIcon = noticeIcon;

  const content = operations.loading ? <LoadingWorkspace /> : (() => {
    switch (filters.view) {
      case "calendar":
        return <MarketingCalendarView snapshot={operations.snapshot} filters={filters} canMutateBackend={operations.canMutateBackend} pendingAction={operations.pendingAction} onFiltersChange={updateFilters} onCancel={operations.cancelItem} onApprove={operations.approveItem} onCompleteManual={operations.completeManualItem} />;
      case "campaigns":
        return <MarketingCampaignsView snapshot={operations.snapshot} filters={filters} canMutateBackend={operations.canMutateBackend} savePending={operations.pendingAction === "save-campaign"} pendingAction={operations.pendingAction} onFiltersChange={updateFilters} onSave={operations.saveCampaign} onApprove={operations.approveCampaign} onRecommendChannels={operations.recommendChannels} />;
      case "audiences":
        return <MarketingAudiencesView snapshot={operations.snapshot} filters={filters} canMutateBackend={operations.canMutateBackend} pendingAction={operations.pendingAction} onFiltersChange={updateFilters} onNavigate={setView} onSyncSources={operations.syncSources} />;
      case "automations":
        return <MarketingAutomationsView snapshot={operations.snapshot} canMutateBackend={operations.canMutateBackend} pendingAction={operations.pendingAction} onSave={operations.saveAutomation} />;
      case "activity":
        return <MarketingActivityView snapshot={operations.snapshot} filters={filters} canMutateBackend={operations.canMutateBackend} pendingAction={operations.pendingAction} onFiltersChange={updateFilters} onRetry={operations.retryDelivery} onCompleteManual={operations.completeManualDelivery} />;
      case "results":
        return <MarketingResultsView snapshot={operations.snapshot} filters={filters} onFiltersChange={updateFilters} />;
      case "integrations":
        return <MarketingIntegrationsView snapshot={operations.snapshot} filters={filters} onFiltersChange={updateFilters} />;
      case "overview":
      default:
        return <MarketingOverviewView snapshot={operations.snapshot} canMutateBackend={operations.canMutateBackend} runPending={operations.pendingAction === "run-due"} onRunDue={operations.runDue} onNavigate={setView} />;
    }
  })();

  return (
    <MarketingWorkspaceChrome
      activeView={filters.view}
      snapshot={operations.snapshot}
      canMutateBackend={operations.canMutateBackend}
      refreshing={operations.refreshing}
      pausePending={operations.pendingAction === "global-pause"}
      onViewChange={setView}
      onRefresh={() => { void operations.refresh(); }}
      onTogglePause={operations.toggleGlobalPause}
    >
      {operations.notice ? (
        <Alert className={cn("mb-5 pr-12", operations.notice.tone === "success" && "border-emerald-500/25 bg-emerald-500/5", operations.notice.tone === "warning" && "border-amber-500/25 bg-amber-500/5")} variant={operations.notice.tone === "error" ? "destructive" : "default"}>
          <NoticeIcon className="h-4 w-4" />
          <AlertTitle>{operations.notice.tone === "success" ? "Action confirmée" : operations.notice.tone === "warning" ? "Attention" : "Action impossible"}</AlertTitle>
          <AlertDescription>{operations.notice.message}</AlertDescription>
          <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1 h-9 w-9" onClick={operations.clearNotice} aria-label="Fermer le message"><X className="h-4 w-4" /></Button>
        </Alert>
      ) : null}
      {content}
    </MarketingWorkspaceChrome>
  );
}
