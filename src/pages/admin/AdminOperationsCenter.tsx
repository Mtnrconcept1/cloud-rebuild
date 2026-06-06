import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Activity, CreditCard, History, RotateCcw, Truck, Utensils } from "lucide-react";

import AdminUrgentActions from "@/components/admin/AdminUrgentActions";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AdminOrdersReservations from "./AdminOrdersReservations";

const OPERATION_VIEWS = [
  {
    value: "live",
    label: "Live",
    icon: Activity,
    title: "Live incidents",
    description: "Toutes les alertes ouvertes par gravité, avec recherche et rafraîchissement court.",
    sources: undefined,
  },
  {
    value: "payments",
    label: "Paiements",
    icon: CreditCard,
    title: "Paiements à traiter",
    description: "Paiements orphelins, commandes incohérentes, campagnes payées non actives et webhooks en échec.",
    sources: ["paiements", "campagnes", "edge-functions"],
  },
  {
    value: "refunds",
    label: "Remboursements",
    icon: RotateCcw,
    title: "Remboursements",
    description: "Remboursements commandes et réservations en attente ou à confirmer côté admin.",
    sources: ["remboursements"],
  },
  {
    value: "dispatch",
    label: "Dispatch",
    icon: Truck,
    title: "Dispatch et livraison",
    description: "Commandes sans livreur, dispatch bloqué et signaux de livraison à reprendre.",
    sources: ["dispatch", "commandes"],
  },
  {
    value: "reservations",
    label: "Réservations",
    icon: Utensils,
    title: "Réservations à surveiller",
    description: "Réservations non confirmées, incidents restaurant et situations client à traiter.",
    sources: ["réservations", "restaurants", "support"],
  },
] as const;

type OperationCenterTab = (typeof OPERATION_VIEWS)[number]["value"] | "history";

export default function AdminOperationsCenter() {
  const [searchParams] = useSearchParams();
  const [activeView, setActiveView] = useState<OperationCenterTab>("live");

  useEffect(() => {
    const tab = searchParams.get("tab");
    const operationId = searchParams.get("operation");

    if (operationId || tab === "orders" || tab === "reservations" || tab === "refunds") {
      setActiveView("history");
    }
  }, [searchParams]);

  return (
    <Tabs value={activeView} onValueChange={(value) => setActiveView(value as OperationCenterTab)} className="space-y-6">
      <div className="container space-y-6 py-8">
        <DashboardPageHero
          badge="Operations admin"
          title="Operations Center"
          description="Cockpit temps réel pour prioriser commandes, réservations, paiements, remboursements, dispatch et incidents marketplace."
          icon={Activity}
          tone="violet"
          visualLabel="Live"
          stats={[
            { label: "Live", value: "20 s", icon: Activity },
            { label: "Paiements", value: "P0", icon: CreditCard },
            { label: "Dispatch", value: "P0", icon: Truck },
          ]}
        />

        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="secondary">Rafraîchissement 20 secondes</Badge>
              <Badge variant="outline">Actions auditées</Badge>
              <span>Chaque résolution ou ignore demande une note et une confirmation.</span>
            </div>

            <TabsList className="grid h-auto w-full grid-cols-2 gap-2 bg-muted/40 p-1 md:grid-cols-3 xl:grid-cols-6">
              {OPERATION_VIEWS.map((view) => {
                const Icon = view.icon;
                return (
                  <TabsTrigger key={view.value} value={view.value} className="gap-2 py-2">
                    <Icon className="h-4 w-4" />
                    {view.label}
                  </TabsTrigger>
                );
              })}
              <TabsTrigger value="history" className="gap-2 py-2">
                <History className="h-4 w-4" />
                Historique
              </TabsTrigger>
            </TabsList>
          </CardContent>
        </Card>

        {OPERATION_VIEWS.map((view) => (
          <TabsContent key={view.value} value={view.value} className="mt-0">
            <AdminUrgentActions
              title={view.title}
              description={view.description}
              sourceWhitelist={view.sources ? [...view.sources] : undefined}
              maxItems={view.value === "live" ? 24 : 18}
              emptyLabel={`Aucune alerte ouverte pour la vue ${view.label.toLowerCase()}.`}
            />
          </TabsContent>
        ))}
      </div>

      <TabsContent value="history" className="mt-0">
        <AdminOrdersReservations />
      </TabsContent>
    </Tabs>
  );
}
