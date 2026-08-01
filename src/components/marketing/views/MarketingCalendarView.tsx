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
import {
  isPublicMarketingChannel,
  type MarketingCalendarItem,
  type MarketingChannelId,
  type MarketingSnapshot,
} from "@/marketing/types";
import type { MarketingUrlState } from "@/marketing/useMarketingUrlState";
import {
  currentMarketingMonthRange,
  marketingMonthRange,
  marketingZurichDateKey,
  marketingZurichDateTimeInput,
  marketingZurichLocalDateTimeToIso,
} from "@/marketing/zurichTime";

const WEEK_DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const PAGE_SIZE = 8;

export default function MarketingCalendarView({
  snapshot,
  filters,
  canMutateBackend,
  pendingAction,
  onFiltersChange,
  onCancel,
  onApprove,
  onCompleteManual,
}: {
  snapshot: MarketingSnapshot;
  filters: MarketingUrlState;
  canMutateBackend: boolean;
  pendingAction: string | null;
  onFiltersChange: (patch: Partial<MarketingUrlState>) => void;
  onCancel: (itemId: string, reason: string) => Promise<unknown>;
  onApprove: (itemId: string, scheduledAt: string) => Promise<unknown>;
  onCompleteManual: (itemId: string, outcome: "published" | "failed", note: string) => Promise<unknown>;
}) {
  const initialRange = filters.from ? marketingMonthRange(filters.from) : currentMarketingMonthRange();
  const initialMonth = new Date(`${initialRange?.from || currentMarketingMonthRange().from}T12:00:00`);
  const [currentMonth, setCurrentMonth] = useState(initialMonth);
  const [selectedItem, setSelectedItem] = useState<MarketingCalendarItem | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [approvalSchedule, setApprovalSchedule] = useState("");
  const [manualItem, setManualItem] = useState<MarketingCalendarItem | null>(null);
  const [manualOutcome, setManualOutcome] = useState<"published" | "failed">("published");
  const [manualNote, setManualNote] = useState("");
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({
    start: startOfWeek(monthStart, { weekStartsOn: 1 }),
    end: endOfWeek(monthEnd, { weekStartsOn: 1 }),
  });
  const visibleRange = marketingMonthRange(format(currentMonth, "yyyy-MM-dd")) || currentMarketingMonthRange();

  useEffect(() => {
    if (!filters.from) return;
    const nextRange = marketingMonthRange(filters.from);
    if (nextRange) setCurrentMonth(new Date(`${nextRange.from}T12:00:00`));
  }, [filters.from]);

  const filtered = useMemo(() => {
    const query = filters.query.trim().toLowerCase();
    return snapshot.calendar
      .filter((item) => filters.status === "all" || item.status === filters.status)
      .filter((item) => filters.channel === "all" || item.channel === filters.channel)
      .filter((item) => {
        const dateKey = marketingZurichDateKey(item.scheduledAt);
        return dateKey >= visibleRange.from && dateKey <= visibleRange.to;
      })
      .filter((item) => !query || `${item.title} ${item.campaignName} ${item.audienceName}`.toLowerCase().includes(query))
      .sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt));
  }, [filters.channel, filters.query, filters.status, snapshot.calendar, visibleRange.from, visibleRange.to]);

  const agenda = filtered.slice((filters.page - 1) * PAGE_SIZE, filters.page * PAGE_SIZE);

  const moveMonth = (delta: number) => {
    const next = addMonths(currentMonth, delta);
    setCurrentMonth(next);
    onFiltersChange({
      from: format(startOfMonth(next), "yyyy-MM-dd"),
      to: format(endOfMonth(next), "yyyy-MM-dd"),
      page: 1,
    });
  };

  const openItem = (item: MarketingCalendarItem) => {
    setSelectedItem(item);
    const date = new Date(item.scheduledAt);
    setApprovalSchedule(Number.isNaN(date.getTime()) ? "" : marketingZurichDateTimeInput(date));
  };

  const confirmCancel = async () => {
    if (!selectedItem || cancelReason.trim().length < 8) return;
    const result = await onCancel(selectedItem.id, cancelReason.trim());
    if (result) {
      setSelectedItem(null);
      setCancelReason("");
    }
  };

  const confirmApproval = async () => {
    if (!selectedItem || !approvalSchedule) return;
    const scheduledAt = approvalScheduleIso;
    if (!scheduledAt) return;
    const result = await onApprove(selectedItem.id, scheduledAt);
    if (result) {
      setSelectedItem(null);
      setApprovalSchedule("");
    }
  };

  const closeManualDialog = () => {
    setManualItem(null);
    setManualOutcome("published");
    setManualNote("");
  };

  const confirmManualCompletion = async () => {
    if (!manualItem || manualNote.trim().length < 8) return;
    const result = await onCompleteManual(manualItem.id, manualOutcome, manualNote.trim());
    if (result) closeManualDialog();
  };

  const selectedChannel = selectedItem
    ? snapshot.channels.find((channel) => channel.id === selectedItem.channel)
    : null;
  const selectedCampaign = selectedItem?.campaignId
    ? snapshot.campaigns.find((campaign) => campaign.id === selectedItem.campaignId)
    : null;
  const approvalChecks = selectedItem ? [
    { label: "Élément en brouillon et en attente", ok: selectedItem.status === "draft" && selectedItem.approvalStatus === "pending" },
    { label: "Campagne approuvée", ok: Boolean(selectedCampaign?.approvedAt) },
    { label: "Audience éligible, ou canal de publication publique", ok: selectedItem.audienceSize > 0 || isPublicMarketingChannel(selectedItem.channel) },
    { label: "Contenu non vide", ok: selectedItem.content.trim().length > 0 },
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
        <Button type="button" variant="outline" onClick={() => { const current = currentMarketingMonthRange(); setCurrentMonth(new Date(`${current.from}T12:00:00`)); onFiltersChange({ from: "", to: "", page: 1 }); }}>Aujourd'hui</Button>
      </div>

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

      <Card className="hidden overflow-hidden md:block">
        <CardHeader className="flex flex-row items-center justify-between border-b">
          <Button type="button" variant="outline" size="icon" onClick={() => moveMonth(-1)} aria-label="Mois précédent"><ChevronLeft className="h-4 w-4" /></Button>
          <CardTitle className="capitalize">{currentMonth.toLocaleDateString("fr-CH", { month: "long", year: "numeric" })}</CardTitle>
          <Button type="button" variant="outline" size="icon" onClick={() => moveMonth(1)} aria-label="Mois suivant"><ChevronRight className="h-4 w-4" /></Button>
        </CardHeader>
        <CardContent className="p-0">
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
                    {items.slice(0, 3).map((item) => (
                      <button key={item.id} type="button" onClick={() => openItem(item)} className="block w-full truncate rounded-lg border border-border/60 bg-background px-2 py-1.5 text-left text-[11px] font-medium shadow-sm hover:border-orange-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400">
                        <span className="mr-1 text-muted-foreground">{new Date(item.scheduledAt).toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Zurich" })}</span>
                        {item.title}
                      </button>
                    ))}
                    {items.length > 3 ? <p className="px-1 text-[10px] text-muted-foreground">+{items.length - 3} autres</p> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-orange-500" /> Agenda filtré</CardTitle>
        </CardHeader>
        <CardContent>
          {agenda.length ? (
            <div className="space-y-3">
              {agenda.map((item) => (
                <button key={item.id} type="button" onClick={() => openItem(item)} className="flex w-full min-w-0 flex-col gap-3 rounded-2xl border p-4 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{item.title}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{item.campaignName} · {formatMarketingDate(item.scheduledAt)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2"><MarketingChannelBadge channel={item.channel} /><MarketingStatusBadge status={item.status} /></div>
                </button>
              ))}
              <MarketingPagination page={filters.page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={(page) => onFiltersChange({ page })} />
            </div>
          ) : (
            <MarketingEmptyState title="Aucun élément dans ce calendrier" description={snapshot.source === "fallback" ? "Le backend marketing est indisponible ; aucune opération n'est simulée." : "Aucun élément ne correspond aux filtres sélectionnés."} />
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(selectedItem)} onOpenChange={(open) => { if (!open) { setSelectedItem(null); setCancelReason(""); setApprovalSchedule(""); } }}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{selectedItem?.title}</DialogTitle>
            <DialogDescription>{selectedItem ? `${selectedItem.campaignName} · ${formatMarketingDate(selectedItem.scheduledAt)}` : ""}</DialogDescription>
          </DialogHeader>
          {selectedItem ? (
            <div className="space-y-4">
              <div className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2">
                <div><p className="text-xs text-muted-foreground">Canal</p><div className="mt-1"><MarketingChannelBadge channel={selectedItem.channel} /></div></div>
                <div><p className="text-xs text-muted-foreground">Statut</p><div className="mt-1"><MarketingStatusBadge status={selectedItem.status} /></div></div>
                <div><p className="text-xs text-muted-foreground">Audience</p><p className="mt-1 text-sm font-medium">{selectedItem.audienceName}</p></div>
                <div><p className="text-xs text-muted-foreground">Taille éligible</p><p className="mt-1 text-sm font-medium">{selectedItem.audienceSize.toLocaleString("fr-CH")}</p></div>
              </div>
              <div className="rounded-xl border bg-muted/20 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Contenu</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{selectedItem.content || "Aucun contenu confirmé"}</p>
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
            <Button type="button" variant="outline" onClick={() => setSelectedItem(null)}>Fermer</Button>
            {selectedItem && selectedItem.status === "draft" && selectedItem.approvalStatus === "pending" ? (
              <Button type="button" disabled={!canMutateBackend || !canApproveSelected || !approvalScheduleIso || pendingAction === `approve-item-${selectedItem.id}`} onClick={confirmApproval}>
                <CheckCircle2 className="mr-2 h-4 w-4" />Approuver et planifier
              </Button>
            ) : null}
            {selectedItem && ["draft", "scheduled"].includes(selectedItem.status) ? (
              <Button type="button" variant="destructive" disabled={!canMutateBackend || cancelReason.trim().length < 8 || pendingAction === `cancel-${selectedItem.id}`} onClick={confirmCancel}>
                <XCircle className="mr-2 h-4 w-4" /> Annuler et journaliser
              </Button>
            ) : null}
            {canCompleteSelectedManual && selectedItem ? (
              <Button type="button" variant="outline" disabled={!canMutateBackend || pendingAction === `complete-manual-item-${selectedItem.id}`} onClick={() => { setManualItem(selectedItem); setSelectedItem(null); }}>
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
