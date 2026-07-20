import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Ban,
  Bot,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Clock3,
  Eye,
  Loader2,
  PackageCheck,
  RotateCcw,
  Search,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  Users,
  UtensilsCrossed,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import OrderStatusBadge from "@/components/OrderStatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useDashboardRestaurant } from "@/pages/dashboard/useDashboardRestaurant";
import { getRelativeLocalDateKey } from "@/lib/commercialDemoDate";
import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";
import { askCommercialDemoAi } from "@/lib/commercialDemoAi";
import {
  transitionCommercialDemoReservation,
  type CommercialDemoReservationTransitionAction,
} from "@/lib/commercialDemoJourney";

type DemoOrderStatus = "confirmed" | "accepted" | "preparing" | "ready" | "delivering" | "delivered" | "cancelled";
type DemoReservationStatus = "pending" | "confirmed" | "arrived" | "no_show" | "cancelled";

type DemoOrder = {
  id: string;
  orderNumber: string;
  createdAt: string;
  customer: string;
  phone: string;
  amount: number;
  status: DemoOrderStatus;
  type: "Livraison" | "À emporter" | "Sur place";
  items: string;
  note?: string;
  viewed: boolean;
};

type DemoReservation = {
  id: string;
  reference: string;
  date: string;
  time: string;
  customer: string;
  phone: string;
  guests: number;
  status: DemoReservationStatus;
  service: "Midi" | "Soir";
  table: string;
  note?: string;
  deposit: number;
};

const orderStatusLabels: Record<DemoOrderStatus, string> = {
  confirmed: "Confirmée",
  accepted: "Acceptée",
  preparing: "En préparation",
  ready: "Prête",
  delivering: "En livraison",
  delivered: "Livrée",
  cancelled: "Annulée",
};

const reservationStatusLabels: Record<DemoReservationStatus, string> = {
  pending: "À confirmer",
  confirmed: "Confirmée",
  arrived: "Client arrivé",
  no_show: "Absent",
  cancelled: "Annulée",
};

function dateAt(dayOffset: number, hour: number, minute: number) {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  date.setDate(date.getDate() + dayOffset);
  return date;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-CH", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("fr-CH", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatChf(value: number) {
  return new Intl.NumberFormat("fr-CH", {
    style: "currency",
    currency: "CHF",
  }).format(value);
}

function makeDemoOrders(): DemoOrder[] {
  return [
    {
      id: "demo-order-1048",
      orderNumber: "TOK-1048",
      createdAt: dateAt(0, 11, 42).toISOString(),
      customer: "Sophie Martin",
      phone: "+41 79 000 10 48",
      amount: 68.5,
      status: "confirmed",
      type: "Livraison",
      items: "2× Menu du chef, 1× Tiramisu",
      note: "Sonner à l'entrée côté cour.",
      viewed: false,
    },
    {
      id: "demo-order-1047",
      orderNumber: "TOK-1047",
      createdAt: dateAt(0, 11, 18).toISOString(),
      customer: "Luca Bernasconi",
      phone: "+41 79 000 10 47",
      amount: 42,
      status: "preparing",
      type: "À emporter",
      items: "1× Burger maison, 1× Salade, 2× Boisson",
      viewed: true,
    },
    {
      id: "demo-order-1046",
      orderNumber: "TOK-1046",
      createdAt: dateAt(0, 10, 54).toISOString(),
      customer: "Nora Dubois",
      phone: "+41 79 000 10 46",
      amount: 95.9,
      status: "delivering",
      type: "Livraison",
      items: "3× Plat du jour, 2× Dessert",
      note: "Allergie aux fruits à coque signalée.",
      viewed: true,
    },
    {
      id: "demo-order-1045",
      orderNumber: "TOK-1045",
      createdAt: dateAt(-1, 19, 36).toISOString(),
      customer: "Marc Rey",
      phone: "+41 79 000 10 45",
      amount: 51.2,
      status: "delivered",
      type: "Livraison",
      items: "2× Pizza signature, 1× Boisson",
      viewed: true,
    },
  ];
}

