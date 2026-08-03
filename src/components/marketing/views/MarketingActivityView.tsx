import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Eye, EyeOff, RefreshCw, Search, ShieldCheck } from "lucide-react";

import {
  MarketingChannelBadge,
  MarketingEmptyState,
  MarketingPagination,
  MarketingStatusBadge,
  formatMarketingDate,
} from "@/components/marketing/MarketingShared";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { MARKETING_DELIVERY_STATUSES } from "@/marketing/types";
import { marketingPageOffset } from "@/marketing/offsetPage";
import type {
  MarketingChannelId,
  MarketingDelivery,
  MarketingDeliveryListParams,
  MarketingDeliveryStatus,
  MarketingManualTarget,
  MarketingOffsetPage,
  MarketingSnapshot,
} from "@/marketing/types";
import type { MarketingUrlState } from "@/marketing/useMarketingUrlState";

const PAGE_SIZE = 12;
const EMPTY_DELIVERY_PAGE: MarketingOffsetPage<MarketingDelivery> = { items: [], total: 0 };

function deliveryStatusFilter(value: string): MarketingDeliveryStatus | null | undefined {
  if (value === "all") return null;
  return MARKETING_DELIVERY_STATUSES.includes(value as MarketingDeliveryStatus)
    ? value as MarketingDeliveryStatus
    : undefined;
}

function safeListError(error: unknown) {
  const message = error instanceof Error ? error.message : "Service de journalisation indisponible";
  return message.replace(/[\r\n]+/g, " ").slice(0, 180);
}

