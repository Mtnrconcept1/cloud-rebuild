import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Power,
  Rocket,
  Search,
  Settings2,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  getFeatureDefinition,
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

function getDependencyLabels(flag: FeatureFlag) {
  return flag.blockedBy
    .filter((dependency) => dependency !== flag.name)
    .map((dependency) => getFeatureDefinition(dependency)?.label || dependency);
}

export default function AdminPlatformConfig() {
  const { toast } = useToast();
  const { flags, loading, toggleFlag, activateAllFlags } = useFeatureFlags(true);
  const [query, setQuery] = useState("");
  const [pendingToggle, setPendingToggle] = useState<FeatureFlag | null>(null);
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
      return;
    }
    await executeToggle(flag);
  };

  const executeToggle = async (flag: FeatureFlag) => {
    setSubmitting(true);
    const result = await toggleFlag(flag.id);
    setSubmitting(false);
    setPendingToggle(null);

    if (!result.success) {
      toast({
        title: "Erreur",
        description: result.error || "Impossible de modifier la fonctionnalite.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: flag.explicitEnabled ? "Fonctionnalite desactivee" : "Fonctionnalite activee",
      description: `${flag.label} a ete mise a jour.`,
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
      title: "Activation terminee",
      description: "Tous les flags connus sont a nouveau actifs.",
    });
  };

  return (
    <div className="container space-y-6 py-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Settings2 className="h-6 w-6 text-primary" />
            <h1 className="font-display text-3xl font-bold">Configuration plateforme</h1>
          </div>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Ces toggles s'appliquent globalement. Lorsqu'un flag est coupe ici, l'UI est masquee, la route est
            protegee et les nouvelles actions backend sont refusees.
          </p>
        </div>
        <Button onClick={handleActivateAll} disabled={loading || submitting} className="gap-2">
          <Rocket className="h-4 w-4" />
          Tout reactiver
        </Button>
      </div>

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
              Etat effectif bloque
            </Badge>
            <Badge variant="outline" className="gap-1">
              <Power className="h-3 w-3 text-primary" />
              Toggle explicite
            </Badge>
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
                            <Badge variant="secondary">Desactive explicitement</Badge>
                          ) : null}
                          {blockedByDependency ? (
                            <Badge variant="outline">Desactive par dependance</Badge>
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
                            fonctionnalite tant que ce flag reste coupe.
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
            Aucun flag ne correspond a votre recherche.
          </CardContent>
        </Card>
      ) : null}

      <AlertDialog open={!!pendingToggle} onOpenChange={(open) => { if (!open) setPendingToggle(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Desactiver {pendingToggle?.label} ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Ce flag est critique. La desactivation est immediate pour les nouvelles actions, y compris hors UI.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={submitting || !pendingToggle}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => pendingToggle && executeToggle(pendingToggle)}
            >
              Confirmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