function makeDemoReservations(): DemoReservation[] {
  const today = getRelativeLocalDateKey(0);
  const tomorrow = getRelativeLocalDateKey(1);
  return [
    {
      id: "demo-reservation-2081",
      reference: "RES-2081",
      date: today,
      time: "12:15",
      customer: "Emma Rochat",
      phone: "+41 79 000 20 81",
      guests: 2,
      status: "pending",
      service: "Midi",
      table: "Table 4",
      note: "Chaise enfant souhaitée.",
      deposit: 0,
    },
    {
      id: "demo-reservation-2080",
      reference: "RES-2080",
      date: today,
      time: "19:30",
      customer: "Famille Morel",
      phone: "+41 79 000 20 80",
      guests: 5,
      status: "confirmed",
      service: "Soir",
      table: "Table 8",
      note: "Anniversaire — dessert avec bougie.",
      deposit: 50,
    },
    {
      id: "demo-reservation-2079",
      reference: "RES-2079",
      date: today,
      time: "20:00",
      customer: "David Meier",
      phone: "+41 79 000 20 79",
      guests: 3,
      status: "confirmed",
      service: "Soir",
      table: "Table 2",
      deposit: 30,
    },
    {
      id: "demo-reservation-2078",
      reference: "RES-2078",
      date: tomorrow,
      time: "12:45",
      customer: "Claire Favre",
      phone: "+41 79 000 20 78",
      guests: 4,
      status: "pending",
      service: "Midi",
      table: "À attribuer",
      note: "Une personne végétarienne.",
      deposit: 0,
    },
  ];
}

