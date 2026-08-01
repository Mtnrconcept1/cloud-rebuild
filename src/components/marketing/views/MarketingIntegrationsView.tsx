import { useMemo, useState } from "react";
import { Cable, CheckCircle2, ExternalLink, KeyRound, Search, ServerCog, ShieldCheck, Wrench } from "lucide-react";

import {
  MarketingChannelBadge,
  MarketingEmptyState,
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
import type { MarketingIntegration, MarketingSnapshot } from "@/marketing/types";
import type { MarketingUrlState } from "@/marketing/useMarketingUrlState";

export default function MarketingIntegrationsView({
  snapshot,
  filters,
  onFiltersChange,
}: {
  snapshot: MarketingSnapshot;
  filters: MarketingUrlState;
  onFiltersChange: (patch: Partial<MarketingUrlState>) => void;
}) {
  const [selected, setSelected] = useState<MarketingIntegration | null>(null);
  const filtered = useMemo(() => {
    const query = filters.query.trim().toLowerCase();
    return snapshot.integrations.filter((integration) => (
      (filters.status === "all" || integration.status === filters.status)
      && (!query || `${integration.name} ${integration.channel} ${integration.description}`.toLowerCase().includes(query))
    ));
  }, [filters.query, filters.status, snapshot.integrations]);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-600">Connecteurs & API</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Intégrations</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">État réel des canaux. Les secrets restent exclusivement dans les variables serveur ou le coffre-fort, jamais dans le navigateur.</p>
      </div>

      <Alert className="border-violet-500/25 bg-violet-500/5">
        <KeyRound className="h-4 w-4 text-violet-600" />
        <AlertTitle>Secrets côté serveur uniquement</AlertTitle>
        <AlertDescription>Cette interface ne demande et n'affiche aucune clé API. La connexion doit passer par une Edge Function OAuth ou un secret administré, puis être confirmée par le backend.</AlertDescription>
      </Alert>

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-[minmax(12rem,1fr)_13rem]">
          <label className="relative block"><span className="sr-only">Rechercher une intégration</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={filters.query} onChange={(event) => onFiltersChange({ query: event.target.value })} placeholder="Fournisseur ou canal…" className="pl-9" /></label>
          <Select value={filters.status} onValueChange={(status) => onFiltersChange({ status })}><SelectTrigger aria-label="Filtrer les intégrations par statut"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Tous les états</SelectItem><SelectItem value="available">Disponibles</SelectItem><SelectItem value="manual">Manuels</SelectItem><SelectItem value="blocked_configuration">Configuration bloquante</SelectItem><SelectItem value="disconnected">Déconnectés</SelectItem></SelectContent></Select>
        </CardContent>
      </Card>

      {filtered.length ? (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {filtered.map((integration) => (
            <Card key={integration.id} className="min-w-0">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-600 dark:text-sky-300">{integration.status === "manual" ? <Wrench className="h-5 w-5" /> : <Cable className="h-5 w-5" />}</span>
                  <MarketingStatusBadge status={integration.status} />
                </div>
                <CardTitle className="pt-2">{integration.name}</CardTitle>
                <div><MarketingChannelBadge channel={integration.channel} /></div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="min-h-10 text-sm leading-relaxed text-muted-foreground">{integration.description}</p>
                <div className="rounded-xl border bg-muted/20 p-3 text-xs"><p className="text-muted-foreground">Dernière vérification</p><p className="mt-1 font-medium">{formatMarketingDate(integration.lastCheckedAt)}</p>{integration.configuredAt ? <p className="mt-1 text-emerald-600">Configuré {formatMarketingDate(integration.configuredAt)}</p> : null}</div>
                <Button type="button" variant="outline" className="w-full" onClick={() => setSelected(integration)}>{integration.status === "manual" ? <Wrench className="mr-2 h-4 w-4" /> : <ServerCog className="mr-2 h-4 w-4" />}{integration.actionLabel}</Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <MarketingEmptyState title="Aucune intégration" description="Aucun connecteur ne correspond aux filtres. Les capacités statiques devraient rester visibles même lorsque le backend est indisponible." />
      )}

      <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{selected?.name}</DialogTitle><DialogDescription>{selected?.description}</DialogDescription></DialogHeader>
          {selected ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2"><MarketingChannelBadge channel={selected.channel} /><MarketingStatusBadge status={selected.status} /></div>
              <div className="space-y-3 rounded-2xl border p-4">
                <p className="text-sm font-semibold">Checklist de connexion</p>
                {["Créer ou sélectionner le compte fournisseur officiel", "Configurer OAuth/API dans une Edge Function", "Stocker les secrets côté serveur", "Valider les webhooks et permissions minimales", "Lancer un test isolé puis vérifier le journal"].map((item) => <div key={item} className="flex items-start gap-2 text-sm"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><span>{item}</span></div>)}
              </div>
              {selected.status === "manual" ? <p className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">Ce canal crée uniquement une action humaine. Il ne déclenche jamais d'appel, de visite ou d'e-mail automatiquement.</p> : <p className="rounded-xl bg-sky-500/10 p-3 text-sm text-sky-800 dark:text-sky-200">La connexion sera disponible après ajout du flux OAuth/API serveur. Aucun secret ne peut être saisi dans ce dialogue.</p>}
            </div>
          ) : null}
          <DialogFooter><Button type="button" variant="outline" onClick={() => setSelected(null)}>Fermer</Button><Button type="button" disabled><ExternalLink className="mr-2 h-4 w-4" />Connexion serveur requise</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <p className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" />Un connecteur n'est affiché comme disponible qu'après confirmation backend explicite.</p>
    </div>
  );
}
