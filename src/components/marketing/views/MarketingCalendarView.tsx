import { useEffect, useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { AlertCircle, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Search, XCircle } from "lucide-react";

import {
  MarketingChannelBadge,
  MarketingEmptyState,
  MarketingPagination,
  MarketingStatusBadge,
  formatMarketingDate,
} from "@/components/marketing/MarketingShared";
import { MarketingPostImage, MarketingPostPreview } from "@/components/marketing/MarketingPostPreview";
import SortControls from "@/components/list/SortControls";
import OperationViewToggle, { type OperationViewMode } from "@/components/operations/OperationViewToggle";
import { MarketingContentReview } from "@/components/marketing/MarketingContentReview";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { SortDirection } from "@/lib/listSorting";
import { isMarketingMailingReady } from "@/marketing/postPreview";
import {
  isPublicMarketingChannel,
  type MarketingCalendarItem,
  type MarketingChannelId,
  type MarketingSnapshot,
} from "@/marketing/types";
import type { MarketingNavigate, MarketingUrlState } from "@/marketing/useMarketingUrlState";
import {
  currentMarketingMonthRange,
  marketingMonthRange,
  marketingZurichDateKey,
  marketingZurichDateTimeInput,
  marketingZurichLocalDateTimeToIso,
} from "@/marketing/zurichTime";

const WEEK_DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const PAGE_SIZE = 8;

const CALENDAR_STATUS_STYLES = {
  approved: {
    label: "Approuvé",
    className: "border-emerald-400/60 bg-emerald-50 text-emerald-900 hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-emerald-950/40 dark:text-emerald-100",
  },
  draft: {
    label: "Brouillon",
    className: "border-slate-300 bg-slate-50 text-slate-800 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-100",
  },
  scheduled: {
    label: "Planifié",
    className: "border-sky-400/60 bg-sky-50 text-sky-900 hover:bg-sky-100 dark:border-sky-500/40 dark:bg-sky-950/40 dark:text-sky-100",
  },
  running: {
    label: "En cours",
    className: "border-violet-400/60 bg-violet-50 text-violet-900 hover:bg-violet-100 dark:border-violet-500/40 dark:bg-violet-950/40 dark:text-violet-100",
  },
  published: {
    label: "Publié",
    className: "border-teal-400/60 bg-teal-50 text-teal-900 hover:bg-teal-100 dark:border-teal-500/40 dark:bg-teal-950/40 dark:text-teal-100",
  },
  completed: {
    label: "Terminé",
    className: "border-green-400/60 bg-green-50 text-green-900 hover:bg-green-100 dark:border-green-500/40 dark:bg-green-950/40 dark:text-green-100",
  },
  failed: {
    label: "Échec",
    className: "border-rose-400/60 bg-rose-50 text-rose-900 hover:bg-rose-100 dark:border-rose-500/40 dark:bg-rose-950/40 dark:text-rose-100",
  },
  cancelled: {
    label: "Annulé",
    className: "border-zinc-400/60 bg-zinc-100 text-zinc-800 hover:bg-zinc-200 dark:border-zinc-600 dark:bg-zinc-900/70 dark:text-zinc-100",
  },
  blocked_configuration: {
    label: "Bloqué",
    className: "border-amber-400/60 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-100",
  },
} as const;

type CalendarVisualStatus = keyof typeof CALENDAR_STATUS_STYLES;

const CALENDAR_LEGEND_STATUSES: CalendarVisualStatus[] = [
  "approved",
  "draft",
  "scheduled",
  "running",
  "published",
  "completed",
  "failed",
  "cancelled",
  "blocked_configuration",
];

function getCalendarVisualStatus(item: MarketingCalendarItem): CalendarVisualStatus {
  if (item.status === "draft" && item.approvalStatus === "approved") return "approved";
  return item.status;
}

function CalendarStatusBadge({ item }: { item: MarketingCalendarItem }) {
  const style = CALENDAR_STATUS_STYLES[getCalendarVisualStatus(item)];
  return <span className={cn("inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold", style.className)}>{style.label}</span>;
}

export default function MarketingCalendarView({
  snapshot,
  filters,
  canMutateBackend,
  reviewPending = false,
  reviewError,
  pendingAction,
  onFiltersChange,
  onNavigate,
  onCancel,
  onApprove,
  onCompleteManual,
}: {
  snapshot: MarketingSnapshot;
  filters: MarketingUrlState;
  canMutateBackend: boolean;
  reviewPending?: boolean;
  reviewError?: string | null;
  pendingAction: string | null;
  onFiltersChange: (patch: Partial<MarketingUrlState>) => void;
  onNavigate?: MarketingNavigate;
  onCancel: (itemId: string, reason: string) => Promise<unknown>;
  onApprove: (itemId: string, scheduledAt: string) => Promise<unknown>;
  onCompleteManual: (itemId: string, outcome: "published" | "failed", note: string) => Promise<unknown>;
}) {
  const initialRange = filters.from ? marketingMonthRange(filters.from) : currentMarketingMonthRange();
  const initialMonth = new Date(`${initialRange?.from || currentMarketingMonthRange().from}T12:00:00`);
  const [currentMonth, setCurrentMonth] = useState(initialMonth);
  const [selectedItemSnapshot, setSelectedItem] = useState<MarketingCalendarItem | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [approvalSchedule, setApprovalSchedule] = useState("");
  const [manualItem, setManualItem] = useState<MarketingCalendarItem | null>(null);
  const [manualOutcome, setManualOutcome] = useState<"published" | "failed">("published");
  const [manualNote, setManualNote] = useState("");
  const [agendaViewMode, setAgendaViewMode] = useState<OperationViewMode>("details");
  const [agendaSortKey, setAgendaSortKey] = useState<"date" | "title" | "channel" | "status">("date");
  const [agendaSortDirection, setAgendaSortDirection] = useState<SortDirection>("asc");
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({
    start: startOfWeek(monthStart, { weekStartsOn: 1 }),
    end: endOfWeek(monthEnd, { weekStartsOn: 1 }),
  });
  const visibleRange = marketingMonthRange(format(currentMonth, "yyyy-MM-dd")) || currentMarketingMonthRange();

  useEffect(() => {
    const nextRange = filters.from ? marketingMonthRange(filters.from) : currentMarketingMonthRange();
    if (nextRange) setCurrentMonth(new Date(`${nextRange.from}T12:00:00`));
  }, [filters.from]);

  const filtered = useMemo(() => {
    const query = filters.query.trim().toLowerCase();
    return snapshot.calendar
      .filter((item) => !filters.campaignId || item.campaignId === filters.campaignId)
      .filter((item) => filters.status === "all" || item.status === filters.status)
      .filter((item) => filters.channel === "all" || item.channel === filters.channel)
      .filter((item) => {
        const dateKey = marketingZurichDateKey(item.scheduledAt);
        return dateKey >= visibleRange.from && dateKey <= visibleRange.to;
      })
      .filter((item) => !query || `${item.title} ${item.campaignName} ${item.audienceName}`.toLowerCase().includes(query))
      .sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt));
  }, [filters.campaignId, filters.channel, filters.query, filters.status, snapshot.calendar, visibleRange.from, visibleRange.to]);

  const sortedAgenda = useMemo(() => {
    const collator = new Intl.Collator("fr-CH", { sensitivity: "base", numeric: true });
    return [...filtered].sort((left, right) => {
      const leftValue = agendaSortKey === "date" ? left.scheduledAt
        : agendaSortKey === "title" ? left.title
        : agendaSortKey === "channel" ? left.channel
        : getCalendarVisualStatus(left);
      const rightValue = agendaSortKey === "date" ? right.scheduledAt
        : agendaSortKey === "title" ? right.title
        : agendaSortKey === "channel" ? right.channel
        : getCalendarVisualStatus(right);
      const comparison = agendaSortKey === "date"
        ? leftValue.localeCompare(rightValue)
        : collator.compare(leftValue, rightValue);
      return (agendaSortDirection === "asc" ? comparison : -comparison) || left.id.localeCompare(right.id);
    });
  }, [filtered, agendaSortKey, agendaSortDirection]);
  const agenda = sortedAgenda.slice((filters.page - 1) * PAGE_SIZE, filters.page * PAGE_SIZE);

  const moveMonth = (delta: number) => {
    const next = addMonths(currentMonth, delta);
    setSelectedItem(null);
    setCurrentMonth(next);
    onFiltersChange({
      from: format(startOfMonth(next), "yyyy-MM-dd"),
      to: format(endOfMonth(next), "yyyy-MM-dd"),
      page: 1,
      itemId: "",
    });
  };

  const openItem = (item: MarketingCalendarItem) => {
    setCancelReason("");
    if (onNavigate) onNavigate("calendar", { campaignId: item.campaignId || undefined, itemId: item.id, scheduledAt: item.scheduledAt });
    else setSelectedItem(item);
    const date = new Date(item.scheduledAt);
    setApprovalSchedule(Number.isNaN(date.getTime()) ? "" : marketingZurichDateTimeInput(date));
  };

  const confirmCancel = async () => {
    if (!selectedItem || !canMutateBackend || pendingAction || cancelReason.trim().length < 8) return;
    const result = await onCancel(selectedItem.id, cancelReason.trim());
    if (result) {
      setSelectedItem(null);
      setCancelReason("");
      if (filters.itemId) onFiltersChange({ itemId: "" });
    }
  };

  const confirmApproval = async () => {
    if (!selectedItem || !canMutateBackend || pendingAction || !canApproveSelected || !approvalSchedule) return;
    const scheduledAt = approvalScheduleIso;
    if (!scheduledAt) return;
    await onApprove(selectedItem.id, scheduledAt);
  };

  const closeManualDialog = () => {
    setManualItem(null);
    setManualOutcome("published");
    setManualNote("");
  };

  const confirmManualCompletion = async () => {
    if (!manualItem || !canMutateBackend || pendingAction || manualNote.trim().length < 8) return;
    const result = await onCompleteManual(manualItem.id, manualOutcome, manualNote.trim());
    if (result) closeManualDialog();
  };

  const selectedItemId = filters.itemId || selectedItemSnapshot?.id;
  const selectedItem = snapshot.calendar.find((item) => item.id === selectedItemId
    && (!filters.campaignId || item.campaignId === filters.campaignId))
    || (selectedItemSnapshot && selectedItemSnapshot.id === selectedItemId && (!filters.campaignId || selectedItemSnapshot.campaignId === filters.campaignId) ? selectedItemSnapshot : null);
  useEffect(() => {
    setCancelReason("");
    setApprovalSchedule(selectedItem?.scheduledAt ? marketingZurichDateTimeInput(selectedItem.scheduledAt) : "");
  }, [selectedItem?.id, selectedItem?.scheduledAt]);
  useEffect(() => {
    if (!filters.itemId || !selectedItem?.scheduledAt) return;
    const range = marketingMonthRange(marketingZurichDateKey(selectedItem.scheduledAt));
    if (range && (filters.from !== range.from || filters.to !== range.to)) {
      onFiltersChange({ from: range.from, to: range.to, page: 1 });
    }
  }, [filters.itemId, filters.from, filters.to, selectedItem?.scheduledAt, onFiltersChange]);
  const closeItem = () => {
    if (pendingAction) return;
    setSelectedItem(null);
    setCancelReason("");
    setApprovalSchedule("");
    if (filters.itemId) onFiltersChange({ itemId: "" });
  };
  const selectedChannel = selectedItem
    ? snapshot.channels.find((channel) => channel.id === selectedItem.channel)
    : null;
  const selectedCampaign = selectedItem?.campaignId
    ? snapshot.campaigns.find((campaign) => campaign.id === selectedItem.campaignId)
    : null;
  const approvalChecks = selectedItem ? [
    { label: "Élément en brouillon et en attente", ok: selectedItem.status === "draft" && selectedItem.approvalStatus === "pending" },
    { label: selectedItem.campaignId ? "Campagne approuvée" : "Publication autonome", ok: !selectedItem.campaignId || Boolean(selectedCampaign?.approvedAt) },
    { label: "Audience éligible, ou canal de publication publique", ok: selectedItem.audienceSize > 0 || isPublicMarketingChannel(selectedItem.channel) },
    { label: "Contenu non vide", ok: selectedItem.content.trim().length > 0 },
    { label: "Texte et image de l’e-mail complets", ok: !selectedItem.postPreview?.email || isMarketingMailingReady(selectedItem.postPreview) },
    { label: "Canal disponible ou manuel", ok: Boolean(selectedChannel && ["available", "manual"].includes(selectedChannel.availability)) },
  ] : [];
  const canApproveSelected = approvalChecks.length > 0 && approvalChecks.every((check) => check.ok);
  const canCompleteSelectedManual = Boolean(
    selectedItem
    && selectedItem.approvalStatus === "approved"
    && ["scheduled", "running"].includes(selectedItem.status)
    && isPublicMarketingChannel(selectedItem.channel)
    && selectedChannel?.availability === "manual",
  );
  const approvalScheduleIso = approvalSchedule
    ? marketingZurichLocalDateTimeToIso(approvalSchedule)
    : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-600">Planification multicanale</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Calendrier des publications</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Toutes les heures sont affichées en Europe/Zurich. Les canaux bloqués restent visibles mais ne peuvent pas partir.</p>
        </div>
        <Button type="button" variant="outline" onClick={() => { const current = currentMarketingMonthRange(); setSelectedItem(null); setCurrentMonth(new Date(`${current.from}T12:00:00`)); onFiltersChange({ from: "", to: "", page: 1, itemId: "" }); }}>Aujourd'hui</Button>
      </div>
      {filters.campaignId ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background p-3 text-sm"><span>Campagne : {snapshot.campaigns.find((campaign) => campaign.id === filters.campaignId)?.name || "campagne sélectionnée"}</span><Button type="button" variant="outline" size="sm" onClick={() => { setSelectedItem(null); onFiltersChange({ campaignId: "", itemId: "", page: 1 }); }}>Voir toutes les campagnes</Button></div> : null}

      <div className="rounded-2xl border border-sky-500/25 bg-sky-500/5 p-4 text-sm text-sky-900 dark:text-sky-100">
        <p className="font-semibold">Campagne approuvée → élément approuvé et planifié → orchestrateur à l'heure prévue</p>
        <p className="mt-1 text-xs opacity-80">L'approbation calendrier ne lance jamais un envoi immédiat.</p>
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-[minmax(12rem,1fr)_11rem_12rem]">
          <label className="relative block">
            <span className="sr-only">Rechercher dans le calendrier</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={filters.query} onChange={(event) => onFiltersChange({ query: event.target.value, page: 1 })} placeholder="Campagne, contenu, audience…" className="pl-9" />
          </label>
          <Select value={filters.status} onValueChange={(status) => onFiltersChange({ status, page: 1 })}>
            <SelectTrigger aria-label="Filtrer par statut"><SelectValue placeholder="Statut" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value="draft">Brouillons</SelectItem>
              <SelectItem value="scheduled">Planifiés</SelectItem>
              <SelectItem value="running">En cours</SelectItem>
              <SelectItem value="published">Publiés</SelectItem>
              <SelectItem value="completed">Terminés</SelectItem>
              <SelectItem value="failed">Échecs</SelectItem>
              <SelectItem value="blocked_configuration">Bloqués</SelectItem>
              <SelectItem value="cancelled">Annulés</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filters.channel} onValueChange={(channel) => onFiltersChange({ channel: channel as MarketingChannelId | "all", page: 1 })}>
            <SelectTrigger aria-label="Filtrer par canal"><SelectValue placeholder="Canal" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les canaux</SelectItem>
              {snapshot.channels.map((channel) => <SelectItem key={channel.id} value={channel.id}>{channel.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between border-b">
          <Button type="button" variant="outline" size="icon" onClick={() => moveMonth(-1)} aria-label="Mois précédent"><ChevronLeft className="h-4 w-4" /></Button>
          <CardTitle className="capitalize">{currentMonth.toLocaleDateString("fr-CH", { month: "long", year: "numeric" })}</CardTitle>
          <Button type="button" variant="outline" size="icon" onClick={() => moveMonth(1)} aria-label="Mois suivant"><ChevronRight className="h-4 w-4" /></Button>
        </CardHeader>
        <div className="flex flex-wrap items-center gap-2 border-b bg-muted/10 px-4 py-3" role="group" aria-label="Légende des statuts du calendrier">
          {CALENDAR_LEGEND_STATUSES.map((status) => {
            const style = CALENDAR_STATUS_STYLES[status];
            return (
              <span key={status} className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold", style.className)}>
                {style.label}
              </span>
            );
          })}
        </div>
        <CardContent className="hidden p-0 md:block">
          <div className="grid grid-cols-7 border-b bg-muted/30">
            {WEEK_DAYS.map((day) => <div key={day} className="px-2 py-3 text-center text-xs font-semibold text-muted-foreground">{day}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day) => {
              const dayKey = format(day, "yyyy-MM-dd");
              const items = filtered.filter((item) => marketingZurichDateKey(item.scheduledAt) === dayKey);
              return (
                <div key={day.toISOString()} className={cn("min-h-32 border-b border-r p-2", !isSameMonth(day, currentMonth) && "bg-muted/20 text-muted-foreground")}>
                  <div className={cn("mb-2 flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold", isSameDay(day, new Date()) && "bg-orange-500 text-white")}>{format(day, "d")}</div>
                  <div className="space-y-1.5">
                    {items.slice(0, 3).map((item) => {
                      const visualStatus = getCalendarVisualStatus(item);
                      const style = CALENDAR_STATUS_STYLES[visualStatus];
                      const time = new Date(item.scheduledAt).toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Zurich" });
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => openItem(item)}
                          className={cn(
                            "block w-full truncate rounded-lg border px-2 py-1.5 text-left text-[11px] font-semibold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400",
                            style.className,
                          )}
                          title={`${style.label} · ${item.title}`}
                          aria-label={`${time} — ${style.label} — ${item.title}`}
                        >
                          <span className="mr-1 opacity-70">{time}</span>
                          {item.title}
                        </button>
                      );
                    })}
                    {items.length > 3 ? <p className="px-1 text-[10px] text-muted-foreground">+{items.length - 3} autres</p> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-orange-500" /> Agenda filtré</CardTitle>
            <p className="text-xs text-muted-foreground">{filtered.length} publication(s) dans la sélection</p>
          </div>
          <OperationViewToggle value={agendaViewMode} onChange={setAgendaViewMode} ariaLabel="Mode d’affichage de l’agenda marketing" />
        </CardHeader>
        <CardContent>
          <SortControls
            className="mb-4 max-w-lg"
            columns={[{ key: "date", label: "Date de publication" }, { key: "title", label: "Titre" }, { key: "channel", label: "Canal" }, { key: "status", label: "Statut" }]}
            sortKey={agendaSortKey}
            direction={agendaSortDirection}
            onSortKeyChange={(key) => { setAgendaSortKey(key); onFiltersChange({ page: 1 }); }}
            onDirectionChange={(direction) => { setAgendaSortDirection(direction); onFiltersChange({ page: 1 }); }}
          />
          {agenda.length ? (
            <div className={cn("gap-3", agendaViewMode === "gallery" ? "grid sm:grid-cols-2 xl:grid-cols-3" : "space-y-3")}>
              {agenda.map((item) => (
                <button key={item.id} type="button" onClick={() => openItem(item)} className={cn(
                  "flex w-full min-w-0 gap-3 rounded-2xl border p-4 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400",
                  agendaViewMode === "gallery" ? "flex-col" : "flex-col sm:flex-row sm:items-center",
                  agendaViewMode === "list" && "py-3",
                )}>
                  {agendaViewMode !== "list" ? <MarketingPostImage url={item.postPreview?.visualUrl || item.visualUrl} title={item.title} compact={agendaViewMode !== "gallery"} /> : null}
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-semibold">{item.title}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{item.campaignName} · {formatMarketingDate(item.scheduledAt)}</p>
                    {agendaViewMode === "details" ? <p className="mt-2 line-clamp-2 break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">{item.postPreview?.caption || item.content || "Aucun texte enregistré"}</p> : null}
                    {agendaViewMode !== "list" ? <span className="mt-2 inline-block text-xs font-semibold text-primary">Voir le visuel et le texte</span> : null}
                  </div>
                  <div className="flex flex-wrap gap-2"><MarketingChannelBadge channel={item.channel} /><CalendarStatusBadge item={item} /></div>
                </button>
              ))}
              <MarketingPagination page={filters.page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={(page) => onFiltersChange({ page })} />
            </div>
          ) : (
            <MarketingEmptyState title="Aucun élément dans ce calendrier" description={snapshot.source === "fallback" ? "Le backend marketing est indisponible ; aucune opération n'est simulée." : "Aucun élément ne correspond aux filtres sélectionnés."} />
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(selectedItem) && !manualItem} onOpenChange={(open) => { if (!open) closeItem(); }}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedItem?.title}</DialogTitle>
            <DialogDescription>{selectedItem ? `${selectedItem.campaignName} · ${formatMarketingDate(selectedItem.scheduledAt)}` : ""}</DialogDescription>
          </DialogHeader>
          {reviewPending ? <p role="status" className="rounded-xl border bg-muted/20 p-3 text-sm">Actualisation de la publication sélectionnée. Les actions seront disponibles après confirmation.</p> : null}
          {reviewError ? <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 text-sm">{reviewError}</p> : null}
          {selectedItem ? (
            <div className="space-y-4">
              <div className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2">
                <div><p className="text-xs text-muted-foreground">Canal</p><div className="mt-1"><MarketingChannelBadge channel={selectedItem.channel} /></div></div>
                <div><p className="text-xs text-muted-foreground">Statut</p><div className="mt-1"><CalendarStatusBadge item={selectedItem} /></div></div>
                <div><p className="text-xs text-muted-foreground">Audience</p><p className="mt-1 text-sm font-medium">{selectedItem.audienceName}</p></div>
                <div><p className="text-xs text-muted-foreground">Taille éligible</p><p className="mt-1 text-sm font-medium">{selectedItem.audienceSize.toLocaleString("fr-CH")}</p></div>
              </div>
              <MarketingPostPreview
                title={selectedItem.title}
                channel={selectedItem.channel}
                scheduledAt={selectedItem.scheduledAt}
                preview={selectedItem.postPreview || { caption: selectedItem.content, visualUrl: selectedItem.visualUrl, visualFormat: selectedItem.format || undefined }}
              />
              <div className="space-y-2">
                {selectedItem.campaignId ? <p className="text-xs text-muted-foreground">La validation de cette publication est incluse dans le dossier Telegram de sa campagne.</p> : null}
                <MarketingContentReview targetType={selectedItem.campaignId ? "campaign" : "item"} targetId={selectedItem.campaignId || selectedItem.id}
                  revisionKey={selectedItem.campaignId ? JSON.stringify([selectedItem.id, selectedItem.updatedAt, selectedCampaign?.updatedAt,
                    snapshot.calendar.filter((item) => item.campaignId === selectedItem.campaignId).map((item) => [item.id, item.updatedAt])]) : selectedItem.updatedAt}
                  enabled={snapshot.source !== "fallback" && !reviewPending && !reviewError}
                  canRetry={canMutateBackend && !pendingAction} />
              </div>
              {selectedItem.manualOutcome || selectedItem.manualNote ? (
                <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Suivi manuel</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2"><MarketingStatusBadge status={selectedItem.manualOutcome === "published" ? "published" : "failed"} />{selectedItem.publishedAt ? <span className="text-xs text-muted-foreground">{formatMarketingDate(selectedItem.publishedAt)}</span> : null}</div>
                  {selectedItem.manualNote ? <p className="mt-2 whitespace-pre-wrap break-words text-sm" title={selectedItem.manualNote}>{selectedItem.manualNote.length > 500 ? `${selectedItem.manualNote.slice(0, 500)}…` : selectedItem.manualNote}</p> : null}
                </div>
              ) : null}
              {selectedItem.status === "draft" && selectedItem.approvalStatus === "pending" ? (
                <div className="space-y-3 rounded-xl border p-4">
                  <p className="text-sm font-semibold">Conditions d'approbation</p>
                  {approvalChecks.map((check) => (
                    <div key={check.label} className="flex items-center gap-2 text-sm">
                      {check.ok ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />}
                      <span>{check.label}</span>
                    </div>
                  ))}
                  {!selectedCampaign?.approvedAt && selectedItem.campaignId && onNavigate ? <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3"><p className="text-sm">Approuvez d’abord la campagne, puis revenez à cette publication pour la planifier.</p><Button type="button" variant="outline" className="mt-2" disabled={Boolean(pendingAction)} onClick={() => onNavigate("campaigns", { campaignId: selectedItem.campaignId || undefined, itemId: selectedItem.id, scheduledAt: selectedItem.scheduledAt })}>Relire et approuver la campagne</Button></div> : null}
                  <label htmlFor="calendar-approval-schedule" className="block text-sm font-semibold">Date et heure de planification
                    <Input id="calendar-approval-schedule" type="datetime-local" className="mt-2" value={approvalSchedule} onChange={(event) => setApprovalSchedule(event.target.value)} />
                    {approvalSchedule && !approvalScheduleIso ? <span className="mt-1 block text-xs font-normal text-rose-600">Cet horaire n'existe pas en Europe/Zurich lors du changement d'heure.</span> : null}
                  </label>
                </div>
              ) : null}
              {["draft", "scheduled"].includes(selectedItem.status) ? (
                <div>
                  <label htmlFor="calendar-cancel-reason" className="text-sm font-semibold">Motif d'annulation</label>
                  <Textarea id="calendar-cancel-reason" className="mt-2" value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder="Minimum 8 caractères…" maxLength={400} />
                </div>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={Boolean(pendingAction)} onClick={closeItem}>Fermer</Button>
            {selectedItem && selectedItem.status === "draft" && selectedItem.approvalStatus === "pending" ? (
              <Button type="button" disabled={!canMutateBackend || !canApproveSelected || !approvalScheduleIso || Boolean(pendingAction)} onClick={confirmApproval}>
                <CheckCircle2 className="mr-2 h-4 w-4" />Approuver et planifier
              </Button>
            ) : null}
            {selectedItem && ["draft", "scheduled"].includes(selectedItem.status) ? (
              <Button type="button" variant="destructive" disabled={!canMutateBackend || cancelReason.trim().length < 8 || Boolean(pendingAction)} onClick={confirmCancel}>
                <XCircle className="mr-2 h-4 w-4" /> Annuler et journaliser
              </Button>
            ) : null}
            {canCompleteSelectedManual && selectedItem ? (
              <Button type="button" variant="outline" disabled={!canMutateBackend || Boolean(pendingAction)} onClick={() => { setManualItem(selectedItem); setSelectedItem(null); if (filters.itemId) onFiltersChange({ itemId: "" }); }}>
                <CheckCircle2 className="mr-2 h-4 w-4" />Clôturer la publication
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(manualItem)} onOpenChange={(open) => { if (!open) closeManualDialog(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Clôturer la publication manuelle</DialogTitle>
            <DialogDescription>{manualItem ? `${manualItem.title} · ${manualItem.campaignName}` : ""}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-semibold">Résultat</label>
              <Select value={manualOutcome} onValueChange={(value) => setManualOutcome(value as "published" | "failed")}>
                <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="published">Publié</SelectItem><SelectItem value="failed">Échec</SelectItem></SelectContent>
              </Select>
            </div>
            <div>
              <label htmlFor="manual-publication-note" className="text-sm font-semibold">Note de publication obligatoire</label>
              <Textarea id="manual-publication-note" className="mt-2 min-h-28" value={manualNote} onChange={(event) => setManualNote(event.target.value)} maxLength={2_000} placeholder="Lien publié, contrôle effectué ou cause de l'échec…" />
              <p className="mt-1 text-xs text-muted-foreground">{manualNote.trim().length}/2000 · minimum 8 caractères</p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeManualDialog}>Annuler</Button>
            <Button type="button" variant={manualOutcome === "failed" ? "destructive" : "default"} disabled={!canMutateBackend || manualNote.trim().length < 8 || pendingAction === `complete-manual-item-${manualItem?.id}`} onClick={confirmManualCompletion}>
              Confirmer et journaliser
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
