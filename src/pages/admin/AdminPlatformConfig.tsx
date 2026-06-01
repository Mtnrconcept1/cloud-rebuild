import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  History,
  Power,
  Rocket,
  Search,
  ShieldCheck,
  Settings2,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  FEATURE_FLAG_GROUP_DESCRIPTIONS,
  FEATURE_FLAG_GROUP_LABELS,
  FEATURE_FLAG_GROUP_ORDER,
  FEATURE_FLAG_PRESETS,
  getFeatureDefinition,
  validateFeatureFlagPreset,
  type FeatureFlag,
  useFeatureFlags,
} from "@/lib/featureFlags";

const CRITICAL_FLAGS = new Set([
  "livraison",
  "emporter",
  "reservation",
  "payment-card",
  "dashboard-restaurateur",
  "espace-livreur",
]);

const GLOBAL_OVERRIDE_FLAGS = new Set([
  "payment-card",
  "payment-twint",
  "payment-postfinance-card",
  "payment-postfinance-efinance",
  "payment-cash",
  "livraison",
  "emporter",
  "sur-place",
  "reservation",
]);

const REQUIRED_PRESET_NAMES = [
  "production stable",
  "maintenance paiements",
  "maintenance livraison",
  "mode lecture seule",
];

function getDependencyLabels(flag: FeatureFlag) {
  return flag.blockedBy
    .filter((dependency) => dependency !== flag.name)
    .map((dependency) => getFeatureDefinition(dependency)?.label || dependency);
}

