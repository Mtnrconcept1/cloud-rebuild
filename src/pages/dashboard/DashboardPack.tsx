import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Package, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";

import DashboardLayout from "@/components/DashboardLayout";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSupabase } from "@/integrations/supabase/client";
import { useDashboardRestaurant } from "./useDashboardRestaurant";

const supabase = getSupabase();

type FairGrowthModuleRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  monthly_base_cents: number | null;
  variable_fee_bps: number | null;
  successful_reservation_fee_cents: number | null;
  payment_cost_passthrough: boolean;
  value_guarantee_days: number;
  value_guarantee_multiplier: number;
  availability_status: "available" | "pilot" | "coming_soon";
};

type PaidModuleRow = {
  module_id: string;
  status: "requested" | "trialing" | "active" | "paused" | "cancelled" | "credit_due";
  measured_value_cents: number;
  credit_amount_cents: number;
  evaluation_ends_at: string | null;
};

function formatChfFromCents(cents: number) {
  return (cents / 100).toLocaleString("fr-CH", { style: "currency", currency: "CHF" });
}

function modulePrice(module: FairGrowthModuleRow) {
  const parts: string[] = [];
  if (module.monthly_base_cents != null) {
    parts.push(formatChfFromCents(module.monthly_base_cents) + " / mois");
  }
  if (module.variable_fee_bps != null) {
    parts.push((module.variable_fee_bps / 100).toLocaleString("fr-CH") + "%");
  }
  if (module.successful_reservation_fee_cents != null) {
    parts.push(formatChfFromCents(module.successful_reservation_fee_cents) + " / réservation réussie");
  }
  if (module.payment_cost_passthrough) parts.push("coût de paiement");
  return parts.join(" + ");
}

function statusLabel(status: PaidModuleRow["status"] | undefined) {
  if (!status) return "Sur demande";
  return {
    requested: "Activation demandée",
    trialing: "En évaluation",
    active: "Actif",
    paused: "En pause",
    cancelled: "Désactivé",
    credit_due: "Crédit à traiter",
  }[status];
}

export default function DashboardPack() {
  const { selectedId, isDemoMode } = useDashboardRestaurant();
  const queryClient = useQueryClient();
  const [requestingSlug, setRequestingSlug] = useState<string | null>(null);

  const modulesQuery = useQuery({
    queryKey: ["fair-growth-modules"],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("fair_growth_modules")
        .select("id, slug, name, description, monthly_base_cents, variable_fee_bps, successful_reservation_fee_cents, payment_cost_passthrough, value_guarantee_days, value_guarantee_multiplier, availability_status")
        .eq("is_active", true)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data || []) as FairGrowthModuleRow[];
    },
  });

  const subscriptionsQuery = useQuery({
    queryKey: ["restaurant-paid-modules", selectedId],
    enabled: Boolean(selectedId),
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("restaurant_paid_modules")
        .select("module_id, status, measured_value_cents, credit_amount_cents, evaluation_ends_at")
        .eq("restaurant_id", selectedId);
      if (error) throw error;
      return (data || []) as PaidModuleRow[];
    },
  });

  const subscriptionsByModule = new Map(
    (subscriptionsQuery.data || []).map((subscription) => [subscription.module_id, subscription]),
  );

  const requestModule = async (module: FairGrowthModuleRow) => {
    if (!selectedId || requestingSlug || isDemoMode) return;
    setRequestingSlug(module.slug);
    try {
      const { error } = await (supabase.rpc as any)("request_fair_growth_module", {
        p_restaurant_id: selectedId,
        p_module_slug: module.slug,
      });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["restaurant-paid-modules", selectedId] });
      toast.success("Demande enregistrée", {
        description: "TOK vérifiera le moyen de paiement et la date d'activation avant toute facturation.",
      });
    } catch (error) {
      toast.error("Activation impossible", {
        description: error instanceof Error ? error.message : "Réessayez dans un instant.",
      });
    } finally {
      setRequestingSlug(null);
    }
  };

  const isLoading = modulesQuery.isLoading || subscriptionsQuery.isLoading;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <DashboardPageHero
          badge="Fair Growth"
          title="Modules de croissance"
          description="Activez uniquement les outils qui créent une valeur mesurable pour votre établissement."
          icon={Package}
          tone="violet"
          visualLabel="Modules"
          stats={[
            { label: "Garantie", value: "3× en 90 jours", icon: ShieldCheck },
            { label: "Activation", value: isDemoMode ? "Bloquée en démo" : "Sans débit immédiat", icon: Check },
            { label: "Pilotage", value: "À la carte", icon: Sparkles },
          ]}
        />

        {isDemoMode ? (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="p-5 text-sm">
              Le catalogue reste consultable dans le restaurant Démo, mais aucune demande
              d’activation ni facturation ne peut être créée depuis cet espace.
            </CardContent>
          </Card>
        ) : null}

        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="flex gap-3 p-5">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <p className="text-sm">
              <strong>Garantie de valeur.</strong> Après activation facturée, si un module ne produit pas
              au moins trois fois son coût pendant sa fenêtre d'évaluation de 90 jours, TOK recommande
              sa désactivation ou accorde un crédit après validation des données. La demande n'active pas
              le module et n'autorise aucun débit : TOK confirme d'abord le périmètre, le prix et la date de début.
            </p>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Chargement des modules…
          </div>
        ) : modulesQuery.isError ? (
          <Card><CardContent className="p-6 text-sm text-muted-foreground">Le catalogue est temporairement indisponible.</CardContent></Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {(modulesQuery.data || []).map((module) => {
              const subscription = subscriptionsByModule.get(module.id);
              const pending = requestingSlug === module.slug;
              const canRequest = !isDemoMode && (!subscription || subscription.status === "cancelled");

              return (
                <Card key={module.id} className="flex h-full flex-col">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <CardTitle className="text-lg">{module.name}</CardTitle>
                      <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-medium">
                        {subscription
                          ? statusLabel(subscription.status)
                          : module.availability_status === "pilot"
                            ? "Pilote · sur demande"
                            : statusLabel(undefined)}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{module.description}</p>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col gap-4">
                    <p className="text-xl font-bold">{modulePrice(module)}</p>
                    <p className="text-xs text-muted-foreground">
                      {module.availability_status === "pilot"
                        ? "Fonction pilote soumise à validation technique et contractuelle ; aucune activation automatique."
                        : "Activation manuelle après validation par TOK ; aucun débit lors de la demande."}
                    </p>
                    {subscription ? (
                      <div className="rounded-xl bg-muted/60 p-3 text-xs">
                        <p><strong>Statut :</strong> {statusLabel(subscription.status)}</p>
                        {subscription.evaluation_ends_at ? (
                          <p>Évaluation jusqu'au {new Date(subscription.evaluation_ends_at).toLocaleDateString("fr-CH")}.</p>
                        ) : null}
                        {subscription.measured_value_cents > 0 ? (
                          <p>Valeur mesurée : {formatChfFromCents(subscription.measured_value_cents)}.</p>
                        ) : null}
                      </div>
                    ) : null}
                    <Button
                      className="mt-auto w-full"
                      variant={canRequest ? "default" : "outline"}
                      disabled={!canRequest || pending}
                      onClick={() => requestModule(module)}
                    >
                      {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      {isDemoMode
                        ? "Indisponible en démonstration"
                        : canRequest
                          ? module.availability_status === "pilot"
                            ? "Demander l'accès pilote"
                            : "Demander l'activation"
                          : statusLabel(subscription?.status)}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
