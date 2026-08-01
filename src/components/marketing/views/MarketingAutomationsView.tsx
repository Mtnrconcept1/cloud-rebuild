import { useState } from "react";
import { Bot, CalendarClock, CirclePause, Clock3, Plus, ShieldAlert, Workflow } from "lucide-react";

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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
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
  channel: "manual_visit",
  status: "paused",
};

export default function MarketingAutomationsView({
  snapshot,
  canMutateBackend,
  pendingAction,
  onSave,
}: {
  snapshot: MarketingSnapshot;
  canMutateBackend: boolean;
  pendingAction: string | null;
  onSave: (draft: MarketingAutomationDraft) => Promise<unknown>;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<MarketingAutomationDraft>(EMPTY_AUTOMATION);
  const valid = draft.name.trim().length >= 3
    && draft.description.trim().length >= 12
    && draft.trigger.trim().length >= 3
    && draft.action.trim().length >= 3;
  const customAutomations = snapshot.automations.filter((automation) => !automation.isSystem);

  const save = async () => {
    if (!valid || !canMutateBackend) return;
    const result = await onSave({ ...draft, status: "paused" });
    if (result) {
      setDialogOpen(false);
      setDraft(EMPTY_AUTOMATION);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-600">Orchestration sûre</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Automatisations</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Transformez des signaux en brouillons ou tâches. Une nouvelle règle est toujours créée en pause et ne peut jamais contourner la pause globale.</p>
        </div>
        <Button type="button" onClick={() => setDialogOpen(true)}><Plus className="mr-2 h-4 w-4" />Nouvelle règle</Button>
      </div>

      {snapshot.overview.globalPaused ? (
        <Alert className="border-amber-500/25 bg-amber-500/5">
          <CirclePause className="h-4 w-4 text-amber-600" />
          <AlertTitle>Pause globale active</AlertTitle>
          <AlertDescription>Les règles peuvent être préparées, mais leur activation et leur exécution restent interdites jusqu'à la levée de la pause.</AlertDescription>
        </Alert>
      ) : null}

      <Card className="border-emerald-500/20 bg-emerald-500/5">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"><CalendarClock className="h-6 w-6" /></span>
          <div className="min-w-0 flex-1"><p className="font-semibold">Planificateur calendrier</p><p className="mt-1 text-sm text-muted-foreground">Seule automatisation opérationnelle : le cron traite à l'heure prévue les éléments approuvés, éligibles et configurés.</p></div>
          <MarketingStatusBadge status={
            !snapshot.overview.schedulerReady
              ? "blocked_configuration"
              : snapshot.overview.globalPaused
                ? "paused"
                : "active"
          } />
        </CardContent>
      </Card>

      {customAutomations.length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {customAutomations.map((automation) => {
            const channel = snapshot.channels.find((item) => item.id === automation.channel);
            const channelBlocked = !channel || !["available", "manual"].includes(channel.availability);
            return (
              <Card key={automation.id} className="min-w-0">
                <CardHeader>
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-600 dark:text-violet-300"><Workflow className="h-5 w-5" /></span>
                    <div className="flex items-center gap-3"><MarketingStatusBadge status={automation.status} /><Switch checked={false} disabled aria-label={`Moteur à connecter pour ${automation.name}`} /></div>
                  </div>
                  <CardTitle className="pt-2">{automation.name}</CardTitle>
                  <p className="text-sm leading-relaxed text-muted-foreground">{automation.description}</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Si</p><p className="mt-1 text-sm font-medium">{automation.trigger}</p></div>
                    <div className="rounded-xl border p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Alors</p><p className="mt-1 text-sm font-medium">{automation.action}</p></div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3"><MarketingChannelBadge channel={automation.channel} />{channel ? <MarketingStatusBadge status={channel.availability} /> : null}</div>
                  <p className="flex items-start gap-2 rounded-xl bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />Moteur de règles à connecter : cette automatisation reste configurable en brouillon ou en pause, sans exécution.</p>
                  {channelBlocked ? <p className="flex items-start gap-2 rounded-xl bg-rose-500/10 p-3 text-xs text-rose-700 dark:text-rose-300"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />Canal indisponible en plus du moteur absent.</p> : null}
                  <div className="grid grid-cols-2 gap-3 border-t pt-4 text-xs text-muted-foreground"><div><p>Dernière exécution</p><p className="mt-1 font-medium text-foreground">{formatMarketingDate(automation.lastRunAt)}</p></div><div><p>Prochaine exécution</p><p className="mt-1 font-medium text-foreground">{formatMarketingDate(automation.nextRunAt)}</p></div></div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground"><span>{automation.runs.toLocaleString("fr-CH")} exécutions</span><span>{automation.errors.toLocaleString("fr-CH")} erreurs</span></div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <MarketingEmptyState title="Aucune automatisation confirmée" description={snapshot.source === "fallback" ? "Le backend est indisponible ; aucune règle fictive n'est affichée." : "Créez une première règle. Elle sera enregistrée en pause."} action={<Button type="button" variant="outline" onClick={() => setDialogOpen(true)}><Bot className="mr-2 h-4 w-4" />Préparer une règle</Button>} />
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader><DialogTitle>Nouvelle automatisation</DialogTitle><DialogDescription>La règle sera enregistrée en pause et restera inexécutable tant qu'un moteur de règles n'est pas connecté.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div><Label htmlFor="automation-name">Nom</Label><Input id="automation-name" className="mt-2" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} maxLength={100} placeholder="Ex. Relance après démonstration" /></div>
            <div><Label htmlFor="automation-description">Description et garde-fous</Label><Textarea id="automation-description" className="mt-2" value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} maxLength={500} placeholder="Expliquez ce que fait la règle et ce qu'elle ne doit jamais faire…" /></div>
            <div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="automation-trigger">Déclencheur</Label><Input id="automation-trigger" className="mt-2" value={draft.trigger} onChange={(event) => setDraft((current) => ({ ...current, trigger: event.target.value }))} maxLength={160} placeholder="Prospect qualifié" /></div><div><Label htmlFor="automation-action">Action</Label><Input id="automation-action" className="mt-2" value={draft.action} onChange={(event) => setDraft((current) => ({ ...current, action: event.target.value }))} maxLength={160} placeholder="Créer une tâche" /></div></div>
            <div><Label>Canal</Label><Select value={draft.channel} onValueChange={(channel) => setDraft((current) => ({ ...current, channel: channel as MarketingChannelId }))}><SelectTrigger className="mt-2"><SelectValue /></SelectTrigger><SelectContent>{snapshot.channels.map((channel) => <SelectItem key={channel.id} value={channel.id}>{channel.label} · {channel.availability}</SelectItem>)}</SelectContent></Select></div>
            <Alert><Clock3 className="h-4 w-4" /><AlertTitle>État initial : pause</AlertTitle><AlertDescription>Aucune exécution ne démarrera lors de l'enregistrement.</AlertDescription></Alert>
          </div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button><Button type="button" disabled={!canMutateBackend || !valid || pendingAction === "save-automation"} onClick={save}>Enregistrer en pause</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