export default function AdminPlatformConfig() {
  const { toast } = useToast();
  const {
    flags,
    flagAuditLogs,
    loading,
    toggleFlag,
    activateAllFlags,
    applyFeatureFlagPreset,
  } = useFeatureFlags(true);
  const [query, setQuery] = useState("");
  const [pendingToggle, setPendingToggle] = useState<FeatureFlag | null>(null);
  const [pendingReason, setPendingReason] = useState("");
  const [presetReason, setPresetReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredFlags = useMemo(() => {
    if (!normalizedQuery) return flags;
    return flags.filter((flag) => {
      const haystack = [
        flag.label,
        flag.name,
        flag.description,
        ...(flag.routeTargets || []),
      ].join(" ").toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [flags, normalizedQuery]);

  const groupedFlags = useMemo(() => (
    FEATURE_FLAG_GROUP_ORDER
      .map((group) => ({
        group,
        flags: filteredFlags.filter((flag) => flag.group === group),
      }))
      .filter((section) => section.flags.length > 0)
  ), [filteredFlags]);

  const handleToggle = async (flag: FeatureFlag) => {
    const nextExplicitState = !flag.explicitEnabled;
    if (!nextExplicitState && CRITICAL_FLAGS.has(flag.name)) {
      setPendingToggle(flag);
      setPendingReason("");
      return;
    }
    await executeToggle(flag, nextExplicitState ? "Activation depuis la configuration plateforme" : "Desactivation non critique depuis la configuration plateforme");
  };

  const executeToggle = async (flag: FeatureFlag, reason: string) => {
    if (!reason.trim()) {
      toast({
        title: "Raison obligatoire",
        description: "Chaque changement sensible doit etre justifie pour l'historique.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    const result = await toggleFlag(flag.id, reason.trim());
    setSubmitting(false);
    setPendingToggle(null);
    setPendingReason("");

    if (!result.success) {
      toast({
        title: "Erreur",
        description: result.error || "Impossible de modifier la fonctionnalité.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: flag.explicitEnabled ? "Fonctionnalité désactivée" : "Fonctionnalité activée",
      description: `${flag.label} a été mise à jour.`,
    });
  };

  const handleApplyPreset = async (presetName: string) => {
    if (!presetReason.trim()) {
      toast({
        title: "Raison obligatoire",
        description: "Indiquez pourquoi ce preset est applique.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    const result = await applyFeatureFlagPreset(presetName, presetReason.trim());
    setSubmitting(false);

    if (!result.success) {
      toast({
        title: "Preset refuse",
        description: result.error || "Impossible d'appliquer le preset.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Preset applique",
      description: `${presetName} a ete applique et audite.`,
    });
  };

  const handleActivateAll = async () => {
    setSubmitting(true);
    const result = await activateAllFlags();
    setSubmitting(false);

    if (!result.success) {
      toast({
        title: "Erreur",
        description: result.error || "Impossible d'activer tous les flags.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Activation terminée",
      description: "Tous les flags connus sont à nouveau actifs.",
    });
  };

  return (
    <div className="container space-y-6 py-8">
      <DashboardPageHero
        badge="Feature flags"
        title="Configuration plateforme"
        description="Ces toggles s'appliquent globalement. Lorsqu'un flag est coupé ici, l'UI est masquée, la route est protégée et les nouvelles actions backend sont refusées."
        icon={Settings2}
        tone="amber"
        visualLabel="Flags"
        stats={[
          { label: "Flags", value: flags.length, icon: Power },
          { label: "Actifs", value: flags.filter((flag) => flag.effectiveEnabled).length, icon: CheckCircle2 },
          { label: "Critiques", value: flags.filter((flag) => CRITICAL_FLAGS.has(flag.name)).length, icon: AlertTriangle },
        ]}
        actions={(
        <Button onClick={handleActivateAll} disabled={loading || submitting} className="gap-2">
          <Rocket className="h-4 w-4" />
          Tout réactiver
        </Button>
        )}
      />

      <Card>
        <CardContent className="flex flex-col gap-3 py-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher un flag, une route ou un module"
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="gap-1">
              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
              Etat effectif actif
            </Badge>
            <Badge variant="outline" className="gap-1">
              <XCircle className="h-3 w-3 text-destructive" />
              Etat effectif bloqué
            </Badge>
            <Badge variant="outline" className="gap-1">
              <Power className="h-3 w-3 text-primary" />
              Toggle explicite
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
            Presets de gouvernance
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Les presets appliquent plusieurs flags avec validation des dependances, raison obligatoire et audit.
          </p>
        </CardHeader>
        <CardContent className="space-y-4" data-preset-names={REQUIRED_PRESET_NAMES.join(" ")}>
          <Input
            value={presetReason}
            onChange={(event) => setPresetReason(event.target.value)}
            placeholder="Raison obligatoire avant application d'un preset"
          />
          <div className="grid gap-3 lg:grid-cols-2">
            {FEATURE_FLAG_PRESETS.map((preset) => {
              const warnings = validateFeatureFlagPreset(preset, flags);
              return (
                <div key={preset.name} className="rounded-2xl border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-2">
                      <p className="text-sm font-semibold">{preset.label}</p>
                      <p className="text-sm text-muted-foreground">{preset.description}</p>
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-muted-foreground">Routes impactees</p>
                        <div className="flex flex-wrap gap-1">
                          {preset.routes.map((route) => (
                            <Badge key={route} variant="outline">{route}</Badge>
                          ))}
                        </div>
                      </div>
                      {warnings.length > 0 ? (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                          {warnings.join(" ")}
                        </div>
                      ) : null}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void handleApplyPreset(preset.name)}
                      disabled={loading || submitting || !presetReason.trim() || warnings.length > 0}
                    >
                      Appliquer
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        {groupedFlags.map((section) => (
          <Card key={section.group}>
            <CardHeader>
              <CardTitle>{FEATURE_FLAG_GROUP_LABELS[section.group]}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {FEATURE_FLAG_GROUP_DESCRIPTIONS[section.group]}
              </p>
            </CardHeader>
            <CardContent className="grid gap-3 lg:grid-cols-2">
              {section.flags.map((flag) => {
                const dependencyLabels = getDependencyLabels(flag);
                const blockedByDependency = flag.explicitEnabled && !flag.effectiveEnabled && dependencyLabels.length > 0;
                const showGlobalOverride = GLOBAL_OVERRIDE_FLAGS.has(flag.name);

                return (
                  <div key={flag.name} className="rounded-2xl border p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold">{flag.label}</p>
                          {flag.effectiveEnabled ? (
                            <Badge className="bg-emerald-600 text-white">Actif</Badge>
                          ) : (
                            <Badge variant="destructive">Bloque</Badge>
                          )}
                          {!flag.explicitEnabled ? (
                            <Badge variant="secondary">Désactivé explicitement</Badge>
                          ) : null}
                          {blockedByDependency ? (
                            <Badge variant="outline">Désactivé par dependance</Badge>
                          ) : null}
                          {flag.group === "custom" ? (
                            <Badge variant="outline">Custom</Badge>
                          ) : null}
                        </div>
                        <p className="text-sm text-muted-foreground">{flag.description}</p>
                        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <Badge variant="outline">{flag.name}</Badge>
                          {(flag.routeTargets || []).map((routeTarget) => (
                            <Badge key={routeTarget} variant="outline">
                              {routeTarget}
                            </Badge>
                          ))}
                        </div>
                        {blockedByDependency ? (
                          <p className="text-xs text-amber-700">
                            Dependances inactives: {dependencyLabels.join(", ")}.
                          </p>
                        ) : null}
                        {showGlobalOverride ? (
                          <p className="text-xs text-muted-foreground">
                            Override globale: les reglages restaurant correspondants ne peuvent pas re-activer cette
                            fonctionnalité tant que ce flag reste coupe.
                          </p>
                        ) : null}
                      </div>
                      <Switch
                        checked={flag.explicitEnabled}
                        onCheckedChange={() => handleToggle(flag)}
                        disabled={loading || submitting}
                        aria-label={`Basculer ${flag.label}`}
                      />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))}
      </div>

      {!loading && groupedFlags.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Aucun flag ne correspond à votre recherche.
          </CardContent>
        </Card>
      ) : null}

      <AlertDialog open={!!pendingToggle} onOpenChange={(open) => { if (!open) setPendingToggle(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Désactiver {pendingToggle?.label} ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Ce flag est critique. La desactivation est immédiate pour les nouvelles actions, y compris hors UI.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={pendingReason}
            onChange={(event) => setPendingReason(event.target.value)}
            placeholder="Raison obligatoire"
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={submitting || !pendingToggle || !pendingReason.trim()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => pendingToggle && executeToggle(pendingToggle, pendingReason)}
            >
              Confirmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-muted-foreground" />
            Historique
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {flagAuditLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun changement audité récemment.</p>
          ) : (
            flagAuditLogs.slice(0, 20).map((log) => (
              <div key={log.id} className="rounded-xl border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{log.flag_name}</Badge>
                  <Badge variant={log.new_state ? "secondary" : "destructive"}>
                    {log.previous_state === null ? "creation" : `${log.previous_state ? "on" : "off"} -> ${log.new_state ? "on" : "off"}`}
                  </Badge>
                  {log.preset_name ? <Badge variant="outline">{log.preset_name}</Badge> : null}
                </div>
                <p className="mt-2 text-muted-foreground">{log.reason || "Sans raison renseignee"}</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
