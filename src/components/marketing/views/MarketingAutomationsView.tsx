import { useState } from "react";
import {
  Bot,
  CalendarClock,
  CirclePause,
  Clock3,
  FlaskConical,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";

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
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  MARKETING_AUTOMATION_TEMPLATES,
  type MarketingAutomationSimulation,
  type MarketingAutomationTemplateKey,
  type MarketingAutopilotDashboard,
} from "@/marketing/autopilotTypes";
import type {
  MarketingAutomationDraft,
  MarketingChannelId,
  MarketingSnapshot,
} from "@/marketing/types";

const EMPTY_AUTOMATION: MarketingAutomationDraft = {
  name: "",
  description: "",
  trigger: "",
  action: "",
  channel: "manual_call",
  status: "paused",
};

const ACCENTS: Record<string, string> = {
  orange: "border-orange-500/25 bg-orange-500/5 text-orange-700 dark:text-orange-300",
  rose: "border-rose-500/25 bg-rose-500/5 text-rose-700 dark:text-rose-300",
  emerald: "border-emerald-500/25 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300",
  violet: "border-violet-500/25 bg-violet-500/5 text-violet-700 dark:text-violet-300",
  sky: "border-sky-500/25 bg-sky-500/5 text-sky-700 dark:text-sky-300",
  blue: "border-blue-500/25 bg-blue-500/5 text-blue-700 dark:text-blue-300",
  amber: "border-amber-500/25 bg-amber-500/5 text-amber-800 dark:text-amber-200",
  slate: "border-slate-500/25 bg-slate-500/5 text-slate-700 dark:text-slate-300",
};

function nullableCount(value: number | null, suffix = "") {
  return value === null ? "Indisponible" : `${value.toLocaleString("fr-CH")}${suffix}`;
}

