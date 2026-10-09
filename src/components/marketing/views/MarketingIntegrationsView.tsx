import { useMemo, useState } from "react";
import MarketingMetaConnection from "@/components/marketing/MarketingMetaConnection";
import { Cable, CheckCircle2, KeyRound, PauseCircle, RefreshCw, Search, ServerCog, ShieldCheck, Wrench } from "lucide-react";

import {
  MarketingChannelBadge,
  MarketingEmptyState,
  MarketingStatusBadge,
  formatMarketingDate,
} from "@/components/marketing/MarketingShared";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type {
  MarketingAutopilotDashboard,
  MarketingAutopilotProvider,
  MarketingProviderControlInput,
} from "@/marketing/autopilotTypes";
import type { MarketingIntegration, MarketingSnapshot } from "@/marketing/types";
import type { MarketingUrlState } from "@/marketing/useMarketingUrlState";

export default function MarketingIntegrationsView({
  snapshot,
  filters,
  autopilot,
  autopilotLoading,
  autopilotError,
  autopilotPendingAction,
  onFiltersChange,
  onRefreshAutopilot,
  onSaveProviderControl,
}: {
  snapshot: MarketingSnapshot;
  filters: MarketingUrlState;
  autopilot: MarketingAutopilotDashboard;
  autopilotLoading: boolean;
  autopilotError: string | null;
  autopilotPendingAction: string | null;
  onFiltersChange: (patch: Partial<MarketingUrlState>) => void;
  onRefreshAutopilot: () => void;
  onSaveProviderControl: (input: MarketingProviderControlInput) => Promise<unknown>;
}) {
  const [selectedProvider, setSelectedProvider] = useState<MarketingAutopilotProvider | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<MarketingIntegration | null>(null);
  const [controlStatus, setControlStatus] = useState<MarketingProviderControlInput["status"]>("paused");
  const [controlReason, setControlReason] = useState("");
  const query = filters.query.trim().toLowerCase();
  const providers = useMemo(() => autopilot.providers.filter((provider) => (
    !query || `${provider.label} ${provider.provider} ${provider.category} ${provider.capabilities.join(" ")}`.toLowerCase().includes(query)
  )), [autopilot.providers, query]);
  const channels = useMemo(() => snapshot.integrations.filter((integration) => (
    (filters.status === "all" || integration.status === filters.status)
    && (!query || `${integration.name} ${integration.channel} ${integration.description}`.toLowerCase().includes(query))
  )), [filters.status, query, snapshot.integrations]);

  const openProvider = (provider: MarketingAutopilotProvider) => {
    setSelectedProvider(provider);
    setControlStatus(provider.control.status);
    setControlReason("");
  };

  const saveControl = async () => {
    if (!selectedProvider || controlReason.trim().length < 8) return;
    const result = await onSaveProviderControl({
      provider: selectedProvider.provider,
      status: controlStatus,
      reason: controlReason.trim(),
    });
    if (result !== undefined) {
      setSelectedProvider(null);
      setControlReason("");
    }
  };

  return (
    <div className="space-y-6">
      <MarketingMetaConnection />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-700 dark:text-orange-300">Fournisseurs, puis canaux</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Intégrations</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Un fournisseur technique n'est pas un canal de diffusion. Son état observé, son compte et son contrôle sont présentés séparément des capacités historiques.</p>
        </div>
        <Button type="button" variant="outline" onClick={onRefreshAutopilot} disabled={autopilotLoading || Boolean(autopilotPendingAction)}>
          <RefreshCw className={cn("mr-2 h-4 w-4", autopilotLoading && "animate-spin")} />Actualiser
        </Button>
      </div>

      <Alert className="border-violet-500/25 bg-violet-500/5">
        <KeyRound className="h-4 w-4 text-violet-700 dark:text-violet-300" />
        <AlertTitle>Secrets côté serveur uniquement</AlertTitle>
        <AlertDescription>Aucune clé, aucun jeton OAuth et aucun identifiant sensible ne sont demandés dans le navigateur. Cette vue ne peut qu'enregistrer un état non configuré ou une pause.</AlertDescription>
      </Alert>

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-[minmax(12rem,1fr)_13rem]">
          <label className="relative block"><span className="sr-only">Rechercher un fournisseur ou un canal</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={filters.query} onChange={(event) => onFiltersChange({ query: event.target.value })} placeholder="Fournisseur ou canal…" className="pl-9" /></label>
          <Select value={filters.status} onValueChange={(status) => onFiltersChange({ status })}><SelectTrigger aria-label="Filtrer les canaux par statut"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Tous les états canal</SelectItem><SelectItem value="available">Disponibles</SelectItem><SelectItem value="manual">Manuels</SelectItem><SelectItem value="blocked_configuration">Configuration bloquante</SelectItem><SelectItem value="disconnected">Déconnectés</SelectItem></SelectContent></Select>
        </CardContent>
      </Card>

      <section className="space-y-4" aria-labelledby="provider-heading">
        <div><h2 id="provider-heading" className="text-lg font-semibold">Fournisseurs techniques</h2><p className="text-sm text-muted-foreground">État observé par le backend et contrôle local fail-closed.</p></div>
        {autopilotError ? <Alert variant="destructive"><ServerCog className="h-4 w-4" /><AlertTitle>État fournisseur indisponible</AlertTitle><AlertDescription>{autopilotError} Aucun fournisseur n'est supposé connecté.</AlertDescription></Alert> : null}
        {autopilotLoading ? (
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-64 rounded-2xl" />)}</div>
        ) : providers.length ? (
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {providers.map((provider) => (
              <Card key={provider.provider} className="min-w-0">
                <CardHeader>
                  <div className="flex items-start justify-between gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-700 dark:text-sky-300"><ServerCog className="h-5 w-5" /></span><MarketingStatusBadge status={provider.status} /></div>
                  <CardTitle className="pt-2">{provider.label}</CardTitle>
                  <p className="text-xs text-muted-foreground">{provider.category} · identifiant {provider.provider}</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-2">{provider.capabilities.length ? provider.capabilities.map((capability) => <Badge key={capability} variant="secondary">{capability}</Badge>) : <span className="text-xs text-muted-foreground">Capacités non confirmées</span>}</div>
                  <div className="rounded-xl border bg-muted/20 p-3 text-xs"><p className="text-muted-foreground">Compte</p><p className="mt-1 font-medium">{provider.accountLabel || "Non confirmé"}</p><p className="mt-2 text-muted-foreground">Dernière vérification</p><p className="mt-1 font-medium">{formatMarketingDate(provider.lastCheckedAt)}</p></div>
                  {provider.statusReason ? <p className="text-xs text-muted-foreground">{provider.statusReason}</p> : null}
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-amber-950 dark:text-amber-100">Contrôle</p><p className="mt-1 text-sm">{provider.control.status === "paused" ? "En pause" : "Non configuré"}</p></div><ShieldCheck className="h-5 w-5 text-amber-700 dark:text-amber-300" /></div>
                  <Button type="button" variant="outline" className="w-full" disabled={autopilot.source !== "backend" || Boolean(autopilotPendingAction)} onClick={() => openProvider(provider)}><PauseCircle className="mr-2 h-4 w-4" />Gérer le blocage</Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : <MarketingEmptyState title="Aucun fournisseur confirmé" description="Le backend n'a retourné aucun fournisseur correspondant. Aucun connecteur fictif n'est affiché." />}
      </section>

      <section className="space-y-4 border-t pt-6" aria-labelledby="channel-heading">
        <div><h2 id="channel-heading" className="text-lg font-semibold">Canaux et capacités historiques</h2><p className="text-sm text-muted-foreground">Disponibilité métier existante, indépendante du fournisseur utilisé.</p></div>
        {channels.length ? (
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {channels.map((integration) => (
              <Card key={integration.id} className="min-w-0">
                <CardHeader><div className="flex items-start justify-between gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-700 dark:text-sky-300">{integration.status === "manual" ? <Wrench className="h-5 w-5" /> : <Cable className="h-5 w-5" />}</span><MarketingStatusBadge status={integration.status} /></div><CardTitle className="pt-2">{integration.name}</CardTitle><div><MarketingChannelBadge channel={integration.channel} /></div></CardHeader>
                <CardContent className="space-y-4"><p className="min-h-10 text-sm leading-relaxed text-muted-foreground">{integration.description}</p><div className="rounded-xl border bg-muted/20 p-3 text-xs"><p className="text-muted-foreground">Dernière vérification</p><p className="mt-1 font-medium">{formatMarketingDate(integration.lastCheckedAt)}</p></div><Button type="button" variant="outline" className="w-full" onClick={() => setSelectedChannel(integration)}><Wrench className="mr-2 h-4 w-4" />Voir la checklist</Button></CardContent>
              </Card>
            ))}
          </div>
        ) : <MarketingEmptyState title="Aucun canal" description="Aucune capacité historique ne correspond aux filtres." />}
      </section>

      <Dialog open={Boolean(selectedProvider)} onOpenChange={(open) => { if (!open) setSelectedProvider(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Contrôle de {selectedProvider?.label}</DialogTitle><DialogDescription>Seuls les états fail-closed sont autorisés. Cette action ne connecte pas le fournisseur.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div><Label htmlFor="provider-control-status">État de contrôle</Label><Select value={controlStatus} onValueChange={(value) => setControlStatus(value as MarketingProviderControlInput["status"])}><SelectTrigger id="provider-control-status" className="mt-2"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="paused">En pause</SelectItem><SelectItem value="unconfigured">Non configuré</SelectItem></SelectContent></Select></div>
            <div><Label htmlFor="provider-control-reason">Motif journalisé</Label><Textarea id="provider-control-reason" className="mt-2" value={controlReason} onChange={(event) => setControlReason(event.target.value)} maxLength={400} placeholder="Minimum 8 caractères…" /><p className="mt-1 text-xs text-muted-foreground">{controlReason.trim().length}/400 · minimum 8 caractères</p></div>
            <Alert className="border-amber-500/30 bg-amber-500/10"><ShieldCheck className="h-4 w-4" /><AlertTitle>Actions externes bloquées</AlertTitle><AlertDescription>Ce dialogue ne peut ni connecter, ni publier, ni dépenser.</AlertDescription></Alert>
          </div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setSelectedProvider(null)}>Annuler</Button><Button type="button" disabled={!selectedProvider || controlReason.trim().length < 8 || Boolean(autopilotPendingAction)} onClick={() => void saveControl()}>{autopilotPendingAction?.startsWith("provider:") ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : null}Enregistrer le contrôle</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(selectedChannel)} onOpenChange={(open) => { if (!open) setSelectedChannel(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{selectedChannel?.name}</DialogTitle><DialogDescription>{selectedChannel?.description}</DialogDescription></DialogHeader>
          {selectedChannel ? <div className="space-y-4"><div className="flex flex-wrap gap-2"><MarketingChannelBadge channel={selectedChannel.channel} /><MarketingStatusBadge status={selectedChannel.status} /></div><div className="space-y-3 rounded-2xl border p-4"><p className="text-sm font-semibold">Checklist serveur</p>{["Sélectionner le compte officiel", "Configurer OAuth/API côté serveur", "Stocker les secrets hors du navigateur", "Valider les permissions minimales", "Tester en environnement isolé"].map((item) => <div key={item} className="flex items-start gap-2 text-sm"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><span>{item}</span></div>)}</div></div> : null}
          <DialogFooter><Button type="button" variant="outline" onClick={() => setSelectedChannel(null)}>Fermer</Button><Button type="button" disabled>Connexion serveur requise</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
