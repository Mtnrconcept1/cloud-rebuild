import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check, CheckCheck, ChefHat, Clock3, Expand, RefreshCw, UtensilsCrossed, X,
} from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import KitchenOrderEntry from "@/components/dashboard/KitchenOrderEntry";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getSupabase } from "@/integrations/supabase/client";
import {
  advanceKitchenTicket, kitchenWaitingMinutes, listKitchenTickets, sortKitchenTickets,
  type KitchenTicket, type KitchenTicketStatus,
} from "@/lib/kitchenTickets";
import { useDashboardRestaurant } from "./useDashboardRestaurant";
import { toast } from "sonner";

function KitchenTicketCard({
  ticket, position, now, processing, onAdvance,
}: {
  ticket: KitchenTicket;
  position: number;
  now: number;
  processing: boolean;
  onAdvance: (ticket: KitchenTicket, next: KitchenTicketStatus) => void;
}) {
  const elapsed = kitchenWaitingMinutes(ticket.created_at, now);
  const action = ticket.status === "queued"
    ? { next: "preparing" as const, label: "Commencer", Icon: UtensilsCrossed }
    : ticket.status === "preparing"
      ? { next: "ready" as const, label: "Prête à servir", Icon: Check }
      : ticket.status === "ready"
        ? { next: "served" as const, label: "Servie", Icon: CheckCheck }
        : null;

  return (
    <article className="rounded-2xl border border-border bg-card p-4 shadow-sm"
      aria-label={"Ticket table " + ticket.table_number}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Ordre #{position + 1}
          </span>
          <h4 className="font-serif text-xl font-bold">Table {ticket.table_number}</h4>
        </div>
        <Badge
          variant={elapsed >= 20 && ticket.status !== "ready" ? "destructive" : "secondary"}
          className="gap-1 whitespace-nowrap"
        >
          <Clock3 className="h-3 w-3" /> {elapsed} min
        </Badge>
      </div>
      <ul className="space-y-2 border-t border-border/60 py-3">
        {ticket.items.map((item) => (
          <li key={item.id} className="flex gap-3 text-sm">
            <strong className="min-w-8 rounded-lg bg-primary/10 px-2 py-1 text-center text-primary">
              {item.quantity}×
            </strong>
            <span className="self-center font-medium">{item.name}</span>
          </li>
        ))}
      </ul>
      {ticket.note && (
        <p className="mb-3 rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm font-medium text-orange-950">
          Consignes : {ticket.note}
        </p>
      )}
      <p className="mb-3 text-xs text-muted-foreground">
        Reçue à {new Date(ticket.created_at).toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" })}
      </p>
      {action && (
        <Button className="min-h-11 w-full gap-2" disabled={processing}
          onClick={() => onAdvance(ticket, action.next)}
          aria-label={action.label + " - table " + ticket.table_number}>
          <action.Icon className="h-4 w-4" /> {action.label}
        </Button>
      )}
      {ticket.status === "queued" && (
        <Button variant="ghost" className="mt-1 min-h-10 w-full text-muted-foreground"
          disabled={processing}
          onClick={() => {
            if (window.confirm("Annuler le ticket de la table " + ticket.table_number + " ?")) {
              onAdvance(ticket, "cancelled");
            }
          }}>
          <X className="mr-1 h-4 w-4" /> Annuler ce ticket
        </Button>
      )}
    </article>
  );
}

export default function DashboardCuisine() {
  const { selectedId, restaurants, loading, isDemoMode } = useDashboardRestaurant();
  const queryClient = useQueryClient();
  const boardRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"service" | "kitchen">("service");
  const [now, setNow] = useState(Date.now);

  const restaurantName =
    restaurants.find((restaurant) => restaurant.id === selectedId)?.name || "Restaurant";
  const ticketsQuery = useQuery({
    queryKey: ["kitchen-tickets", selectedId],
    queryFn: () => listKitchenTickets(selectedId!),
    enabled: Boolean(selectedId) && !isDemoMode,
    refetchInterval: 8_000,
    refetchOnWindowFocus: true,
  });
  const tickets = sortKitchenTickets(ticketsQuery.data || []);

  useEffect(() => {
    const clock = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(clock);
  }, []);

  useEffect(() => {
    if (!selectedId || isDemoMode) return;
    const supabase = getSupabase();
    const channel = supabase.channel("kitchen-tickets:" + selectedId)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "kitchen_tickets",
        filter: "restaurant_id=eq." + selectedId,
      }, () => {
        void queryClient.invalidateQueries({ queryKey: ["kitchen-tickets", selectedId] });
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [selectedId, isDemoMode, queryClient]);

  const advanceMutation = useMutation({
    mutationFn: ({ ticket, next }: { ticket: KitchenTicket; next: KitchenTicketStatus }) =>
      advanceKitchenTicket(ticket, next),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["kitchen-tickets", selectedId] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
      void queryClient.invalidateQueries({ queryKey: ["kitchen-tickets", selectedId] });
    },
  });

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await boardRef.current?.requestFullscreen();
    } catch {
      toast.error("Le plein écran n'est pas disponible sur cet appareil.");
    }
  };
  const columns = [
    { status: "queued" as const, title: "À préparer", description: "En attente de lancement", tone: "border-l-amber-500" },
    { status: "preparing" as const, title: "En préparation", description: "En cours en cuisine", tone: "border-l-primary" },
    { status: "ready" as const, title: "Prêtes à servir", description: "À récupérer par le serveur", tone: "border-l-emerald-500" },
  ];

  return (
    <DashboardLayout mainClassName="tok-restaurant-page">
      <div className="space-y-6">
        <DashboardPageHero
          badge="Pilotage du service" icon={ChefHat}
          title="Écran cuisine & prise de commande"
          description={"Du serveur à la cuisine en temps réel · " + restaurantName}
          tone="orange" compact
        />
        {isDemoMode ? (
          <Card><CardContent className="py-8 text-center text-muted-foreground">
            Le mode démonstration ne permet pas d'envoyer de véritables commandes.
          </CardContent></Card>
        ) : !selectedId && !loading ? (
          <Card><CardContent className="py-8 text-center">
            Sélectionnez un établissement pour gérer son service.
          </CardContent></Card>
        ) : (
          <Tabs value={mode} onValueChange={(value) => setMode(value as "service" | "kitchen")} className="space-y-5">
            <TabsList className="grid h-auto w-full max-w-lg grid-cols-2 rounded-2xl p-1">
              <TabsTrigger value="service" className="min-h-12 gap-2 text-sm">
                <UtensilsCrossed className="h-4 w-4" /> Prise de commande
              </TabsTrigger>
              <TabsTrigger value="kitchen" className="min-h-12 gap-2 text-sm">
                <ChefHat className="h-4 w-4" /> Écran cuisine
                {tickets.length > 0 && <Badge className="ml-1">{tickets.length}</Badge>}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="service" className="space-y-5">
              {selectedId && <KitchenOrderEntry key={selectedId} restaurantId={selectedId} />}
            </TabsContent>
            <TabsContent value="kitchen">
              <div ref={boardRef} className="space-y-5 rounded-2xl bg-background p-1 sm:p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-serif text-2xl font-bold">Tickets en cuisine</h2>
                    <p className="text-sm text-muted-foreground">
                      Du plus ancien au plus récent dans chaque étape. Actualisation automatique.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="gap-2"
                      onClick={() => void ticketsQuery.refetch()}>
                      <RefreshCw className="h-4 w-4" /> Actualiser
                    </Button>
                    <Button variant="outline" size="sm" className="gap-2"
                      onClick={() => void toggleFullscreen()}>
                      <Expand className="h-4 w-4" /> Plein écran
                    </Button>
                  </div>
                </div>
                {ticketsQuery.isError && (
                  <p role="alert" className="rounded-xl border border-destructive/40 p-4 text-sm text-destructive">
                    Impossible de synchroniser les tickets. Vérifiez la connexion puis actualisez.
                  </p>
                )}
                {ticketsQuery.isPending ? (
                  <p className="text-sm text-muted-foreground">Connexion à l'écran cuisine…</p>
                ) : (
                  <div className="grid items-start gap-4 lg:grid-cols-3">
                    {columns.map((column) => {
                      const group = tickets.filter((ticket) => ticket.status === column.status);
                      return (
                        <section key={column.status}
                          className={"min-h-44 rounded-2xl border border-l-4 bg-muted/30 p-3 " + column.tone}
                          aria-label={column.title}>
                          <div className="mb-4 flex items-center justify-between gap-2">
                            <div>
                              <h3 className="font-serif text-xl font-bold">{column.title}</h3>
                              <p className="text-xs text-muted-foreground">{column.description}</p>
                            </div>
                            <Badge variant="secondary">{group.length}</Badge>
                          </div>
                          <div className="space-y-3">
                            {group.length === 0 ? (
                              <p className="rounded-xl border border-dashed bg-background/70 p-6 text-center text-sm text-muted-foreground">
                                Aucun ticket
                              </p>
                            ) : group.map((ticket, index) => (
                              <KitchenTicketCard
                                key={ticket.id} ticket={ticket} position={index} now={now}
                                processing={advanceMutation.isPending}
                                onAdvance={(item, next) => advanceMutation.mutate({ ticket: item, next })}
                              />
                            ))}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </DashboardLayout>
  );
}
