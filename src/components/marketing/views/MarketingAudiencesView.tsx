import { useMemo, useState } from "react";
import { Building2, MapPin, RefreshCw, Search, ShieldCheck, Sparkles, Users } from "lucide-react";

import {
  MarketingChannelBadge,
  MarketingEmptyState,
  MarketingPagination,
  MarketingStatusBadge,
  formatMarketingDate,
} from "@/components/marketing/MarketingShared";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { MarketingChannelId, MarketingSnapshot, MarketingView } from "@/marketing/types";
import type { MarketingUrlState } from "@/marketing/useMarketingUrlState";

const PAGE_SIZE = 10;

export default function MarketingAudiencesView({
  snapshot,
  filters,
  canMutateBackend,
  pendingAction,
  onFiltersChange,
  onNavigate,
  onSyncSources,
}: {
  snapshot: MarketingSnapshot;
  filters: MarketingUrlState;
  canMutateBackend: boolean;
  pendingAction: string | null;
  onFiltersChange: (patch: Partial<MarketingUrlState>) => void;
  onNavigate: (view: MarketingView) => void;
  onSyncSources: () => Promise<unknown>;
}) {
  const [tab, setTab] = useState("audiences");
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const query = filters.query.trim().toLowerCase();
  const audiences = useMemo(() => snapshot.audiences.filter((audience) => (
    (!query || `${audience.name} ${audience.location} ${audience.kind}`.toLowerCase().includes(query))
    && (filters.channel === "all" || audience.recommendedChannel === filters.channel)
  )), [filters.channel, query, snapshot.audiences]);
  const prospects = useMemo(() => snapshot.prospects.filter((prospect) => (
    (!query || `${prospect.displayName} ${prospect.city} ${prospect.canton} ${prospect.category} ${prospect.tags.join(" ")}`.toLowerCase().includes(query))
    && (filters.status === "all" || prospect.status === filters.status)
    && (filters.channel === "all" || prospect.recommendedChannel === filters.channel)
  )).sort((left, right) => right.leadScore - left.leadScore), [filters.channel, filters.status, query, snapshot.prospects]);
  const pageProspects = prospects.slice((filters.page - 1) * PAGE_SIZE, filters.page * PAGE_SIZE);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-600">Ciblage responsable</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Audiences & prospects</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Priorisez les segments joignables sans exposer de données personnelles. L'éligibilité finale est toujours recalculée côté serveur au moment du dispatch.</p>
        </div>
        <Button type="button" variant="outline" disabled={!canMutateBackend || pendingAction === "sync-sources"} onClick={() => setSyncDialogOpen(true)}>
          <RefreshCw className={pendingAction === "sync-sources" ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"} />Synchroniser les sources
        </Button>
      </div>

      <Alert className="border-sky-500/25 bg-sky-500/5">
        <ShieldCheck className="h-4 w-4 text-sky-600" />
        <AlertTitle>Minimisation des données</AlertTitle>
        <AlertDescription>Cette vue ne doit afficher que les attributs nécessaires au ciblage. Les regroupements ci-dessous portent sur la première page de 100 contacts maximum ; l'estimation complète est recalculée côté serveur lors de la création.</AlertDescription>
      </Alert>

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-[minmax(12rem,1fr)_12rem_12rem]">
          <label className="relative block">
            <span className="sr-only">Rechercher une audience ou un prospect</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={filters.query} onChange={(event) => onFiltersChange({ query: event.target.value, page: 1 })} placeholder="Segment, ville, canton, catégorie…" className="pl-9" />
          </label>
          <Select value={filters.status} onValueChange={(status) => onFiltersChange({ status, page: 1 })}>
            <SelectTrigger aria-label="Filtrer les prospects par statut"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">Tous les statuts</SelectItem><SelectItem value="new">Nouveaux</SelectItem><SelectItem value="qualified">Qualifiés</SelectItem><SelectItem value="contacted">Contactés</SelectItem><SelectItem value="follow_up">À relancer</SelectItem><SelectItem value="converted">Convertis</SelectItem><SelectItem value="opted_out">Opposition</SelectItem></SelectContent>
          </Select>
          <Select value={filters.channel} onValueChange={(channel) => onFiltersChange({ channel: channel as MarketingChannelId | "all", page: 1 })}>
            <SelectTrigger aria-label="Filtrer par meilleur canal"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">Tous les canaux</SelectItem>{snapshot.channels.map((channel) => <SelectItem key={channel.id} value={channel.id}>{channel.label}</SelectItem>)}</SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={(value) => { setTab(value); onFiltersChange({ page: 1 }); }}>
        <TabsList className="grid h-auto w-full max-w-md grid-cols-2">
          <TabsTrigger value="audiences">Audiences ({audiences.length})</TabsTrigger>
          <TabsTrigger value="prospects">Prospects ({prospects.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="audiences" className="mt-5">
          {audiences.length ? (
            <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              {audiences.map((audience) => (
                <Card key={audience.id} className="min-w-0">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500/10 text-orange-600">{audience.kind === "restaurant" ? <Building2 className="h-5 w-5" /> : <Users className="h-5 w-5" />}</span>
                      <MarketingChannelBadge channel={audience.recommendedChannel} />
                    </div>
                    <CardTitle className="pt-2">{audience.name}</CardTitle>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5" />{audience.location}</p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-muted/30 p-3"><p className="text-xs text-muted-foreground">Profils dans l'aperçu</p><p className="mt-1 text-xl font-bold">{audience.total.toLocaleString("fr-CH")}</p></div><div className="rounded-xl bg-sky-500/10 p-3"><p className="text-xs text-muted-foreground">Éligibilité</p><p className="mt-1 text-sm font-bold text-sky-700 dark:text-sky-300">À estimer côté serveur</p></div></div>
                    {audience.sampleLimited ? <p className="text-xs text-muted-foreground">Aperçu non juridique sur les 100 contacts les plus récents au maximum. Il ne déclare ni taille totale, ni consentement, ni éligibilité.</p> : null}
                    <Button type="button" variant="outline" className="w-full" onClick={() => onNavigate("campaigns")}><Sparkles className="mr-2 h-4 w-4" />Estimer dans une campagne</Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <MarketingEmptyState title="Aucune audience confirmée" description={snapshot.source === "fallback" ? "Le backend est indisponible ; aucun volume ni segment n'est inventé." : "Aucun segment ne correspond à vos filtres."} action={<Button type="button" variant="outline" onClick={() => onNavigate("campaigns")}>Créer un ciblage dynamique</Button>} />
          )}
        </TabsContent>

        <TabsContent value="prospects" className="mt-5">
          <Card>
            <CardContent className="p-0 sm:p-4">
              {pageProspects.length ? (
                <>
                  <Table>
                    <TableHeader><TableRow><TableHead>Prospect</TableHead><TableHead>Localisation</TableHead><TableHead>Contact masqué</TableHead><TableHead>Statut</TableHead><TableHead>Score</TableHead><TableHead>Canal recommandé</TableHead><TableHead>Prochaine action</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {pageProspects.map((prospect) => (
                        <TableRow key={prospect.id}>
                          <TableCell data-label="Prospect"><div className="min-w-0"><p className="truncate font-semibold">{prospect.displayName}</p><p className="truncate text-xs text-muted-foreground">{prospect.category}</p></div></TableCell>
                          <TableCell data-label="Localisation">{prospect.city} · {prospect.canton}</TableCell>
                          <TableCell data-label="Contact masqué"><div className="text-xs"><p>{prospect.emailMasked || "E-mail non disponible"}</p><p className="mt-0.5 text-muted-foreground">{prospect.phoneMasked || "Téléphone non disponible"}</p></div></TableCell>
                          <TableCell data-label="Statut"><MarketingStatusBadge status={prospect.status} /></TableCell>
                          <TableCell data-label="Score"><span className="font-semibold">{prospect.leadScore}/100</span></TableCell>
                          <TableCell data-label="Canal"><MarketingChannelBadge channel={prospect.recommendedChannel} /></TableCell>
                          <TableCell data-label="Prochaine action"><span className="text-sm">{formatMarketingDate(prospect.nextActionAt)}</span></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="px-4 pb-4"><MarketingPagination page={filters.page} pageSize={PAGE_SIZE} total={prospects.length} onPageChange={(page) => onFiltersChange({ page })} /></div>
                </>
              ) : (
                <div className="p-4"><MarketingEmptyState title="Aucun prospect confirmé" description={snapshot.source === "fallback" ? "La source de prospection est indisponible ; aucune entreprise fictive n'est affichée." : "Aucun prospect ne correspond aux filtres."} /></div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={syncDialogOpen} onOpenChange={setSyncDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Synchroniser les sources marketing</DialogTitle>
            <DialogDescription>Importer les références du catalogue restaurants et appliquer les derniers consentements clients enregistrés.</DialogDescription>
          </DialogHeader>
          <Alert className="border-amber-500/25 bg-amber-500/5">
            <ShieldCheck className="h-4 w-4 text-amber-600" />
            <AlertTitle>Oppositions prioritaires</AlertTitle>
            <AlertDescription>La synchronisation peut annuler les traitements en attente pour un client opposé. Le résultat retourné contient uniquement des compteurs, sans donnée personnelle brute.</AlertDescription>
          </Alert>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSyncDialogOpen(false)}>Annuler</Button>
            <Button
              type="button"
              disabled={!canMutateBackend || pendingAction === "sync-sources"}
              onClick={async () => {
                const result = await onSyncSources();
                if (result) setSyncDialogOpen(false);
              }}
            >
              {pendingAction === "sync-sources" ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirmer la synchronisation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
