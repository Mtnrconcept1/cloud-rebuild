import { useMemo, useState } from "react";
import { CheckCircle2, EyeOff, RefreshCw, Search, ShieldCheck } from "lucide-react";

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
import type { MarketingChannelId, MarketingDelivery, MarketingSnapshot } from "@/marketing/types";
import type { MarketingUrlState } from "@/marketing/useMarketingUrlState";

const PAGE_SIZE = 12;

export default function MarketingActivityView({
  snapshot,
  filters,
  canMutateBackend,
  pendingAction,
  onFiltersChange,
  onRetry,
  onCompleteManual,
}: {
  snapshot: MarketingSnapshot;
  filters: MarketingUrlState;
  canMutateBackend: boolean;
  pendingAction: string | null;
  onFiltersChange: (patch: Partial<MarketingUrlState>) => void;
  onRetry: (deliveryId: string) => Promise<unknown>;
  onCompleteManual: (deliveryId: string, outcome: "completed" | "failed", note: string) => Promise<unknown>;
}) {
  const [manualDelivery, setManualDelivery] = useState<MarketingDelivery | null>(null);
  const [manualOutcome, setManualOutcome] = useState<"completed" | "failed">("completed");
  const [manualNote, setManualNote] = useState("");
  const filtered = useMemo(() => {
    const query = filters.query.trim().toLowerCase();
    return snapshot.deliveries
      .filter((delivery) => filters.status === "all" || delivery.status === filters.status)
      .filter((delivery) => filters.channel === "all" || delivery.channel === filters.channel)
      .filter((delivery) => !query || `${delivery.campaignName} ${delivery.targetMasked} ${delivery.provider} ${delivery.errorCode || ""} ${delivery.manualOutcome || ""} ${delivery.manualNote || ""}`.toLowerCase().includes(query))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }, [filters.channel, filters.query, filters.status, snapshot.deliveries]);
  const pageItems = filtered.slice((filters.page - 1) * PAGE_SIZE, filters.page * PAGE_SIZE);

  const closeManualDialog = () => {
    setManualDelivery(null);
    setManualOutcome("completed");
    setManualNote("");
  };

  const confirmManualCompletion = async () => {
    if (!manualDelivery || manualNote.trim().length < 8) return;
    const result = await onCompleteManual(manualDelivery.id, manualOutcome, manualNote.trim());
    if (result) closeManualDialog();
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-600">Traçabilité</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Journal des envois</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Ce qui a été tenté, à quel moment, sur quel canal et avec quel résultat. Les cibles restent masquées dans toutes les réponses frontend.</p>
      </div>

      <Alert className="border-emerald-500/25 bg-emerald-500/5">
        <EyeOff className="h-4 w-4 text-emerald-600" />
        <AlertTitle>Identités protégées</AlertTitle>
        <AlertDescription>Le contrat API expose uniquement <code>target_masked</code>. Aucun e-mail, téléphone ou identifiant personnel brut ne doit parvenir au navigateur.</AlertDescription>
      </Alert>

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-[minmax(12rem,1fr)_12rem_12rem]">
          <label className="relative block"><span className="sr-only">Rechercher dans le journal</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={filters.query} onChange={(event) => onFiltersChange({ query: event.target.value, page: 1 })} placeholder="Campagne, cible masquée, fournisseur…" className="pl-9" /></label>
          <Select value={filters.status} onValueChange={(status) => onFiltersChange({ status, page: 1 })}><SelectTrigger aria-label="Filtrer par statut"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Tous les statuts</SelectItem><SelectItem value="queued">En attente</SelectItem><SelectItem value="processing">Traitement</SelectItem><SelectItem value="retrying">Nouvelle tentative</SelectItem><SelectItem value="sent">Envoyés</SelectItem><SelectItem value="delivered">Distribués</SelectItem><SelectItem value="opened">Ouverts</SelectItem><SelectItem value="clicked">Cliqués</SelectItem><SelectItem value="converted">Convertis</SelectItem><SelectItem value="bounced">Rebonds</SelectItem><SelectItem value="complained">Plaintes</SelectItem><SelectItem value="unsubscribed">Désinscrits</SelectItem><SelectItem value="skipped">Ignorés</SelectItem><SelectItem value="failed">Échecs</SelectItem><SelectItem value="cancelled">Annulés</SelectItem><SelectItem value="blocked_configuration">Bloqués</SelectItem><SelectItem value="manual_required">Action manuelle</SelectItem></SelectContent></Select>
          <Select value={filters.channel} onValueChange={(channel) => onFiltersChange({ channel: channel as MarketingChannelId | "all", page: 1 })}><SelectTrigger aria-label="Filtrer par canal"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Tous les canaux</SelectItem>{snapshot.channels.map((channel) => <SelectItem key={channel.id} value={channel.id}>{channel.label}</SelectItem>)}</SelectContent></Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 sm:p-4">
          {pageItems.length ? (
            <>
              <Table>
                <TableHeader><TableRow><TableHead>Chronologie</TableHead><TableHead>Campagne</TableHead><TableHead>Cible masquée</TableHead><TableHead>Canal</TableHead><TableHead>Statut</TableHead><TableHead>Suivi manuel</TableHead><TableHead>Fournisseur</TableHead><TableHead>Tentative</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
                <TableBody>
                  {pageItems.map((delivery) => (
                    <TableRow key={delivery.id}>
                      <TableCell data-label="Chronologie"><div className="space-y-1 text-xs"><p><span className="text-muted-foreground">Planifié :</span> {formatMarketingDate(delivery.scheduledAt)}</p><p><span className="text-muted-foreground">Envoyé :</span> {formatMarketingDate(delivery.sentAt)}</p><p><span className="text-muted-foreground">Mis à jour :</span> {formatMarketingDate(delivery.updatedAt)}</p></div></TableCell>
                      <TableCell data-label="Campagne"><span className="font-medium">{delivery.campaignName}</span></TableCell>
                      <TableCell data-label="Cible"><code className="rounded bg-muted px-2 py-1 text-xs">{delivery.targetMasked}</code></TableCell>
                      <TableCell data-label="Canal"><MarketingChannelBadge channel={delivery.channel} /></TableCell>
                      <TableCell data-label="Statut"><div><MarketingStatusBadge status={delivery.status} />{delivery.errorCode ? <p className="mt-1 text-[10px] text-rose-600">{delivery.errorCode}</p> : null}</div></TableCell>
                      <TableCell data-label="Suivi manuel">{delivery.manualOutcome || delivery.manualNote ? <div className="max-w-64 space-y-1"><MarketingStatusBadge status={delivery.manualOutcome === "completed" ? "completed" : "failed"} />{delivery.manualNote ? <p className="whitespace-pre-wrap break-words text-xs text-muted-foreground" title={delivery.manualNote}>{delivery.manualNote.length > 240 ? `${delivery.manualNote.slice(0, 240)}…` : delivery.manualNote}</p> : null}</div> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                      <TableCell data-label="Fournisseur">{delivery.provider}</TableCell>
                      <TableCell data-label="Tentative">#{delivery.attempt}</TableCell>
                      <TableCell data-label="Action" className="text-right">
                        {delivery.status === "manual_required" ? (
                          <Button type="button" variant="outline" size="sm" disabled={!canMutateBackend || pendingAction === `complete-manual-${delivery.id}`} onClick={() => setManualDelivery(delivery)}>
                            <CheckCircle2 className="mr-1 h-3.5 w-3.5" />Clôturer
                          </Button>
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
              <div className="px-4 pb-4"><MarketingPagination page={filters.page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={(page) => onFiltersChange({ page })} /></div>
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
            <DialogTitle>Clôturer l'action terrain</DialogTitle>
            <DialogDescription>{manualDelivery ? `${manualDelivery.campaignName} · ${manualDelivery.targetMasked}` : ""}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Résultat</Label>
              <Select value={manualOutcome} onValueChange={(value) => setManualOutcome(value as "completed" | "failed")}>
                <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="completed">Effectué</SelectItem><SelectItem value="failed">Échec</SelectItem></SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="manual-delivery-note">Note de suivi obligatoire</Label>
              <Textarea id="manual-delivery-note" className="mt-2 min-h-28" value={manualNote} onChange={(event) => setManualNote(event.target.value)} maxLength={2_000} placeholder="Résultat de l'appel, de l'e-mail individuel ou de la visite…" />
              <p className="mt-1 text-xs text-muted-foreground">{manualNote.trim().length}/2000 · minimum 8 caractères</p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeManualDialog}>Annuler</Button>
            <Button type="button" variant={manualOutcome === "failed" ? "destructive" : "default"} disabled={!canMutateBackend || manualNote.trim().length < 8 || pendingAction === `complete-manual-${manualDelivery?.id}`} onClick={confirmManualCompletion}>
              Confirmer et journaliser
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
