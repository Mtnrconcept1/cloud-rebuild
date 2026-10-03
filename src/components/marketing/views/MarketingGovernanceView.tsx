import { AlertTriangle, CheckCircle2, CirclePause, Database, FileCheck2, RefreshCw, ShieldCheck, SlidersHorizontal } from "lucide-react";

import { MarketingEmptyState, MarketingStatusBadge, formatMarketingDate } from "@/components/marketing/MarketingShared";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { MarketingAutopilotDashboard } from "@/marketing/autopilotTypes";
import type { MarketingView } from "@/marketing/types";

function StateCard({ label, value, detail, safe }: { label: string; value: string; detail: string; safe: boolean }) {
  return (
    <Card className={cn("border-border/80", safe && "border-emerald-500/25 bg-emerald-500/5")}>
      <CardContent className="p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p><p className="mt-2 text-xl font-bold">{value}</p></div>{safe ? <ShieldCheck className="h-5 w-5 text-emerald-700 dark:text-emerald-300" /> : <AlertTriangle className="h-5 w-5 text-amber-700 dark:text-amber-300" />}</div><p className="mt-3 text-xs leading-relaxed text-muted-foreground">{detail}</p></CardContent>
    </Card>
  );
}

export default function MarketingGovernanceView({
  autopilot,
  loading,
  error,
  refreshing,
  onRefresh,
  onNavigate,
}: {
  autopilot: MarketingAutopilotDashboard;
  loading: boolean;
  error: string | null;
  refreshing: boolean;
  onRefresh: () => void;
  onNavigate: (view: MarketingView) => void;
}) {
  const governance = autopilot.governance;
  const confirmed = autopilot.source === "backend";
  const safe = governance.externalActionsBlocked && governance.approvalRequired;
  const providerPaused = autopilot.providers.filter((provider) => provider.control.status === "paused").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-700 dark:text-orange-300">Contrôle, décisions et preuve</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Gouvernance Autopilot</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Un tableau de contrôle fail-closed : l'absence de donnée, de décision ou de preuve maintient les connecteurs et actions externes fermés.</p>
        </div>
        <Button type="button" variant="outline" onClick={onRefresh} disabled={refreshing}><RefreshCw className={cn("mr-2 h-4 w-4", refreshing && "animate-spin")} />Actualiser</Button>
      </div>

      {error ? <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Gouvernance non confirmée</AlertTitle><AlertDescription>{error} Le niveau 0, la pause et le blocage externe restent appliqués par défaut.</AlertDescription></Alert> : null}
      {!error && !confirmed && !loading ? <Alert className="border-amber-500/30 bg-amber-500/10"><CirclePause className="h-4 w-4" /><AlertTitle>Mode de repli sûr</AlertTitle><AlertDescription>Aucune donnée serveur confirmée : l'interface n'autorise que la consultation.</AlertDescription></Alert> : null}

      {loading ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-36 rounded-2xl" />)}</div> : (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="État de gouvernance">
          <StateCard label="Autonomie" value={`Niveau ${governance.autonomyLevel}`} detail={governance.autonomyLevel <= 1 ? "Observation ou brouillon uniquement." : "Niveau supérieur signalé ; les actions externes restent malgré tout bloquées dans cette version."} safe={governance.autonomyLevel <= 1} />
          <StateCard label="Approbation" value={governance.approvalRequired ? "Obligatoire" : "Non confirmée"} detail="Une approbation humaine doit précéder toute action externe." safe={governance.approvalRequired} />
          <StateCard label="Actions externes" value={governance.externalActionsBlocked ? "Bloquées" : "État à revoir"} detail="Publication, envoi, impression, achat et dépense ne sont pas exposés par ce cockpit." safe={governance.externalActionsBlocked} />
          <StateCard label="Pause globale" value={governance.globalPaused ? "Active" : "Inactive"} detail="La pause s'ajoute aux contrôles propres à chaque fournisseur." safe={governance.globalPaused} />
        </section>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><SlidersHorizontal className="h-5 w-5 text-orange-600" />Décisions requises</CardTitle><p className="text-sm text-muted-foreground">Ces décisions doivent être enregistrées avant un canari ou une connexion fournisseur.</p></CardHeader>
          <CardContent>
            {governance.missingDecisions.length ? <ol className="space-y-3">{governance.missingDecisions.map((decision, index) => <li key={decision} className="flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-xs font-bold text-amber-900 dark:text-amber-100">{index + 1}</span><span className="pt-1 text-sm">{decision}</span></li>)}</ol> : <MarketingEmptyState title="Aucune décision manquante déclarée" description="Le backend n'a signalé aucun arbitrage ouvert. Cela ne constitue pas une autorisation de publication." />}
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><FileCheck2 className="h-5 w-5 text-violet-600" />Assets et droits</CardTitle></CardHeader><CardContent className="space-y-3"><div className="flex items-end justify-between gap-3"><p className="text-3xl font-bold">{autopilot.assets.withCurrentRights}<span className="text-base font-medium text-muted-foreground">/{autopilot.assets.required}</span></p><MarketingStatusBadge status={autopilot.assets.withCurrentRights >= autopilot.assets.required ? "approved" : "pending"} /></div><p className="text-sm text-muted-foreground">Assets avec droits en cours de validité. {autopilot.assets.approved.toLocaleString("fr-CH")} approuvé(s), {autopilot.assets.pendingRights.toLocaleString("fr-CH")} sans droits courants.</p></CardContent></Card>
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><Database className="h-5 w-5 text-sky-600" />Preuve serveur</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><div className="flex justify-between gap-3"><span className="text-muted-foreground">Source</span><strong>{confirmed ? "Backend confirmé" : "Repli local"}</strong></div><div className="flex justify-between gap-3"><span className="text-muted-foreground">Généré</span><strong>{formatMarketingDate(autopilot.generatedAt)}</strong></div><div className="flex justify-between gap-3"><span className="text-muted-foreground">Politique</span><strong>{governance.policyVersion || "Non fournie"}</strong></div><div className="flex justify-between gap-3"><span className="text-muted-foreground">Revue</span><strong>{formatMarketingDate(governance.reviewedAt)}</strong></div></CardContent></Card>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Contrôles opérationnels</CardTitle><p className="text-sm text-muted-foreground">État consolidé sans action directe chez un fournisseur.</p></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fournisseurs</p><p className="mt-2 text-2xl font-bold">{autopilot.providers.length}</p><p className="mt-1 text-xs text-muted-foreground">{providerPaused} en pause contrôlée</p><Button type="button" variant="link" className="mt-2 h-auto p-0" onClick={() => onNavigate("integrations")}>Ouvrir les intégrations</Button></div>
          <div className="rounded-xl border p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Automatisations</p><p className="mt-2 text-2xl font-bold">{autopilot.automations.length}</p><p className="mt-1 text-xs text-muted-foreground">Simulation et brouillon uniquement</p><Button type="button" variant="link" className="mt-2 h-auto p-0" onClick={() => onNavigate("automations")}>Ouvrir les modèles</Button></div>
          <div className="rounded-xl border p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Analytics</p><p className="mt-2 text-2xl font-bold">{new Intl.NumberFormat("fr-CH", { style: "percent", maximumFractionDigits: 0 }).format(autopilot.analytics.completeness)}</p><p className="mt-1 text-xs text-muted-foreground">Complétude déclarée</p><Button type="button" variant="link" className="mt-2 h-auto p-0" onClick={() => onNavigate("results")}>Voir la provenance</Button></div>
        </CardContent>
      </Card>

      <Alert className={safe ? "border-emerald-500/30 bg-emerald-500/10" : "border-amber-500/30 bg-amber-500/10"}>{safe ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}<AlertTitle>{safe ? "Garde-fous actifs" : "Garde-fous à confirmer"}</AlertTitle><AlertDescription>Même lorsque tous les voyants sont verts, cette version n'expose aucune commande d'envoi, de publication, d'impression, d'achat ou de dépense.</AlertDescription></Alert>
    </div>
  );
}
