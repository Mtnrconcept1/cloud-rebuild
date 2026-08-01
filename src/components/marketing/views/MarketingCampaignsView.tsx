import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CalendarClock, CheckCircle2, Megaphone, Plus, Search, ShieldCheck } from "lucide-react";

import {
  MarketingChannelBadge,
  MarketingEmptyState,
  MarketingPagination,
  MarketingStatusBadge,
  formatMarketingDate,
  formatMarketingPercent,
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
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  isPublicMarketingChannel,
  type MarketingAudienceKind,
  type MarketingAudienceEstimate,
  type MarketingCampaign,
  type MarketingCampaignDraft,
  type MarketingChannelId,
  type MarketingSnapshot,
} from "@/marketing/types";
import type { MarketingUrlState } from "@/marketing/useMarketingUrlState";
import { marketingZurichLocalDateTimeToIso } from "@/marketing/zurichTime";

const PAGE_SIZE = 8;
const CANTONS = ["CH", "GE", "VD", "VS", "FR", "NE", "JU", "BE", "ZH", "BS", "LU", "AG", "SG", "TI"];
const CHANNEL_PRIORITY: Record<MarketingAudienceKind, MarketingChannelId[]> = {
  client: ["in_app", "push", "email", "tok_news"],
  restaurant: ["manual_call", "manual_email", "tok_news"],
  mixed: ["in_app", "manual_call", "email", "manual_email", "tok_news"],
};

type WizardState = {
  name: string;
  objective: string;
  message: string;
  audienceId: string;
  audienceKind: MarketingAudienceKind;
  canton: string;
  channels: MarketingChannelId[];
  startsAt: string;
  endsAt: string;
};

const EMPTY_WIZARD: WizardState = {
  name: "",
  objective: "",
  message: "",
  audienceId: "",
  audienceKind: "restaurant",
  canton: "CH",
  channels: [],
  startsAt: "",
  endsAt: "",
};