export default function MarketingAutomationsView({
  snapshot,
  canMutateBackend,
  pendingAction,
  autopilot,
  autopilotLoading,
  autopilotError,
  autopilotPendingAction,
  simulation,
  onRefreshAutopilot,
  onSimulate,
  onPrepareDraft,
  onClearSimulation,
  onSave,
}: {
  snapshot: MarketingSnapshot;
  canMutateBackend: boolean;
  pendingAction: string | null;
  autopilot: MarketingAutopilotDashboard;
  autopilotLoading: boolean;
  autopilotError: string | null;
  autopilotPendingAction: string | null;
  simulation: MarketingAutomationSimulation | null;
  onRefreshAutopilot: () => void;
  onSimulate: (templateKey: MarketingAutomationTemplateKey) => Promise<unknown>;
  onPrepareDraft: (reason: string) => Promise<unknown>;
  onClearSimulation: () => void;
  onSave: (draft: MarketingAutomationDraft) => Promise<unknown>;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<MarketingAutomationDraft>(EMPTY_AUTOMATION);
  const [draftReason, setDraftReason] = useState("");
  const valid = draft.name.trim().length >= 3
    && draft.description.trim().length >= 12
    && draft.trigger.trim().length >= 3
    && draft.action.trim().length >= 3;
  const customAutomations = snapshot.automations.filter((automation) => !automation.isSystem);
  const canUseAutopilot = autopilot.source === "backend" && !autopilotLoading;

  const save = async () => {
    if (!valid || !canMutateBackend) return;
    const result = await onSave({ ...draft, status: "paused" });
    if (result) {
      setDialogOpen(false);
      setDraft(EMPTY_AUTOMATION);
    }
  };

  const closeSimulation = () => {
    setDraftReason("");
    onClearSimulation();
  };

  const prepareDraft = async () => {
    const result = await onPrepareDraft(draftReason);
    if (result) setDraftReason("");
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-700 dark:text-orange-300">Cockpit Autopilot</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Automatisations TOK</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Huit modèles bornés : chaque parcours commence par une simulation et ne peut produire qu'un brouillon. Aucun envoi, publication, impression, achat ou dépense n'est disponible ici.</p>
        </div>
        <Button type="button" variant="outline" onClick={onRefreshAutopilot} disabled={autopilotLoading || Boolean(autopilotPendingAction)}>
          <RefreshCw className={cn("mr-2 h-4 w-4", autopilotLoading && "animate-spin")} />
          Actualiser le cockpit
        </Button>
      </div>

      <Alert className="border-amber-500/30 bg-amber-500/10">
        <ShieldCheck className="h-4 w-4 text-amber-700 dark:text-amber-300" />
        <AlertTitle>Simulation puis brouillon uniquement</AlertTitle>
        <AlertDescription>Les huit modèles sont désactivés par défaut. La validation finale et l'action chez un fournisseur restent hors de ce flux.</AlertDescription>
      </Alert>

      {autopilotError ? (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Cockpit indisponible</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{autopilotError} Toutes les actions restent bloquées.</span>
            <Button type="button" variant="outline" size="sm" onClick={onRefreshAutopilot}>Réessayer</Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {autopilotLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label="Chargement des modèles Autopilot">
          {Array.from({ length: 8 }, (_, index) => <Skeleton key={index} className="h-64 rounded-2xl" />)}
        </div>
      ) : (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label="Huit modèles d'automatisation TOK">
          {MARKETING_AUTOMATION_TEMPLATES.map((template) => {
            const configured = autopilot.automations.find((automation) => automation.templateKey === template.key);
            const actionPending = autopilotPendingAction === `simulate:${template.key}`;
            return (
              <Card key={template.key} data-testid={`autopilot-template-${template.key}`} className="flex min-w-0 flex-col border-border/80">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <span className={cn("flex h-11 w-11 items-center justify-center rounded-2xl border", ACCENTS[template.accent])}><Sparkles className="h-5 w-5" aria-hidden="true" /></span>
                    <MarketingStatusBadge status={configured?.status || "disabled"} />
                  </div>
                  <CardTitle className="pt-2 text-base">{template.label}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-4">
                  <p className="flex-1 text-sm leading-relaxed text-muted-foreground">{template.summary}</p>
                  {configured?.blockedReasons.length ? <p className="line-clamp-2 text-xs text-rose-800 dark:text-rose-200">Bloqué : {configured.blockedReasons.join(" · ")}</p> : <p className="text-xs text-muted-foreground">Dernière simulation : {formatMarketingDate(configured?.lastSimulationAt)}</p>}
                  <Button type="button" variant="outline" disabled={!canUseAutopilot || Boolean(autopilotPendingAction)} onClick={() => void onSimulate(template.key)} aria-label={`Simuler le modèle ${template.label}`}>
                    {actionPending ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <FlaskConical className="mr-2 h-4 w-4" />}
                    Simuler
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </section>
      )}

      <Card className="border-emerald-500/20 bg-emerald-500/5">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"><CalendarClock className="h-6 w-6" /></span>
          <div className="min-w-0 flex-1"><p className="font-semibold">Planificateur historique</p><p className="mt-1 text-sm text-muted-foreground">Il reste séparé des modèles Autopilot et ne traite que les éléments déjà approuvés, éligibles et configurés.</p></div>
          <MarketingStatusBadge status={!snapshot.overview.schedulerReady ? "blocked_configuration" : snapshot.overview.globalPaused ? "paused" : "active"} />
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="text-lg font-semibold">Règles personnalisées historiques</h2><p className="text-sm text-muted-foreground">Elles restent créées en pause et sans moteur d'exécution.</p></div>
        <Button type="button" onClick={() => setDialogOpen(true)}><Plus className="mr-2 h-4 w-4" />Nouvelle règle en pause</Button>
      </div>

      {snapshot.overview.globalPaused ? <Alert className="border-amber-500/25 bg-amber-500/5"><CirclePause className="h-4 w-4 text-amber-700 dark:text-amber-300" /><AlertTitle>Pause globale active</AlertTitle><AlertDescription>Les règles peuvent être préparées, mais leur activation et leur exécution restent interdites.</AlertDescription></Alert> : null}

      {customAutomations.length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {customAutomations.map((automation) => {
            const channel = snapshot.channels.find((item) => item.id === automation.channel);
            const channelBlocked = !channel || !["available", "manual"].includes(channel.availability);
            return (
              <Card key={automation.id} className="min-w-0">
                <CardHeader>
                  <div className="flex min-w-0 items-start justify-between gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-700 dark:text-violet-300"><Workflow className="h-5 w-5" /></span><div className="flex items-center gap-3"><MarketingStatusBadge status={automation.status} /><Switch checked={false} disabled aria-label={`Moteur à connecter pour ${automation.name}`} /></div></div>
                  <CardTitle className="pt-2">{automation.name}</CardTitle><p className="text-sm leading-relaxed text-muted-foreground">{automation.description}</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl border bg-muted/20 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Déclencheur</p><p className="mt-1 text-sm">{automation.trigger}</p></div><div className="rounded-xl border bg-muted/20 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Action</p><p className="mt-1 text-sm">{automation.action}</p></div></div>
                  <div className="flex items-center justify-between gap-3"><MarketingChannelBadge channel={automation.channel} />{channel ? <MarketingStatusBadge status={channel.availability} /> : null}</div>
                  <p className="flex items-start gap-2 rounded-xl bg-amber-500/10 p-3 text-xs text-amber-950 dark:text-amber-100"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />Moteur à connecter : cette règle reste inexécutable.</p>
                  {channelBlocked ? <p className="flex items-start gap-2 rounded-xl bg-rose-500/10 p-3 text-xs text-rose-900 dark:text-rose-100"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />Canal indisponible en plus du moteur absent.</p> : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <MarketingEmptyState title="Aucune règle personnalisée confirmée" description={snapshot.source === "fallback" ? "Le backend est indisponible ; aucune règle fictive n'est affichée." : "Vous pouvez préparer une règle, qui restera en pause."} action={<Button type="button" variant="outline" onClick={() => setDialogOpen(true)}><Bot className="mr-2 h-4 w-4" />Préparer une règle</Button>} />
      )}

      <Dialog open={Boolean(simulation)} onOpenChange={(open) => { if (!open) closeSimulation(); }}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>Résultat de simulation</DialogTitle><DialogDescription>Aucun effet externe n'a été produit. Vérifiez exclusions, coûts et alertes avant de préparer un brouillon.</DialogDescription></DialogHeader>
          {simulation ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Éligibles</p><p className="mt-1 font-semibold">{nullableCount(simulation.eligibleCount)}</p></div><div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Exclus</p><p className="mt-1 font-semibold">{nullableCount(simulation.excludedCount)}</p></div><div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Coût estimé</p><p className="mt-1 font-semibold">{nullableCount(simulation.estimatedCostChf, " CHF")}</p></div></div>
              {simulation.blockedReasons.length ? <Alert variant="destructive"><ShieldAlert className="h-4 w-4" /><AlertTitle>Simulation bloquée</AlertTitle><AlertDescription>{simulation.blockedReasons.join(" · ")}</AlertDescription></Alert> : null}
              {simulation.warnings.length ? <Alert className="border-amber-500/30 bg-amber-500/10"><ShieldAlert className="h-4 w-4" /><AlertTitle>Points à contrôler</AlertTitle><AlertDescription>{simulation.warnings.join(" · ")}</AlertDescription></Alert> : null}
              {simulation.sampleOutputs.length ? <div><p className="text-sm font-semibold">Exemples de sortie</p><ul className="mt-2 space-y-2">{simulation.sampleOutputs.map((sample, index) => <li key={`${index}-${sample}`} className="rounded-xl border bg-muted/20 p-3 text-sm">{sample}</li>)}</ul></div> : null}
              <p className="rounded-xl border bg-muted/20 p-3 text-sm text-muted-foreground">Le brouillon réutilisera strictement la clé et l'entrée de cette simulation. Le motif est journalisé séparément ; il ne modifie pas le hash simulé.</p>
              <div><Label htmlFor="autopilot-draft-reason">Motif du brouillon</Label><Textarea id="autopilot-draft-reason" value={draftReason} onChange={(event) => setDraftReason(event.target.value)} className="mt-2" maxLength={500} placeholder="Pourquoi ce brouillon doit-il être préparé ?" /><p className="mt-1 text-xs text-muted-foreground">{draftReason.trim().length}/500 · minimum 8 caractères</p></div>
            </div>
          ) : null}
          <DialogFooter><Button type="button" variant="outline" onClick={closeSimulation}>Fermer</Button><Button type="button" disabled={!simulation?.id || simulation.status === "blocked" || draftReason.trim().length < 8 || Boolean(autopilotPendingAction)} onClick={() => void prepareDraft()}>{autopilotPendingAction === "prepare-draft" ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}Préparer le brouillon</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader><DialogTitle>Nouvelle règle historique</DialogTitle><DialogDescription>Elle sera enregistrée en pause et restera inexécutable tant qu'un moteur de règles n'est pas connecté.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div><Label htmlFor="automation-name">Nom</Label><Input id="automation-name" className="mt-2" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} maxLength={100} /></div>
            <div><Label htmlFor="automation-description">Description et garde-fous</Label><Textarea id="automation-description" className="mt-2" value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} maxLength={500} /></div>
            <div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="automation-trigger">Déclencheur</Label><Input id="automation-trigger" className="mt-2" value={draft.trigger} onChange={(event) => setDraft((current) => ({ ...current, trigger: event.target.value }))} maxLength={160} /></div><div><Label htmlFor="automation-action">Action</Label><Input id="automation-action" className="mt-2" value={draft.action} onChange={(event) => setDraft((current) => ({ ...current, action: event.target.value }))} maxLength={160} /></div></div>
            <div><Label>Canal</Label><Select value={draft.channel} onValueChange={(channel) => setDraft((current) => ({ ...current, channel: channel as MarketingChannelId }))}><SelectTrigger className="mt-2"><SelectValue /></SelectTrigger><SelectContent>{snapshot.channels.map((channel) => <SelectItem key={channel.id} value={channel.id}>{channel.label} · {channel.availability}</SelectItem>)}</SelectContent></Select></div>
            <Alert><Clock3 className="h-4 w-4" /><AlertTitle>État initial : pause</AlertTitle><AlertDescription>Aucune exécution ne démarrera lors de l'enregistrement.</AlertDescription></Alert>
          </div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button><Button type="button" disabled={!canMutateBackend || !valid || pendingAction === "save-automation"} onClick={() => void save()}>Enregistrer en pause</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