export default function MarketingActivityView({
  snapshot,
  filters,
  canMutateBackend,
  pendingAction,
  onFiltersChange,
  onLoadDeliveriesPage,
  deliveriesRevision,
  onRetry,
  onRevealManualTarget,
  onCompleteManual,
}: {
  snapshot: MarketingSnapshot;
  filters: MarketingUrlState;
  canMutateBackend: boolean;
  pendingAction: string | null;
  onFiltersChange: (patch: Partial<MarketingUrlState>) => void;
  onLoadDeliveriesPage: (params: MarketingDeliveryListParams) => Promise<MarketingOffsetPage<MarketingDelivery>>;
  deliveriesRevision: number;
  onRetry: (deliveryId: string) => Promise<unknown>;
  onRevealManualTarget: (deliveryId: string, reason: string) => Promise<MarketingManualTarget | undefined>;
  onCompleteManual: (deliveryId: string, outcome: "completed" | "failed", note: string) => Promise<unknown>;
}) {
  const [manualDelivery, setManualDelivery] = useState<MarketingDelivery | null>(null);
  const [manualRevealReason, setManualRevealReason] = useState("");
  const [revealedTarget, setRevealedTarget] = useState<MarketingManualTarget | null>(null);
  const [manualOutcome, setManualOutcome] = useState<"completed" | "failed">("completed");
  const [manualNote, setManualNote] = useState("");
  const [deliveryPage, setDeliveryPage] = useState<MarketingOffsetPage<MarketingDelivery>>(EMPTY_DELIVERY_PAGE);
  const [deliveriesLoading, setDeliveriesLoading] = useState(true);
  const [deliveriesError, setDeliveriesError] = useState<string | null>(null);
  const deliveriesGeneration = useRef(0);
  const revealGeneration = useRef(0);
  const pageItems = deliveryPage.items;

  const loadDeliveries = useCallback(async () => {
    const generation = deliveriesGeneration.current + 1;
    deliveriesGeneration.current = generation;
    setDeliveryPage(EMPTY_DELIVERY_PAGE);
    setDeliveriesLoading(true);
    setDeliveriesError(null);

    if (!canMutateBackend) {
      if (deliveriesGeneration.current === generation) {
        setDeliveriesError("Le backend marketing est indisponible ; aucun ancien journal n'est affiché.");
        setDeliveriesLoading(false);
      }
      return;
    }

    const status = deliveryStatusFilter(filters.status);
    if (status === undefined) {
      if (deliveriesGeneration.current === generation) {
        setDeliveriesError("Le filtre de statut est invalide. Le journal reste masqué.");
        setDeliveriesLoading(false);
      }
      return;
    }

    try {
      const result = await onLoadDeliveriesPage({
        query: filters.query,
        status,
        channel: filters.channel === "all" ? null : filters.channel,
        limit: PAGE_SIZE,
        offset: marketingPageOffset(filters.page, PAGE_SIZE),
      });
      if (deliveriesGeneration.current !== generation) return;
      const lastPage = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
      if (filters.page > lastPage) {
        onFiltersChange({ page: lastPage });
        return;
      }
      setDeliveryPage(result);
    } catch (error) {
      if (deliveriesGeneration.current !== generation) return;
      setDeliveryPage(EMPTY_DELIVERY_PAGE);
      setDeliveriesError(safeListError(error));
    } finally {
      if (deliveriesGeneration.current === generation) setDeliveriesLoading(false);
    }
  }, [canMutateBackend, filters.channel, filters.page, filters.query, filters.status, onFiltersChange, onLoadDeliveriesPage]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadDeliveries();
    }, filters.query.trim() ? 250 : 0);
    return () => {
      window.clearTimeout(timer);
      deliveriesGeneration.current += 1;
    };
  }, [deliveriesRevision, filters.query, loadDeliveries]);

  const closeManualDialog = () => {
    revealGeneration.current += 1;
    setManualDelivery(null);
    setManualRevealReason("");
    setRevealedTarget(null);
    setManualOutcome("completed");
    setManualNote("");
  };

  const openManualDialog = (delivery: MarketingDelivery) => {
    revealGeneration.current += 1;
    setManualRevealReason("");
    setRevealedTarget(null);
    setManualOutcome("completed");
    setManualNote("");
    setManualDelivery(delivery);
  };

  const revealTarget = async () => {
    if (!manualDelivery || manualRevealReason.trim().length < 8) return;
    const delivery = manualDelivery;
    const requestGeneration = revealGeneration.current + 1;
    revealGeneration.current = requestGeneration;
    setRevealedTarget(null);
    const target = await onRevealManualTarget(delivery.id, manualRevealReason.trim());
    if (
      target
      && revealGeneration.current === requestGeneration
      && target.deliveryId === delivery.id
    ) setRevealedTarget(target);
  };

  const confirmManualCompletion = async () => {
    if (
      !manualDelivery
      || !revealedTarget
      || revealedTarget.deliveryId !== manualDelivery.id
      || manualNote.trim().length < 8
    ) return;
    const result = await onCompleteManual(manualDelivery.id, manualOutcome, manualNote.trim());
    if (result) closeManualDialog();
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-600">Traçabilité</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Journal des envois</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Ce qui a été tenté, à quel moment, sur quel canal et avec quel résultat. Les listes restent masquées ; une cible manuelle n'est révélée qu'à la demande, après revalidation et audit.</p>
      </div>

      <Alert className="border-emerald-500/25 bg-emerald-500/5">
        <EyeOff className="h-4 w-4 text-emerald-600" />
        <AlertTitle>Identités protégées par défaut</AlertTitle>
        <AlertDescription>Le journal expose uniquement <code>target_masked</code>. L'exception est une réponse ponctuelle <code>no-store</code> pour un appel ou e-mail manuel approuvé, avec motif obligatoire, horaire suisse, éligibilité et opposition recontrôlés côté serveur.</AlertDescription>
      </Alert>

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-[minmax(12rem,1fr)_12rem_12rem]">
          <label className="relative block"><span className="sr-only">Rechercher dans le journal</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={filters.query} maxLength={80} onChange={(event) => onFiltersChange({ query: event.target.value, page: 1 })} placeholder="Destinataire, commune, NPA, campagne, erreur…" className="pl-9" /></label>
          <Select value={filters.status} onValueChange={(status) => onFiltersChange({ status, page: 1 })}><SelectTrigger aria-label="Filtrer par statut"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Tous les statuts</SelectItem><SelectItem value="queued">En attente</SelectItem><SelectItem value="processing">Traitement</SelectItem><SelectItem value="retrying">Nouvelle tentative</SelectItem><SelectItem value="sent">Envoyés</SelectItem><SelectItem value="delivered">Distribués</SelectItem><SelectItem value="opened">Ouverts</SelectItem><SelectItem value="clicked">Cliqués</SelectItem><SelectItem value="converted">Convertis</SelectItem><SelectItem value="bounced">Rebonds</SelectItem><SelectItem value="complained">Plaintes</SelectItem><SelectItem value="unsubscribed">Désinscrits</SelectItem><SelectItem value="skipped">Ignorés</SelectItem><SelectItem value="failed">Échecs</SelectItem><SelectItem value="cancelled">Annulés</SelectItem><SelectItem value="blocked_configuration">Bloqués</SelectItem><SelectItem value="manual_required">Action manuelle</SelectItem></SelectContent></Select>
          <Select value={filters.channel} onValueChange={(channel) => onFiltersChange({ channel: channel as MarketingChannelId | "all", page: 1 })}><SelectTrigger aria-label="Filtrer par canal"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Tous les canaux</SelectItem>{snapshot.channels.map((channel) => <SelectItem key={channel.id} value={channel.id}>{channel.label}</SelectItem>)}</SelectContent></Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 sm:p-4">
          {deliveriesLoading ? (
            <div className="flex min-h-56 items-center justify-center gap-2 p-6 text-sm text-muted-foreground" role="status" aria-live="polite">
              <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
              Chargement sécurisé du journal…
            </div>
          ) : deliveriesError ? (
            <div className="p-4">
              <MarketingEmptyState
                title="Journal indisponible"
                description={`${deliveriesError} Aucune ancienne page n'est conservée.`}
                action={<Button type="button" variant="outline" onClick={() => { void loadDeliveries(); }}><RefreshCw className="mr-2 h-4 w-4" />Réessayer</Button>}
              />
            </div>
          ) : pageItems.length ? (
            <>
              <Table>
                <TableHeader><TableRow><TableHead>Chronologie</TableHead><TableHead>Campagne</TableHead><TableHead>Destinataire</TableHead><TableHead>Cible masquée</TableHead><TableHead>Canal</TableHead><TableHead>Statut</TableHead><TableHead>Suivi manuel</TableHead><TableHead>Fournisseur</TableHead><TableHead>Tentative</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
                <TableBody>
                  {pageItems.map((delivery) => (
                    <TableRow key={delivery.id}>
                      <TableCell data-label="Chronologie"><div className="space-y-1 text-xs"><p><span className="text-muted-foreground">Planifié :</span> {formatMarketingDate(delivery.scheduledAt)}</p><p><span className="text-muted-foreground">Envoyé :</span> {formatMarketingDate(delivery.sentAt)}</p><p><span className="text-muted-foreground">Mis à jour :</span> {formatMarketingDate(delivery.updatedAt)}</p></div></TableCell>
                      <TableCell data-label="Campagne"><span className="font-medium">{delivery.campaignName}</span></TableCell>
                      <TableCell data-label="Destinataire">{delivery.contactName ? <div className="max-w-56 space-y-0.5"><p className="truncate text-sm font-medium" title={delivery.contactName}>{delivery.contactName}</p>{delivery.contactCity || delivery.contactPostalCode ? <p className="truncate text-[11px] text-muted-foreground">{[delivery.contactPostalCode, delivery.contactCity].filter(Boolean).join(" ")}</p> : null}</div> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                      <TableCell data-label="Cible"><code className="rounded bg-muted px-2 py-1 text-xs">{delivery.targetMasked}</code></TableCell>
                      <TableCell data-label="Canal"><MarketingChannelBadge channel={delivery.channel} /></TableCell>
                      <TableCell data-label="Statut"><div><MarketingStatusBadge status={delivery.status} />{delivery.errorCode ? <p className="mt-1 text-[10px] text-rose-600">{delivery.errorCode}</p> : null}</div></TableCell>
                      <TableCell data-label="Suivi manuel">{delivery.manualOutcome || delivery.manualNote ? <div className="max-w-64 space-y-1"><MarketingStatusBadge status={delivery.manualOutcome === "completed" ? "completed" : "failed"} />{delivery.manualNote ? <p className="whitespace-pre-wrap break-words text-xs text-muted-foreground" title={delivery.manualNote}>{delivery.manualNote.length > 240 ? `${delivery.manualNote.slice(0, 240)}…` : delivery.manualNote}</p> : null}</div> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                      <TableCell data-label="Fournisseur">{delivery.provider}</TableCell>
                      <TableCell data-label="Tentative">#{delivery.attempt}</TableCell>
                      <TableCell data-label="Action" className="text-right">
                        {delivery.status === "manual_required" && ["manual_call", "manual_email"].includes(delivery.channel) ? (
                          <Button type="button" variant="outline" size="sm" disabled={!canMutateBackend || pendingAction === `complete-manual-${delivery.id}`} onClick={() => openManualDialog(delivery)}>
                            <Eye className="mr-1 h-3.5 w-3.5" />Traiter
                          </Button>
                        ) : delivery.status === "manual_required" ? (
                          <span className="text-xs text-muted-foreground">Adresse structurée requise</span>
                        ) : delivery.status === "failed" ? (
                          <Button type="button" variant="outline" size="sm" disabled={!canMutateBackend || pendingAction === `retry-${delivery.id}`} onClick={() => onRetry(delivery.id)}>
                            <RefreshCw className={pendingAction === `retry-${delivery.id}` ? "mr-1 h-3.5 w-3.5 animate-spin" : "mr-1 h-3.5 w-3.5"} />Réessayer
                          </Button>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="px-4 pb-4"><MarketingPagination page={filters.page} pageSize={PAGE_SIZE} total={deliveryPage.total} onPageChange={(page) => onFiltersChange({ page })} /></div>
            </>
          ) : (
            <div className="p-4"><MarketingEmptyState title="Aucun envoi confirmé" description={snapshot.source === "fallback" ? "Le backend est indisponible ; le journal reste vide plutôt que d'afficher des événements fictifs." : "Aucune livraison ne correspond aux filtres."} /></div>
          )}
        </CardContent>
      </Card>

      <p className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" />Les nouvelles tentatives sont idempotentes et ne sont proposées que pour un échec technique, jamais pour un blocage de configuration.</p>

      <Dialog open={Boolean(manualDelivery)} onOpenChange={(open) => { if (!open) closeManualDialog(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Traiter l'action manuelle</DialogTitle>
            <DialogDescription>{manualDelivery ? `${manualDelivery.campaignName} · ${manualDelivery.targetMasked}` : ""}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {!revealedTarget ? <>
              <Alert className="border-amber-500/25 bg-amber-500/5">
                <ShieldCheck className="h-4 w-4 text-amber-600" />
                <AlertTitle>Accès ponctuel et audité</AlertTitle>
                <AlertDescription>La pause globale, l'approbation, l'horaire 08:00–20:00 en Suisse, la base légale et l'absence d'opposition seront vérifiés avant de retourner la cible.</AlertDescription>
              </Alert>
              <div>
                <Label htmlFor="manual-reveal-reason">Motif d'accès obligatoire</Label>
                <Textarea id="manual-reveal-reason" className="mt-2 min-h-24" value={manualRevealReason} onChange={(event) => setManualRevealReason(event.target.value)} minLength={8} maxLength={500} placeholder="Exécuter la tâche manuelle approuvée pour cette campagne…" />
                <p className="mt-1 text-xs text-muted-foreground">{manualRevealReason.trim().length}/500 · minimum 8 caractères</p>
              </div>
              <Button type="button" className="w-full" disabled={!canMutateBackend || manualRevealReason.trim().length < 8 || pendingAction === `reveal-manual-${manualDelivery?.id}`} onClick={revealTarget}>
                {pendingAction === `reveal-manual-${manualDelivery?.id}` ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}Vérifier et révéler la cible
              </Button>
            </> : <>
              <Alert className="border-emerald-500/25 bg-emerald-500/5">
                <Eye className="h-4 w-4 text-emerald-600" />
                <AlertTitle>Cible révélée pour cette action</AlertTitle>
                <AlertDescription><code className="mt-2 block break-all rounded bg-background p-3 text-sm font-semibold">{revealedTarget.target}</code><span className="mt-2 block">Cette valeur n'est ni ajoutée au journal, ni conservée dans le snapshot. Fermez la fenêtre dès l'action terminée.</span></AlertDescription>
              </Alert>
              <div>
                <Label>Résultat</Label>
                <Select value={manualOutcome} onValueChange={(value) => setManualOutcome(value as "completed" | "failed")}>
                  <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="completed">Effectué</SelectItem><SelectItem value="failed">Échec</SelectItem></SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="manual-delivery-note">Note de suivi obligatoire</Label>
                <Textarea id="manual-delivery-note" className="mt-2 min-h-28" value={manualNote} onChange={(event) => setManualNote(event.target.value)} maxLength={2_000} placeholder="Résultat de l'appel ou de l'e-mail individuel…" />
                <p className="mt-1 text-xs text-muted-foreground">{manualNote.trim().length}/2000 · minimum 8 caractères</p>
              </div>
            </>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeManualDialog}>Annuler</Button>
            {revealedTarget ? <Button type="button" variant={manualOutcome === "failed" ? "destructive" : "default"} disabled={!canMutateBackend || manualNote.trim().length < 8 || pendingAction === `complete-manual-${manualDelivery?.id}`} onClick={confirmManualCompletion}>Confirmer et journaliser</Button> : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