export default function MarketingCampaignsView({
  snapshot,
  filters,
  canMutateBackend,
  savePending,
  pendingAction,
  onFiltersChange,
  onSave,
  onApprove,
  onRecommendChannels,
}: {
  snapshot: MarketingSnapshot;
  filters: MarketingUrlState;
  canMutateBackend: boolean;
  savePending: boolean;
  pendingAction: string | null;
  onFiltersChange: (patch: Partial<MarketingUrlState>) => void;
  onSave: (draft: MarketingCampaignDraft) => Promise<{ complete: boolean } | null | undefined>;
  onApprove: (campaignId: string, reason: string) => Promise<unknown>;
  onRecommendChannels: (
    audienceFilter: Record<string, unknown>,
    channels: MarketingChannelId[],
  ) => Promise<MarketingAudienceEstimate | undefined>;
}) {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [wizard, setWizard] = useState<WizardState>(EMPTY_WIZARD);
  const [approvalCampaign, setApprovalCampaign] = useState<MarketingCampaign | null>(null);
  const [approvalReason, setApprovalReason] = useState("");
  const [clientRequestId, setClientRequestId] = useState<string>(crypto.randomUUID());
  const [channelRecommendation, setChannelRecommendation] = useState<{
    audienceKey: string;
    channel: MarketingChannelId;
    eligible: number;
    volumes: MarketingAudienceEstimate["byChannel"];
  } | null>(null);
  const filtered = useMemo(() => {
    const query = filters.query.trim().toLowerCase();
    return snapshot.campaigns
      .filter((campaign) => (
        filters.status === "all"
        || (filters.status === "approved" ? Boolean(campaign.approvedAt) : campaign.status === filters.status)
      ))
      .filter((campaign) => !query || `${campaign.name} ${campaign.objective} ${campaign.audienceName}`.toLowerCase().includes(query))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }, [filters.query, filters.status, snapshot.campaigns]);
  const pageItems = filtered.slice((filters.page - 1) * PAGE_SIZE, filters.page * PAGE_SIZE);
  const selectableChannels = snapshot.channels.filter((channel) => ["available", "manual"].includes(channel.availability));
  const selectedAudience = snapshot.audiences.find((audience) => audience.id === wizard.audienceId);
  const selectedAudienceKind = selectedAudience?.kind || wizard.audienceKind;
  const selectedLocation = selectedAudience?.location || wizard.canton;
  const currentAudienceFilter: Record<string, unknown> = {
    audience_kind: selectedAudienceKind,
    ...(selectedLocation !== "CH" ? { canton: selectedLocation } : {}),
  };
  const audienceKey = JSON.stringify(currentAudienceFilter);
  const recommendedChannel = channelRecommendation?.audienceKey === audienceKey
    ? channelRecommendation.channel
    : undefined;
  const recommendationReason = selectedAudienceKind === "client"
    ? "Priorité aux canaux internes gratuits, puis push, e-mail et actualité TOK selon disponibilité confirmée."
    : selectedAudienceKind === "restaurant"
      ? "Priorité au contact humain joignable, puis visite, e-mail individuel et actualité TOK."
      : "Ordre mixte : canal interne disponible, contact humain, puis alternatives gratuites confirmées.";
  const parsedStartsAt = wizard.startsAt ? marketingZurichLocalDateTimeToIso(wizard.startsAt) : null;
  const parsedEndsAt = wizard.endsAt ? marketingZurichLocalDateTimeToIso(wizard.endsAt) : null;
  const scheduleValid = Boolean(
    parsedStartsAt
    && (!wizard.endsAt || (parsedEndsAt && parsedEndsAt >= parsedStartsAt)),
  );

  const stepValid = step === 1
    ? wizard.name.trim().length >= 3 && wizard.objective.trim().length >= 12 && wizard.message.trim().length >= 20
    : step === 2
      ? Boolean(wizard.audienceId || wizard.audienceKind)
      : step === 3
        ? wizard.channels.length > 0
        : true;

  const toggleChannel = (channel: MarketingChannelId) => {
    setWizard((current) => ({
      ...current,
      channels: current.channels.includes(channel)
        ? current.channels.filter((item) => item !== channel)
        : [...current.channels, channel],
    }));
  };

  const continueWizard = async () => {
    if (step !== 2) {
      setStep((value) => value + 1);
      return;
    }
    if (channelRecommendation?.audienceKey === audienceKey) {
      setStep(3);
      return;
    }
    const estimate = await onRecommendChannels(
      currentAudienceFilter,
      selectableChannels.map((channel) => channel.id),
    );
    if (!estimate) return;
    const priorities = CHANNEL_PRIORITY[selectedAudienceKind];
    const serverAvailable = (channel: MarketingChannelId) => ["available", "manual"].includes(
      estimate.availabilityByChannel[channel] || "blocked_configuration",
    );
    const individual = priorities.find((channel) => (
      !isPublicMarketingChannel(channel)
      && serverAvailable(channel)
      && (estimate.byChannel[channel] ?? 0) > 0
    ));
    const publicFallback = priorities.find((channel) => (
      isPublicMarketingChannel(channel) && serverAvailable(channel)
    ));
    const channel = individual || publicFallback;
    if (!channel) return;
    setChannelRecommendation({
      audienceKey,
      channel,
      eligible: isPublicMarketingChannel(channel) ? estimate.total : estimate.byChannel[channel] || 0,
      volumes: estimate.byChannel,
    });
    setWizard((current) => ({ ...current, channels: [channel] }));
    setStep(3);
  };

  const closeWizard = () => {
    setWizardOpen(false);
    setStep(1);
    setWizard(EMPTY_WIZARD);
    setChannelRecommendation(null);
    setClientRequestId(crypto.randomUUID());
  };

  const save = async () => {
    if (!canMutateBackend || savePending) return;
    if (!parsedStartsAt) return;
    const audienceName = selectedAudience?.name
      || `${wizard.audienceKind === "restaurant" ? "Restaurants" : wizard.audienceKind === "client" ? "Clients" : "Audience mixte"} · ${wizard.canton}`;
    const result = await onSave({
      clientRequestId,
      name: wizard.name.trim(),
      objective: wizard.objective.trim(),
      message: wizard.message.trim(),
      audienceId: wizard.audienceId || `dynamic:${wizard.audienceKind}:${wizard.canton}`,
      audienceName,
      audienceFilter: {
        audience_kind: selectedAudience?.kind || wizard.audienceKind,
        ...((selectedAudience?.location || wizard.canton) !== "CH"
          ? { canton: selectedAudience?.location || wizard.canton }
          : {}),
      },
      channels: wizard.channels,
      startsAt: parsedStartsAt,
      endsAt: parsedEndsAt,
      status: "draft",
      requiresApproval: true,
    });
    if (result?.complete === true) closeWizard();
  };

  const approve = async () => {
    if (!approvalCampaign || approvalReason.trim().length < 8) return;
    const result = await onApprove(approvalCampaign.id, approvalReason.trim());
    if (result) {
      setApprovalCampaign(null);
      setApprovalReason("");
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-600">Campaign Studio</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Campagnes d'acquisition</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Chaque création commence en brouillon, avec approbation humaine obligatoire et canaux filtrés par disponibilité réelle.</p>
        </div>
        <Button type="button" onClick={() => setWizardOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Créer une campagne
        </Button>
      </div>

      {!canMutateBackend ? (
        <Alert className="border-amber-500/25 bg-amber-500/5">
          <ShieldCheck className="h-4 w-4 text-amber-600" />
          <AlertTitle>Création verrouillée</AlertTitle>
          <AlertDescription>Vous pouvez examiner le parcours, mais aucun brouillon ne sera enregistré tant que le backend marketing n'est pas disponible.</AlertDescription>
        </Alert>
      ) : null}

      <Alert className="border-sky-500/25 bg-sky-500/5">
        <ShieldCheck className="h-4 w-4 text-sky-600" />
        <AlertTitle>Séquence de validation</AlertTitle>
        <AlertDescription>1. Enregistrer la campagne et ses éléments en brouillon · 2. Approuver la campagne avec un motif · 3. Approuver et planifier chaque élément calendrier. Aucun de ces gestes ne déclenche un envoi immédiat.</AlertDescription>
      </Alert>

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-[minmax(12rem,1fr)_12rem]">
          <label className="relative block">
            <span className="sr-only">Rechercher une campagne</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={filters.query} onChange={(event) => onFiltersChange({ query: event.target.value, page: 1 })} placeholder="Nom, objectif, audience…" className="pl-9" />
          </label>
          <Select value={filters.status} onValueChange={(status) => onFiltersChange({ status, page: 1 })}>
            <SelectTrigger aria-label="Filtrer les campagnes par statut"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value="draft">Brouillons</SelectItem>
              <SelectItem value="approved">Approuvées</SelectItem>
              <SelectItem value="scheduled">Planifiées</SelectItem>
              <SelectItem value="active">Actives</SelectItem>
              <SelectItem value="paused">En pause</SelectItem>
              <SelectItem value="completed">Terminées</SelectItem>
              <SelectItem value="cancelled">Annulées</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {pageItems.length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {pageItems.map((campaign) => {
            const deliveryRate = campaign.sent ? campaign.delivered / campaign.sent : 0;
            return (
              <Card key={campaign.id} className="min-w-0 overflow-hidden">
                <CardHeader className="space-y-3">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0"><CardTitle className="truncate">{campaign.name}</CardTitle><p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{campaign.objective}</p></div>
                    <MarketingStatusBadge status={campaign.status} />
                  </div>
                  <div className="flex flex-wrap gap-2">{campaign.channels.map((channel) => <MarketingChannelBadge key={channel} channel={channel} />)}</div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-xl border bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">Audience</p>
                    <p className="mt-1 truncate text-sm font-semibold">{campaign.audienceName}</p>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div><p className="text-lg font-bold">{campaign.sent.toLocaleString("fr-CH")}</p><p className="text-[10px] text-muted-foreground">envoyés</p></div>
                    <div><p className="text-lg font-bold">{campaign.delivered.toLocaleString("fr-CH")}</p><p className="text-[10px] text-muted-foreground">distribués</p></div>
                    <div><p className="text-lg font-bold">{campaign.clicked.toLocaleString("fr-CH")}</p><p className="text-[10px] text-muted-foreground">clics</p></div>
                    <div><p className="text-lg font-bold">{campaign.conversions.toLocaleString("fr-CH")}</p><p className="text-[10px] text-muted-foreground">conversions</p></div>
                  </div>
                  <div><div className="mb-2 flex items-center justify-between text-xs"><span className="text-muted-foreground">Distribution</span><span className="font-semibold">{formatMarketingPercent(deliveryRate)}</span></div><Progress value={deliveryRate * 100} className="h-2" /></div>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
                    <span>{campaign.startsAt ? `Début ${formatMarketingDate(campaign.startsAt)}` : "Date à définir"}</span>
                    <span>Mis à jour {formatMarketingDate(campaign.updatedAt)}</span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                    <MarketingStatusBadge status={campaign.approvedAt ? "approved" : "pending"} />
                    {!campaign.approvedAt && campaign.status === "draft" ? <Button type="button" size="sm" variant="outline" disabled={!canMutateBackend || pendingAction === `approve-campaign-${campaign.id}`} onClick={() => setApprovalCampaign(campaign)}><ShieldCheck className="mr-2 h-4 w-4" />Approuver la campagne</Button> : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
          <div className="xl:col-span-2"><MarketingPagination page={filters.page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={(page) => onFiltersChange({ page })} /></div>
        </div>
      ) : (
        <MarketingEmptyState title="Aucune campagne confirmée" description={snapshot.source === "fallback" ? "Le backend est indisponible ; aucune campagne fictive n'est affichée." : "Créez un brouillon ou modifiez les filtres actuels."} action={<Button type="button" variant="outline" onClick={() => setWizardOpen(true)}><Plus className="mr-2 h-4 w-4" />Ouvrir le studio</Button>} />
      )}

      <Dialog open={wizardOpen} onOpenChange={(open) => { if (!open) closeWizard(); else setWizardOpen(true); }}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nouvelle campagne · étape {step}/4</DialogTitle>
            <DialogDescription>{["Objectif et identité", "Audience et territoire", "Canaux éligibles", "Calendrier et validation"][step - 1]}</DialogDescription>
          </DialogHeader>
          <Progress value={step * 25} className="h-2" />

          {step === 1 ? (
            <div className="space-y-4">
              <div><Label htmlFor="campaign-name">Nom de campagne</Label><Input id="campaign-name" className="mt-2" value={wizard.name} onChange={(event) => setWizard((current) => ({ ...current, name: event.target.value }))} maxLength={100} placeholder="Ex. Ouverture restaurants Lausanne" /></div>
              <div><Label htmlFor="campaign-objective">Objectif mesurable</Label><Textarea id="campaign-objective" className="mt-2 min-h-28" value={wizard.objective} onChange={(event) => setWizard((current) => ({ ...current, objective: event.target.value }))} maxLength={500} placeholder="Décrivez le résultat attendu et la conversion suivie…" /></div>
              <div><Label htmlFor="campaign-message">Contenu / message</Label><Textarea id="campaign-message" className="mt-2 min-h-32" value={wizard.message} onChange={(event) => setWizard((current) => ({ ...current, message: event.target.value }))} maxLength={1600} placeholder="Rédigez le message source qui sera adapté à chaque canal…" /><p className="mt-1 text-xs text-muted-foreground">{wizard.message.trim().length}/1600 · minimum 20 caractères</p></div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-4">
              {snapshot.audiences.length ? (
                <div><Label>Aperçu calculé sur 100 contacts maximum</Label><Select value={wizard.audienceId || "dynamic"} onValueChange={(audienceId) => setWizard((current) => ({ ...current, audienceId: audienceId === "dynamic" ? "" : audienceId }))}><SelectTrigger className="mt-2"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="dynamic">Ciblage dynamique</SelectItem>{snapshot.audiences.map((audience) => <SelectItem key={audience.id} value={audience.id}>{audience.name} · {audience.total.toLocaleString("fr-CH")} profils aperçus</SelectItem>)}</SelectContent></Select><p className="mt-1 text-xs text-muted-foreground">Cet aperçu ne déclare aucune éligibilité. La taille complète sera calculée par la RPC d'estimation avant enregistrement.</p></div>
              ) : null}
              {!wizard.audienceId ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div><Label>Population</Label><Select value={wizard.audienceKind} onValueChange={(audienceKind) => setWizard((current) => ({ ...current, audienceKind: audienceKind as MarketingAudienceKind }))}><SelectTrigger className="mt-2"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="restaurant">Restaurants</SelectItem><SelectItem value="client">Clients</SelectItem><SelectItem value="mixed">Mixte</SelectItem></SelectContent></Select></div>
                  <div><Label>Canton</Label><Select value={wizard.canton} onValueChange={(canton) => setWizard((current) => ({ ...current, canton }))}><SelectTrigger className="mt-2"><SelectValue /></SelectTrigger><SelectContent>{CANTONS.map((canton) => <SelectItem key={canton} value={canton}>{canton === "CH" ? "Toute la Suisse" : canton}</SelectItem>)}</SelectContent></Select></div>
                </div>
              ) : null}
              <Alert><ShieldCheck className="h-4 w-4" /><AlertTitle>Éligibilité calculée côté serveur</AlertTitle><AlertDescription>Consentement, oppositions, joignabilité et déduplication seront appliqués avant tout dispatch.</AlertDescription></Alert>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-3">
              <Alert className="border-violet-500/25 bg-violet-500/5">
                <ShieldCheck className="h-4 w-4 text-violet-600" />
                <AlertTitle>Recommandation déterministe · sans ML</AlertTitle>
                <AlertDescription>
                  {recommendedChannel && channelRecommendation ? <>
                    Canal préconisé : <strong>{snapshot.channels.find((channel) => channel.id === recommendedChannel)?.label}</strong> · {channelRecommendation.eligible.toLocaleString("fr-CH")} contact(s) ou profils correspondants selon le mode du canal. {recommendationReason} Les volumes viennent de l'estimation serveur ; vous pouvez librement ajuster la sélection.
                    <span className="mt-1 block text-xs">Volumes individuels : {CHANNEL_PRIORITY[selectedAudienceKind].filter((channel) => !isPublicMarketingChannel(channel)).map((channel) => `${snapshot.channels.find((item) => item.id === channel)?.label || channel} ${channelRecommendation.volumes[channel] ?? 0}`).join(" · ")}</span>
                  </> : "La recommandation sera calculée côté serveur avant cette étape."}
                </AlertDescription>
              </Alert>
              {snapshot.channels.map((channel) => {
                const selectable = ["available", "manual"].includes(channel.availability);
                const selected = wizard.channels.includes(channel.id);
                return (
                  <button key={channel.id} type="button" aria-pressed={selected} disabled={!selectable} onClick={() => toggleChannel(channel.id)} className={cn("flex w-full min-w-0 items-center gap-3 rounded-2xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400", selected && "border-orange-500 bg-orange-500/5", !selectable && "cursor-not-allowed opacity-55")}>
                    <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border", selected ? "border-orange-500 bg-orange-500 text-white" : "bg-muted")}>{selected ? <CheckCircle2 className="h-4 w-4" /> : <Megaphone className="h-4 w-4" />}</span>
                    <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{channel.label}</span><span className="mt-1 block text-xs text-muted-foreground">{channel.reason}</span></span>
                    <MarketingStatusBadge status={channel.availability} />
                  </button>
                );
              })}
              {!selectableChannels.length ? <p className="text-sm text-rose-600">Aucun canal n'est actuellement éligible.</p> : null}
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div><Label htmlFor="campaign-start">Début souhaité</Label><Input id="campaign-start" type="datetime-local" className="mt-2" value={wizard.startsAt} onChange={(event) => setWizard((current) => ({ ...current, startsAt: event.target.value }))} /></div>
                <div><Label htmlFor="campaign-end">Fin souhaitée</Label><Input id="campaign-end" type="datetime-local" className="mt-2" value={wizard.endsAt} onChange={(event) => setWizard((current) => ({ ...current, endsAt: event.target.value }))} /></div>
              </div>
              {!scheduleValid && wizard.startsAt ? <p className="text-sm text-rose-600">Horaire suisse invalide, inexistant lors d'un changement d'heure, ou fin antérieure au début.</p> : null}
              <div className="rounded-2xl border bg-muted/20 p-4">
                <p className="font-semibold">{wizard.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">{wizard.objective}</p>
                <div className="mt-3 flex flex-wrap gap-2">{wizard.channels.map((channel) => <MarketingChannelBadge key={channel} channel={channel} />)}</div>
              </div>
              <Alert className="border-emerald-500/25 bg-emerald-500/5"><CheckCircle2 className="h-4 w-4 text-emerald-600" /><AlertTitle>Enregistrement en brouillon</AlertTitle><AlertDescription>Aucune diffusion ne démarre à cette étape. Une approbation séparée reste obligatoire.</AlertDescription></Alert>
            </div>
          ) : null}

          <DialogFooter className="mt-2">
            {step > 1 ? <Button type="button" variant="outline" onClick={() => setStep((value) => value - 1)}><ArrowLeft className="mr-2 h-4 w-4" />Retour</Button> : <Button type="button" variant="outline" onClick={closeWizard}>Annuler</Button>}
            {step < 4 ? <Button type="button" disabled={!stepValid || pendingAction === "recommend-channels"} onClick={continueWizard}>{pendingAction === "recommend-channels" ? "Estimation…" : "Continuer"}<ArrowRight className="ml-2 h-4 w-4" /></Button> : <Button type="button" disabled={!canMutateBackend || savePending || !wizard.channels.length || !scheduleValid} onClick={save}><CalendarClock className="mr-2 h-4 w-4" />Créer campagne + calendrier</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(approvalCampaign)} onOpenChange={(open) => { if (!open) { setApprovalCampaign(null); setApprovalReason(""); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Approuver la campagne</DialogTitle><DialogDescription>{approvalCampaign?.name} · Cette étape autorise seulement l'approbation future de ses éléments calendrier.</DialogDescription></DialogHeader>
          <div><Label htmlFor="campaign-approval-reason">Motif de l'approbation</Label><Textarea id="campaign-approval-reason" className="mt-2" value={approvalReason} onChange={(event) => setApprovalReason(event.target.value)} maxLength={400} placeholder="Minimum 8 caractères, conservé dans l'audit…" /></div>
          <Alert><ShieldCheck className="h-4 w-4" /><AlertTitle>Aucun envoi immédiat</AlertTitle><AlertDescription>Après cette approbation, chaque publication devra encore être approuvée et planifiée depuis le calendrier.</AlertDescription></Alert>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setApprovalCampaign(null)}>Annuler</Button><Button type="button" disabled={!canMutateBackend || approvalReason.trim().length < 8 || pendingAction === `approve-campaign-${approvalCampaign?.id}`} onClick={approve}>Approuver et journaliser</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