function DemoSafetyNotice() {
  const commercialDemoFrame = useCommercialDemoFrame();
  return (
    <Card className="border-sky-200 bg-sky-50/90 shadow-sm dark:border-sky-400/25 dark:bg-sky-400/10">
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-600 text-white">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-bold text-sky-950 dark:text-sky-50">Scénario commercial sécurisé</p>
              <Badge className="bg-sky-600 text-white hover:bg-sky-600">100 % simulé</Badge>
            </div>
            <p className="mt-1 text-sm text-sky-800 dark:text-sky-100/80">
              {commercialDemoFrame
                ? "Ces données restent dans une session de démonstration isolée et synchronisée. Aucune commande, réservation, notification ou opération financière réelle n'est créée."
                : "Ces données restent dans votre navigateur. Aucune commande, réservation, notification ou opération financière réelle n'est créée."}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ScenarioResetButton({ onReset }: { onReset: () => void }) {
  return (
    <Button type="button" variant="outline" className="gap-2" onClick={onReset}>
      <RotateCcw className="h-4 w-4" />
      Réinitialiser le scénario
    </Button>
  );
}

export function CommercialDemoHome() {
  const { restaurants, selectedId } = useDashboardRestaurant();
  const selectedRestaurant = restaurants.find((restaurant) => restaurant.id === selectedId);
  const orders = useMemo(makeDemoOrders, []);
  const reservations = useMemo(makeDemoReservations, []);
  const activeOrders = orders.filter((order) => !["delivered", "cancelled"].includes(order.status));
  const activeReservations = reservations.filter((reservation) => !["cancelled", "no_show"].includes(reservation.status));
  const simulatedTodayRevenue = 864.7;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <DashboardPageHero
          badge="Démonstration restaurateur"
          title={<>Bonjour, <span className="text-[#ff6a1a]">{selectedRestaurant?.name || "Restaurant Démo TOK"}</span></>}
          description="Un aperçu réaliste des outils TOK, alimenté uniquement par des exemples simulés pour votre présentation."
          icon={Sparkles}
          tone="orange"
          visualLabel="Mode démo"
          stats={[
            { label: "Commandes actives", value: activeOrders.length, icon: ShoppingCart },
            { label: "Réservations à venir", value: activeReservations.length, icon: CalendarDays },
            { label: "CA du jour simulé", value: formatChf(simulatedTodayRevenue), icon: TrendingUp },
          ]}
        />

        <DemoSafetyNotice />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "CA du jour", value: formatChf(simulatedTodayRevenue), helper: "+12,4 % vs mardi dernier", icon: CircleDollarSign, tone: "text-emerald-700 bg-emerald-100 dark:text-emerald-200 dark:bg-emerald-500/15" },
            { label: "Commandes", value: "18", helper: "3 à traiter maintenant", icon: ShoppingCart, tone: "text-violet-700 bg-violet-100 dark:text-violet-200 dark:bg-violet-500/15" },
            { label: "Couverts attendus", value: "46", helper: "Midi 18 · Soir 28", icon: Users, tone: "text-orange-700 bg-orange-100 dark:text-orange-200 dark:bg-orange-500/15" },
            { label: "Panier moyen", value: formatChf(48.04), helper: "+3,10 CHF ce mois", icon: TrendingUp, tone: "text-sky-700 bg-sky-100 dark:text-sky-200 dark:bg-sky-500/15" },
          ].map(({ label, value, helper, icon: Icon, tone }) => (
            <Card key={label} className="rounded-3xl border-border/70">
              <CardContent className="p-5">
                <div className={`mb-4 flex h-11 w-11 items-center justify-center rounded-2xl ${tone}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <p className="text-sm font-semibold text-muted-foreground">{label}</p>
                <p className="mt-1 text-3xl font-black tracking-tight">{value}</p>
                <p className="mt-2 text-xs text-muted-foreground">{helper} · simulé</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <Card className="rounded-3xl border-border/70">
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-xl">
                <ShoppingCart className="h-5 w-5 text-violet-600" />
                Commandes en cours
              </CardTitle>
              <Button asChild size="sm" variant="outline">
                <Link to="/dashboard/commandes">Tout voir <ChevronRight className="ml-1 h-4 w-4" /></Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {activeOrders.map((order) => (
                <div key={order.id} className="flex flex-col gap-3 rounded-2xl border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold">{order.orderNumber}</p>
                      <Badge variant="outline" className="text-[10px]">SIMULÉ</Badge>
                    </div>
                    <p className="mt-1 truncate text-sm text-muted-foreground">{order.customer} · {order.items}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <p className="font-bold">{formatChf(order.amount)}</p>
                    <OrderStatusBadge status={order.status} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-border/70">
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-xl">
                <CalendarDays className="h-5 w-5 text-orange-600" />
                Prochaines réservations
              </CardTitle>
              <Button asChild size="sm" variant="outline">
                <Link to="/dashboard/reservations">Tout voir <ChevronRight className="ml-1 h-4 w-4" /></Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {activeReservations.slice(0, 3).map((reservation) => (
                <div key={reservation.id} className="flex flex-col gap-3 rounded-2xl border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold">{reservation.time} · {reservation.customer}</p>
                      <Badge variant="outline" className="text-[10px]">SIMULÉ</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{reservation.guests} personnes · {reservation.table}</p>
                  </div>
                  <OrderStatusBadge status={reservation.status} />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-3xl border-border/70 bg-gradient-to-br from-orange-50 to-violet-50 dark:from-orange-500/10 dark:to-violet-500/10">
          <CardContent className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { to: "/dashboard/commandes", label: "Piloter une commande", icon: ClipboardList },
              { to: "/dashboard/reservations", label: "Gérer une réservation", icon: CalendarDays },
              { to: "/dashboard/plan-salle", label: "Présenter le plan de salle", icon: UtensilsCrossed },
              { to: "/dashboard/factures", label: "Explorer la comptabilité", icon: CircleDollarSign },
            ].map(({ to, label, icon: Icon }) => (
              <Button key={to} asChild variant="outline" className="h-auto min-h-16 justify-start gap-3 whitespace-normal rounded-2xl bg-background/80 p-4 text-left">
                <Link to={to}>
                  <Icon className="h-5 w-5 shrink-0 text-[#ff6a1a]" />
                  {label}
                </Link>
              </Button>
            ))}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

function nextOrderStatus(order: DemoOrder): DemoOrderStatus {
  const sequence: DemoOrderStatus[] = order.type === "Livraison"
    ? ["confirmed", "accepted", "preparing", "delivering", "delivered"]
    : ["confirmed", "accepted", "preparing", "ready", "delivered"];
  const index = sequence.indexOf(order.status);
  return index >= 0 && index < sequence.length - 1 ? sequence[index + 1] : order.status;
}

export function CommercialDemoOrders() {
  const { restaurants, selectedId } = useDashboardRestaurant();
  const selectedRestaurant = restaurants.find((restaurant) => restaurant.id === selectedId);
  const [orders, setOrders] = useState<DemoOrder[]>(makeDemoOrders);
  const [search, setSearch] = useState("");
  const normalizedSearch = search.trim().toLowerCase();
  const visibleOrders = orders.filter((order) => (
    !normalizedSearch
    || order.orderNumber.toLowerCase().includes(normalizedSearch)
    || order.customer.toLowerCase().includes(normalizedSearch)
    || order.items.toLowerCase().includes(normalizedSearch)
  ));

  const updateOrder = (id: string, update: (order: DemoOrder) => DemoOrder) => {
    setOrders((current) => current.map((order) => order.id === id ? update(order) : order));
  };

  const activeCount = orders.filter((order) => !["delivered", "cancelled"].includes(order.status)).length;
  const simulatedRevenue = orders
    .filter((order) => order.status !== "cancelled")
    .reduce((sum, order) => sum + order.amount, 0);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <DashboardPageHero
          badge="Opérations · démonstration"
          title="Commandes simulées"
          description="Faites progresser les commandes pour montrer le parcours restaurateur. Chaque action reste locale et peut être réinitialisée."
          icon={ClipboardList}
          tone="violet"
          visualLabel="Flux démo"
          stats={[
            { label: "Restaurant", value: selectedRestaurant?.name || "Démo TOK", icon: UtensilsCrossed },
            { label: "À traiter", value: activeCount, icon: PackageCheck },
            { label: "CA affiché", value: formatChf(simulatedRevenue), icon: TrendingUp },
          ]}
        />

        <DemoSafetyNotice />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher une commande simulée"
              className="h-11 pl-10"
            />
          </div>
          <ScenarioResetButton onReset={() => setOrders(makeDemoOrders())} />
        </div>

        <div className="grid gap-4">
          {visibleOrders.map((order) => {
            const isClosed = ["delivered", "cancelled"].includes(order.status);
            const followingStatus = nextOrderStatus(order);
            return (
              <Card key={order.id} className="overflow-hidden rounded-3xl border-border/70">
                <CardContent className="p-0">
                  <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(220px,.7fr)_auto] lg:items-center">
                    <div className="min-w-0 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-lg font-black">{order.orderNumber}</p>
                        <Badge variant="outline">{order.type}</Badge>
                        <Badge className="bg-sky-600 text-white hover:bg-sky-600">SIMULÉE</Badge>
                        {!order.viewed ? <Badge className="bg-orange-600 text-white hover:bg-orange-600">Nouvelle</Badge> : null}
                      </div>
                      <div>
                        <p className="font-semibold">{order.customer}</p>
                        <p className="text-sm text-muted-foreground">{order.phone} · {formatDateTime(order.createdAt)}</p>
                      </div>
                      <p className="text-sm">{order.items}</p>
                      {order.note ? <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">Note : {order.note}</p> : null}
                    </div>

                    <div className="space-y-3 rounded-2xl bg-muted/35 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm text-muted-foreground">Montant</span>
                        <strong className="text-xl">{formatChf(order.amount)}</strong>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm text-muted-foreground">Statut</span>
                        <OrderStatusBadge status={order.status} />
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 lg:w-48 lg:flex-col">
                      {!order.viewed ? (
                        <Button type="button" variant="outline" className="gap-2" onClick={() => updateOrder(order.id, (current) => ({ ...current, viewed: true }))}>
                          <Eye className="h-4 w-4" />
                          Marquer vue
                        </Button>
                      ) : null}
                      {!isClosed && followingStatus !== order.status ? (
                        <Button type="button" className="gap-2" onClick={() => updateOrder(order.id, (current) => ({ ...current, status: nextOrderStatus(current), viewed: true }))}>
                          <CheckCircle2 className="h-4 w-4" />
                          {order.status === "confirmed" ? "Accepter" : orderStatusLabels[followingStatus]}
                        </Button>
                      ) : null}
                      {!isClosed ? (
                        <Button type="button" variant="outline" className="gap-2 text-destructive" onClick={() => updateOrder(order.id, (current) => ({ ...current, status: "cancelled", viewed: true }))}>
                          <Ban className="h-4 w-4" />
                          Annuler (démo)
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {visibleOrders.length === 0 ? (
          <Card className="rounded-3xl border-dashed">
            <CardContent className="py-12 text-center text-muted-foreground">Aucune commande simulée ne correspond à cette recherche.</CardContent>
          </Card>
        ) : null}
      </div>
    </DashboardLayout>
  );
}

export function CommercialDemoReservations() {
  const commercialDemoFrame = useCommercialDemoFrame();
  const queryClient = useQueryClient();
  const { restaurants, selectedId } = useDashboardRestaurant();
  const selectedRestaurant = restaurants.find((restaurant) => restaurant.id === selectedId);
  const [reservations, setReservations] = useState<DemoReservation[]>(makeDemoReservations);
  const [search, setSearch] = useState("");
  const normalizedSearch = search.trim().toLowerCase();
  const realtimeReservations: DemoReservation[] = (commercialDemoFrame?.snapshot.reservations || []).map((reservation) => ({
    id: reservation.id,
    reference: reservation.reference,
    date: reservation.reservation_date,
    time: reservation.reservation_time.slice(0, 5),
    customer: reservation.customer_name,
    phone: reservation.customer_phone || "—",
    guests: reservation.party_size,
    status: reservation.status,
    service: Number(reservation.reservation_time.slice(0, 2)) < 17 ? "Midi" : "Soir",
    table: reservation.status === "arrived" ? "Client installé" : "À attribuer",
    note: reservation.notes || undefined,
    deposit: 0,
  }));
  const sourceReservations = commercialDemoFrame ? realtimeReservations : reservations;
  const visibleReservations = sourceReservations.filter((reservation) => (
    !normalizedSearch
    || reservation.reference.toLowerCase().includes(normalizedSearch)
    || reservation.customer.toLowerCase().includes(normalizedSearch)
    || reservation.table.toLowerCase().includes(normalizedSearch)
  ));

  const transitionMutation = useMutation({
    mutationFn: async ({ id, action, expectedVersion }: {
      id: string;
      action: CommercialDemoReservationTransitionAction;
      expectedVersion: number;
    }) => transitionCommercialDemoReservation({ reservationId: id, action, expectedVersion }),
    onSuccess: (snapshot) => {
      if (!commercialDemoFrame) return;
      queryClient.setQueryData(
        ["commercial-demo-frame-snapshot", commercialDemoFrame.config.sessionId],
        snapshot,
      );
      void commercialDemoFrame.refresh();
    },
  });

  const updateReservation = (id: string, status: DemoReservationStatus) => {
    if (commercialDemoFrame) {
      const reservation = commercialDemoFrame.snapshot.reservations.find((item) => item.id === id);
      if (!reservation) return;
      const action: CommercialDemoReservationTransitionAction | null = status === "confirmed"
        ? "restaurant_confirm"
        : status === "arrived"
          ? "restaurant_mark_arrived"
          : status === "no_show"
            ? "restaurant_mark_no_show"
            : status === "cancelled"
              ? "client_cancel"
              : null;
      if (action) transitionMutation.mutate({ id, action, expectedVersion: reservation.version });
      return;
    }
    setReservations((current) => current.map((reservation) => (
      reservation.id === id ? { ...reservation, status } : reservation
    )));
  };

  const activeReservations = sourceReservations.filter((reservation) => !["cancelled", "no_show"].includes(reservation.status));
  const guestCount = activeReservations.reduce((sum, reservation) => sum + reservation.guests, 0);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <DashboardPageHero
          badge="Planning · démonstration"
          title="Réservations simulées"
          description="Présentez la confirmation, l'arrivée et la gestion des absences sans contacter de client ni enregistrer de donnée."
          icon={CalendarDays}
          tone="orange"
          visualLabel="Service démo"
          stats={[
            { label: "Restaurant", value: selectedRestaurant?.name || "Démo TOK", icon: UtensilsCrossed },
            { label: "Réservations actives", value: activeReservations.length, icon: CalendarDays },
            { label: "Couverts attendus", value: guestCount, icon: Users },
          ]}
        />

        <DemoSafetyNotice />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher une réservation simulée"
              className="h-11 pl-10"
            />
          </div>
          {!commercialDemoFrame ? <ScenarioResetButton onReset={() => setReservations(makeDemoReservations())} /> : null}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {visibleReservations.map((reservation) => {
            const isClosed = ["cancelled", "no_show"].includes(reservation.status);
            return (
              <Card key={reservation.id} className="rounded-3xl border-border/70">
                <CardHeader className="space-y-3 pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-lg">{reservation.time} · {reservation.customer}</CardTitle>
                      <Badge className="bg-sky-600 text-white hover:bg-sky-600">SIMULÉE</Badge>
                    </div>
                    <OrderStatusBadge status={reservation.status} />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(reservation.date)} · {reservation.service} · {reservation.reference}
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 rounded-2xl bg-muted/35 p-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Couverts</p>
                      <p className="mt-1 flex items-center gap-2 font-bold"><Users className="h-4 w-4" />{reservation.guests}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Placement</p>
                      <p className="mt-1 font-bold">{reservation.table}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Contact</p>
                      <p className="mt-1 font-bold">{reservation.phone}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Acompte</p>
                      <p className="mt-1 font-bold">{reservation.deposit ? `${formatChf(reservation.deposit)} simulé` : "Non requis"}</p>
                    </div>
                  </div>

                  {reservation.note ? <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">Note : {reservation.note}</p> : null}

                  <div className="flex flex-wrap gap-2">
                    {reservation.status === "pending" ? (
                      <Button type="button" className="gap-2" onClick={() => updateReservation(reservation.id, "confirmed")}>
                        <CheckCircle2 className="h-4 w-4" />
                        Confirmer (démo)
                      </Button>
                    ) : null}
                    {reservation.status === "confirmed" ? (
                      <Button type="button" className="gap-2" onClick={() => updateReservation(reservation.id, "arrived")}>
                        <Users className="h-4 w-4" />
                        Client arrivé
                      </Button>
                    ) : null}
                    {reservation.status === "confirmed" ? (
                      <Button type="button" variant="outline" className="gap-2" onClick={() => updateReservation(reservation.id, "no_show")}>
                        <Clock3 className="h-4 w-4" />
                        Marquer absent
                      </Button>
                    ) : null}
                    {!commercialDemoFrame && !isClosed && reservation.status !== "arrived" ? (
                      <Button type="button" variant="outline" className="gap-2 text-destructive" onClick={() => updateReservation(reservation.id, "cancelled")}>
                        <Ban className="h-4 w-4" />
                        Annuler (démo)
                      </Button>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">État actuel : {reservationStatusLabels[reservation.status]} · {commercialDemoFrame ? "synchronisé en temps réel" : "action locale uniquement"}.</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {visibleReservations.length === 0 ? (
          <Card className="rounded-3xl border-dashed">
            <CardContent className="py-12 text-center text-muted-foreground">{commercialDemoFrame ? "Créez une réservation dans la fenêtre client : elle apparaîtra ici en temps réel." : "Aucune réservation simulée ne correspond à cette recherche."}</CardContent>
          </Card>
        ) : null}
      </div>
    </DashboardLayout>
  );
}

export function CommercialDemoAccounting() {
  const commercialDemoFrame = useCommercialDemoFrame();
  const { restaurants, selectedId } = useDashboardRestaurant();
  const selectedRestaurant = restaurants.find((restaurant) => restaurant.id === selectedId);
  const paidOrder = commercialDemoFrame?.snapshot.order?.payment_status === "test_paid"
    ? commercialDemoFrame.snapshot.order
    : null;
  const grossSales = commercialDemoFrame
    ? Number(paidOrder?.total_amount_cents || 0) / 100
    : 12_480;
  const tokCommission = grossSales * 0.1;
  const restaurantShare = grossSales - tokCommission;
  const advertising = commercialDemoFrame ? 0 : 240;
  const subscription = commercialDemoFrame ? 0 : 149;
  const refunds = commercialDemoFrame ? 0 : 83.5;
  const openNet = restaurantShare - advertising - subscription - refunds;
  const accountingAiEnabled = commercialDemoFrame?.snapshot.active_features.includes(
    "ai_accounting_insights",
  ) === true;
  const [accountingAiReply, setAccountingAiReply] = useState("");
  const accountingAiMutation = useMutation({
    mutationFn: async () => {
      if (
        !commercialDemoFrame
        || commercialDemoFrame.surface !== "restaurant"
        || !accountingAiEnabled
      ) {
        throw new Error("La comptabilité IA de démonstration n'est pas disponible.");
      }

      return askCommercialDemoAi({
        runtime: {
          sessionId: commercialDemoFrame.config.sessionId,
          surface: "restaurant",
        },
        tool: "assistant",
        message: [
          "Prépare une synthèse comptable pédagogique en français pour ce scénario de démonstration.",
          "Utilise exclusivement les données simulées de la session et ne prétends jamais consulter une comptabilité réelle.",
          "Présente une lecture courte des chiffres, trois points de vigilance, une projection illustrative et trois actions prioritaires.",
          "Rappelle en conclusion que cette synthèse de démonstration ne constitue pas un conseil fiscal ou comptable.",
        ].join(" "),
        context: {
          workspace: "accounting",
          data_scope: "commercial_demo_snapshot_only",
          currency: "CHF",
          gross_sales: grossSales,
          restaurant_share: restaurantShare,
          tok_commission: tokCommission,
          advertising_costs: advertising,
          subscription_costs: subscription,
          simulated_refunds: refunds,
          estimated_open_net: openNet,
          paid_order_count: paidOrder ? 1 : 0,
          order_status: paidOrder?.status || null,
          payment_status: paidOrder?.payment_status || null,
          reservation_count: commercialDemoFrame.snapshot.reservations.length,
        },
      });
    },
    onSuccess: (result) => setAccountingAiReply(result.reply),
  });
  const shareOfGross = (value: number) => grossSales > 0 ? `${Math.round((value / grossSales) * 100)} %` : "0 %";
  const revenueRows = [
    { label: "Commande Stripe Test", value: grossSales, share: shareOfGross(grossSales) },
    { label: "Réservations", value: 0, share: "0 %" },
    { label: "Ventes flash et offres", value: 0, share: "0 %" },
  ];
  const expenseRows = [
    { label: "Commission TOK (10 %)", value: tokCommission, helper: "Prélevée sur les ventes éligibles" },
    { label: "Campagnes publicitaires", value: advertising, helper: "2 campagnes simulées" },
    { label: "Abonnement outils", value: subscription, helper: "Pack de démonstration" },
    { label: "Remboursements clients", value: refunds, helper: "1 remboursement simulé" },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <DashboardPageHero
          badge="Comptabilité · démonstration"
          title="Vue comptable simulée"
          description={commercialDemoFrame
            ? "Les montants suivent en temps réel le paiement Stripe Test de cette session, sans charger ni écrire de donnée financière réelle."
            : "Montrez en un coup d'œil les recettes, les commissions et le montant net, sans charger ni exporter aucune donnée financière réelle."}
          icon={CircleDollarSign}
          tone="orange"
          visualLabel="Chiffres démo"
          stats={[
            { label: "Restaurant", value: selectedRestaurant?.name || "Démo TOK", icon: UtensilsCrossed },
            { label: "Ventes brutes", value: formatChf(grossSales), icon: TrendingUp },
            { label: "Net estimé", value: formatChf(openNet), icon: CircleDollarSign },
          ]}
        />

        <DemoSafetyNotice />

        {commercialDemoFrame ? (
          <Card className="rounded-3xl border-sky-200 bg-sky-50/70 dark:border-sky-400/25 dark:bg-sky-500/10" data-testid="commercial-demo-accounting-ai">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Bot className="h-5 w-5 text-sky-700 dark:text-sky-300" />
                Comptabilité IA
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                OpenAI analyse uniquement les chiffres simulés de cette session Démo. Aucune table financière réelle n'est lue ou modifiée.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {accountingAiEnabled ? (
                <Button
                  type="button"
                  className="gap-2"
                  onClick={() => accountingAiMutation.mutate()}
                  disabled={accountingAiMutation.isPending}
                >
                  {accountingAiMutation.isPending
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Bot className="h-4 w-4" />}
                  {accountingAiMutation.isPending ? "Analyse en cours…" : "Générer la synthèse IA"}
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">
                  La fonctionnalité Comptabilité IA est désactivée par l'administrateur.
                </p>
              )}

              {accountingAiMutation.error ? (
                <p className="text-sm text-destructive">
                  {accountingAiMutation.error instanceof Error
                    ? accountingAiMutation.error.message
                    : "La synthèse IA n'a pas pu être générée."}
                </p>
              ) : null}

              {accountingAiReply ? (
                <div className="rounded-2xl border border-sky-200 bg-background/90 p-4 dark:border-sky-400/20">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">OpenAI serveur</Badge>
                    <Badge variant="outline">Données Démo uniquement</Badge>
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-6">{accountingAiReply}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {commercialDemoFrame && !paidOrder ? (
          <Card className="rounded-3xl border-dashed">
            <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold">Aucun paiement Démo comptabilisé</p>
                <p className="text-sm text-muted-foreground">Créez puis réglez une fausse commande avec Stripe Test dans la fenêtre Client : le chiffre d'affaires apparaîtra ici en temps réel.</p>
              </div>
              <Button asChild variant="outline"><Link to="/dashboard/commandes">Voir les commandes</Link></Button>
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Paiements clients", value: grossSales, helper: "Base avant répartition", className: "text-sky-700 bg-sky-100 dark:text-sky-200 dark:bg-sky-500/15" },
            { label: "Part restaurant", value: restaurantShare, helper: "90 % des ventes éligibles", className: "text-emerald-700 bg-emerald-100 dark:text-emerald-200 dark:bg-emerald-500/15" },
            { label: "Part TOK", value: tokCommission, helper: "Commission de 10 %", className: "text-orange-700 bg-orange-100 dark:text-orange-200 dark:bg-orange-500/15" },
            { label: "Net après autres coûts", value: openNet, helper: "Lecture simplifiée", className: "text-violet-700 bg-violet-100 dark:text-violet-200 dark:bg-violet-500/15" },
          ].map((item) => (
            <Card key={item.label} className="rounded-3xl border-border/70">
              <CardContent className="p-5">
                <span className={`mb-4 flex h-11 w-11 items-center justify-center rounded-2xl ${item.className}`}>
                  <CircleDollarSign className="h-5 w-5" />
                </span>
                <p className="text-sm font-semibold text-muted-foreground">{item.label}</p>
                <p className="mt-1 text-3xl font-black tracking-tight">{formatChf(item.value)}</p>
                <p className="mt-2 text-xs text-muted-foreground">{item.helper} · simulé</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <Card className="rounded-3xl border-border/70">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <TrendingUp className="h-5 w-5 text-emerald-600" />
                Recettes par activité
              </CardTitle>
              <p className="text-sm text-muted-foreground">Répartition des ventes brutes du mois simulé.</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {revenueRows.map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-4 rounded-2xl border bg-muted/20 p-4">
                  <div>
                    <p className="font-semibold">{row.label}</p>
                    <p className="text-xs text-muted-foreground">{row.share} du total · simulé</p>
                  </div>
                  <p className="shrink-0 font-black text-emerald-700 dark:text-emerald-300">+ {formatChf(row.value)}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-border/70">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <CircleDollarSign className="h-5 w-5 text-orange-600" />
                Dépenses et retenues
              </CardTitle>
              <p className="text-sm text-muted-foreground">Chaque poste est séparé pour expliquer facilement le net.</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {expenseRows.map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-4 rounded-2xl border bg-muted/20 p-4">
                  <div>
                    <p className="font-semibold">{row.label}</p>
                    <p className="text-xs text-muted-foreground">{row.helper} · simulé</p>
                  </div>
                  <p className="shrink-0 font-black text-orange-700 dark:text-orange-300">− {formatChf(row.value)}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-3xl border-emerald-200 bg-emerald-50/70 dark:border-emerald-400/25 dark:bg-emerald-500/10">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">Net estimé du scénario</p>
              <p className="mt-1 text-4xl font-black text-emerald-950 dark:text-emerald-50">{formatChf(openNet)}</p>
              <p className="mt-2 text-sm text-emerald-800 dark:text-emerald-100/80">Part restaurant moins publicité, abonnement et remboursements simulés. Ce montant n'est ni une facture ni un solde réel.</p>
            </div>
            <Button type="button" variant="outline" disabled className="shrink-0">
              Export désactivé en démo
            </Button>
          </CardContent>
        </Card>

        {commercialDemoFrame ? (
          <Card className="rounded-3xl border-border/70">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Clock3 className="h-5 w-5 text-sky-600" />
                Historique comptable de la session
              </CardTitle>
              <p className="text-sm text-muted-foreground">Événements Démo uniquement. Ils ne créent ni facture, ni commission, ni écriture dans le grand livre de production.</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {commercialDemoFrame.snapshot.events.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun événement dans cette session.</p>
              ) : commercialDemoFrame.snapshot.events.slice().reverse().map((event) => (
                <div key={event.id} className="flex flex-col gap-1 rounded-2xl border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold">{event.label}</p>
                    <p className="text-xs text-muted-foreground">{new Date(event.created_at).toLocaleString("fr-CH")}</p>
                  </div>
                  <Badge variant="outline">SIMULÉ</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
