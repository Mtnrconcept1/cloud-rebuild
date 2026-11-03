import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, BarChart3, CalendarDays, ChevronLeft, ChevronRight, Clock3, History, RefreshCw, ShoppingBasket, UtensilsCrossed } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getSupabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import {
  buildOrderTrend, getZurichDay, loadRestaurantOrderHistory, loadRestaurantOrderInsights,
  offsetDay, orderInsightPeriods,
  type OrderInsightChannel, type OrderInsightDays,
} from "@/lib/restaurantOrderInsights";

const WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

const chf = (amount: number) => new Intl.NumberFormat("fr-CH", {
  style: "currency", currency: "CHF",
}).format(amount);

const localDate = (value: string) => new Date(value).toLocaleString("fr-CH", {
  timeZone: "Europe/Zurich", dateStyle: "short", timeStyle: "short",
});

const statusLabels: Record<string, string> = {
  queued: "À préparer", preparing: "En préparation", ready: "Prêt à servir",
  served: "Servi", cancelled: "Annulé",
  confirmed: "Confirmée", paid: "Payée", accepted: "Acceptée",
  delivering: "En livraison", delivered: "Livrée", completed: "Terminée",
  payment_failed: "Paiement échoué", pending_payment: "Paiement en attente",
  picked_up: "Récupérée", ready_for_pickup: "Prête au retrait",
};

const channelLabel = (channel: string) => channel === "salle" ? "En salle" : "En ligne";

function StatCard({ label, value, note, Icon }: {
  label: string; value: string; note?: string;
  Icon: typeof BarChart3;
}) {
  return (
    <Card className="rounded-2xl">
      <CardContent className="space-y-2 p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Icon className="h-4 w-4 text-primary" /><span>{label}</span>
        </div>
        <p className="font-serif text-2xl font-bold tabular-nums sm:text-3xl">{value}</p>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
      </CardContent>
    </Card>
  );
}

export default function RestaurantOrderInsightsPanel({ restaurantId }: { restaurantId: string }) {
  const { user } = useAuth();
  const today = getZurichDay();
  const [days, setDays] = useState<OrderInsightDays>(30);
  const [endDate, setEndDate] = useState(today);
  const [branch, setBranch] = useState("all");
  const [channel, setChannel] = useState<OrderInsightChannel>("all");
  const [page, setPage] = useState(0);

  const filters = {
    restaurantId, days, endDate,
    branchId: branch === "all" ? null : branch,
    channel,
  };

  const branchesQuery = useQuery({
    queryKey: ["order-insights-branches", restaurantId, user?.id],
    enabled: Boolean(restaurantId && user?.id),
    queryFn: async () => {
      const { data, error } = await getSupabase().from("restaurant_branches")
        .select("id,name").eq("restaurant_id", restaurantId)
        .eq("is_active", true).limit(30).order("name");
      if (error) throw error;
      return data || [];
    },
  });
  const insights = useQuery({
    queryKey: ["order-insights", restaurantId, user?.id, days, endDate, branch, channel],
    queryFn: () => loadRestaurantOrderInsights(filters),
    enabled: Boolean(restaurantId && user?.id),
    refetchInterval: 60_000,
    retry: 0,
  });
  const history = useQuery({
    queryKey: ["order-history", restaurantId, user?.id, days, endDate, branch, channel, page],
    queryFn: () => loadRestaurantOrderHistory(filters, page),
    enabled: Boolean(restaurantId && user?.id),
    refetchInterval: 60_000,
    retry: 0,
  });

  useEffect(() => setPage(0), [restaurantId, days, endDate, branch, channel]);

  const trend = useMemo(() =>
    buildOrderTrend(insights.data?.days || [], days), [insights.data?.days, days]);
  const maxHour = Math.max(1, ...(insights.data?.hours || []).map((hour) => hour.orders));
  const maxWeekday = Math.max(1, ...(insights.data?.weekdays || []).map((day) => day.orders));
  const maxTrend = Math.max(1, ...trend.map((day) => day.orders));

  function goPreviousPeriod() {
    setEndDate(offsetDay(endDate, -days));
  }
  function goNextPeriod() {
    const next = offsetDay(endDate, days);
    setEndDate(next > today ? today : next);
  }
  const canGoForward = endDate < today;
  const summary = insights.data?.summary;

  return (
    <div className="space-y-5">
      <Card className="rounded-2xl">
        <CardHeader><CardTitle className="flex items-center gap-2 font-serif text-xl">
          <History className="h-5 w-5 text-primary" /> Mémoire des commandes
        </CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Les commandes en salle et en ligne sont conservées dans leurs historiques d'origine,
            y compris les annulations. Les classements ne comptent que les commandes confirmées
            et non annulées. Aucun nom, adresse ou remarque personnelle n'est utilisé ici.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="insights-period">Période</Label>
              <Select value={String(days)} onValueChange={(value) => {
                if (orderInsightPeriods.includes(Number(value) as OrderInsightDays)) {
                  setDays(Number(value) as OrderInsightDays);
                  setEndDate(getZurichDay());
                }
              }}>
                <SelectTrigger id="insights-period"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 jours</SelectItem>
                  <SelectItem value="30">30 jours</SelectItem>
                  <SelectItem value="90">90 jours</SelectItem>
                  <SelectItem value="365">365 jours</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="insights-channel">Origine</Label>
              <Select value={channel} onValueChange={(value) => setChannel(value as OrderInsightChannel)}>
                <SelectTrigger id="insights-channel"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Salle et commandes en ligne</SelectItem>
                  <SelectItem value="salle">En salle uniquement</SelectItem>
                  <SelectItem value="en_ligne">En ligne uniquement</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="insights-branch">Succursale</Label>
              <Select value={branch} onValueChange={setBranch}>
                <SelectTrigger id="insights-branch" disabled={branchesQuery.isPending}>
                  <SelectValue placeholder="Toutes les succursales" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les succursales</SelectItem>
                  {branchesQuery.data?.map((item) =>
                    <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          {branchesQuery.isError && <p role="alert" className="text-sm text-destructive">
            Impossible de charger les succursales.
          </p>}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={goPreviousPeriod}>
                <ChevronLeft className="mr-1 h-4 w-4" /> Période précédente
              </Button>
              <Button variant="outline" size="sm" disabled={!canGoForward} onClick={goNextPeriod}>
                Suivante <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
            <Button variant="ghost" size="sm" onClick={() => void Promise.all([
              insights.refetch(), history.refetch(),
            ])}>
              <RefreshCw className="mr-1 h-4 w-4" /> Actualiser
            </Button>
          </div>
          <p className="text-xs text-muted-foreground" role="status">
            Fenêtre : {insights.data?.from_day || offsetDay(endDate, 1 - days)} au {endDate}
            {" · "}Fuseau horaire : Europe/Zurich.
            Les données antérieures restent consultables avec « Période précédente ».
          </p>
        </CardContent>
      </Card>

      {insights.isPending ? <Card><CardContent className="py-10 text-center text-muted-foreground">
        Calcul des statistiques…
      </CardContent></Card> : insights.isError ? (
        <Card><CardContent className="space-y-3 py-8">
          <p className="text-sm text-destructive" role="alert">
            Statistiques indisponibles. Vérifiez vos droits et réessayez.
          </p>
          <Button variant="outline" onClick={() => void insights.refetch()}>Réessayer</Button>
        </CardContent></Card>
      ) : summary ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard Icon={ShoppingBasket} label="Commandes enregistrées"
              value={summary.recorded_orders.toLocaleString("fr-CH")}
              note="Inclut annulations et échecs de paiement" />
            <StatCard Icon={UtensilsCrossed} label="Portions confirmées"
              value={summary.confirmed_units.toLocaleString("fr-CH")}
              note={String(summary.confirmed_orders) + " commandes retenues dans les classements"} />
            <StatCard Icon={BarChart3} label="Valeur indicative"
              value={chf(summary.estimated_value_chf)}
              note="Non assimilable au chiffre d'affaires encaissé" />
            <StatCard Icon={Clock3} label="Préparation moyenne"
              value={summary.average_prep_minutes.toLocaleString("fr-CH") + " min"}
              note="Tickets salle avec début et fin de préparation" />
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <Card className="rounded-2xl">
              <CardHeader><CardTitle className="font-serif text-xl">Plats les plus commandés</CardTitle></CardHeader>
              <CardContent>
                {insights.data!.top_products.length === 0
                  ? <p className="py-6 text-sm text-muted-foreground">Aucun plat confirmé sur cette période.</p>
                  : <div className="max-h-[480px] space-y-2 overflow-y-auto">
                    {insights.data!.top_products.map((item, index) => {
                      const max = Math.max(1, insights.data!.top_products[0].units_confirmed);
                      return (
                        <div key={item.channel + ":" + (item.item_key || item.name)}
                          className="rounded-xl border bg-background p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold">
                                <span className="mr-2 text-primary">{index + 1}.</span>{item.name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {item.category} · {channelLabel(item.channel)} · {item.order_count} commande(s)
                              </p>
                            </div>
                            <strong className="whitespace-nowrap text-sm tabular-nums">
                              {item.units_confirmed} portion(s)
                            </strong>
                          </div>
                          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-primary"
                              style={{ width: String(item.units_confirmed * 100 / max) + "%" }} />
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {item.units_completed} servies/finalisées · {chf(item.estimated_value_chf)} indicatifs
                            {item.units_recorded > item.units_confirmed
                              ? " · " + (item.units_recorded - item.units_confirmed) + " non confirmée(s)" : ""}
                          </p>
                        </div>
                      );
                    })}
                  </div>}
              </CardContent>
            </Card>
            <Card className="rounded-2xl">
              <CardHeader><CardTitle className="font-serif text-xl">Commandes par heure</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex h-40 items-end gap-1" role="img"
                  aria-label="Répartition horaire des commandes confirmées, heures suisses">
                  {insights.data!.hours.map((item) => (
                    <div key={item.hour} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
                      title={String(item.hour) + " h : " + item.orders + " commande(s)"}>
                      <div className="w-full rounded-t bg-primary/85"
                        style={{ height: String(Math.max(2, 120 * item.orders / maxHour)) + "px" }} />
                      <span className="text-[10px] text-muted-foreground">
                        {item.hour % 3 === 0 ? String(item.hour) : ""}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>0 h</span><span>12 h</span><span>23 h</span>
                </div>
                <div className="space-y-2 border-t pt-3">
                  {insights.data!.weekdays.map((item) =>
                    <div className="grid grid-cols-[38px_1fr_36px] items-center gap-2" key={item.day}>
                      <span className="text-xs">{WEEKDAYS[item.day - 1]}</span>
                      <div className="h-3 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary/75"
                          style={{ width: String(100 * item.orders / maxWeekday) + "%" }} />
                      </div>
                      <span className="text-right text-xs tabular-nums">{item.orders}</span>
                    </div>)}
                </div>
              </CardContent>
            </Card>
          </div>
          <Card className="rounded-2xl">
            <CardHeader><CardTitle className="flex items-center gap-2 font-serif text-xl">
              <Activity className="h-5 w-5 text-primary" /> Évolution des commandes confirmées
            </CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div className="flex h-36 items-end gap-1 overflow-x-auto pb-1">
                {trend.map((item) => (
                  <div key={item.label} className="flex h-full min-w-6 flex-1 flex-col items-center justify-end gap-1"
                    title={item.label + " : " + item.orders + " commande(s)"}>
                    <div className="w-full rounded-t bg-primary/80"
                      style={{ height: String(Math.max(2, 105 * item.orders / maxTrend)) + "px" }} />
                    <span className="w-full truncate text-center text-[9px] text-muted-foreground">
                      {trend.length > 16 ? (trend.indexOf(item) % 4 === 0 ? item.label : "") : item.label}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {days <= 30 ? "Détail quotidien" : "Regroupement mensuel"} · {summary.excluded_orders} commande(s)
                exclue(s) des indicateurs confirmés.
              </p>
              <div className="flex flex-wrap gap-2 pt-2">
                <Badge variant="outline">Salle : {chf(summary.room_value_chf)} indicatifs</Badge>
                <Badge variant="outline">En ligne : {chf(summary.online_value_chf)} indicatifs</Badge>
                <Badge variant="secondary">{summary.completed_orders} commande(s) finalisée(s)</Badge>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl">
            <CardHeader><CardTitle className="font-serif text-xl">États enregistrés</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {insights.data!.statuses.length === 0
                ? <p className="text-sm text-muted-foreground">Aucune activité dans cette fenêtre.</p>
                : insights.data!.statuses.map((item) => <Badge variant="outline"
                  key={item.channel + ":" + item.status}>
                  {channelLabel(item.channel)} · {statusLabels[item.status] || item.status} : {item.orders}
                </Badge>)}
            </CardContent>
          </Card>
        </>
      ) : null}

      <Card className="rounded-2xl">
        <CardHeader><CardTitle className="flex items-center gap-2 font-serif text-xl">
          <CalendarDays className="h-5 w-5 text-primary" /> Historique détaillé
        </CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Tous les statuts sont conservés, y compris les tickets servis, annulés et les paiements échoués.
            Les prix des commandes en salle sont des estimations, pas des règlements confirmés.
          </p>
          {history.isPending ? <p role="status" className="py-5 text-sm text-muted-foreground">
            Chargement des commandes…
          </p> : history.isError ? (
            <div className="space-y-2"><p role="alert" className="text-sm text-destructive">
              Historique indisponible ou accès refusé.
            </p><Button variant="outline" onClick={() => void history.refetch()}>Réessayer</Button></div>
          ) : history.data?.orders.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">Aucune commande sur cette période.</p>
          ) : (
            <div className="space-y-2">
              {history.data?.orders.map((order) =>
                <details key={order.channel + ":" + order.id}
                  className="group rounded-xl border bg-background p-3">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">
                        {order.channel === "salle"
                          ? "Table " + (order.table_number || "?")
                          : "Commande en ligne"}
                        <span className="ml-2 font-normal text-muted-foreground">
                          #{order.id.slice(0, 8)}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {localDate(order.created_at)} · {statusLabels[order.status] || order.status}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{channelLabel(order.channel)}</Badge>
                      <span className="text-sm font-semibold tabular-nums">{chf(order.amount_chf)}</span>
                      <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
                    </div>
                  </summary>
                  <div className="mt-3 space-y-3 border-t pt-3">
                    <ul className="space-y-1 text-sm">
                      {order.items.map((item, index) =>
                        <li key={String(item.menu_item_id) + ":" + index}
                          className="flex justify-between gap-2">
                          <span>{item.quantity} × {item.name}</span>
                          <span className="tabular-nums">{chf(item.unit_price * item.quantity)}</span>
                        </li>)}
                    </ul>
                    <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                      {order.started_at && <p>Début : {localDate(order.started_at)}</p>}
                      {order.ready_at && <p>Prêt : {localDate(order.ready_at)}</p>}
                      {order.finished_at && <p>Finalisé : {localDate(order.finished_at)}</p>}
                      {order.cancelled_at && <p>Annulé : {localDate(order.cancelled_at)}</p>}
                      {order.payment_status && <p>Paiement : {order.payment_status}</p>}
                      {order.source && <p>Origine : {order.source}</p>}
                      {order.scheduled_for && <p>Prévu : {localDate(order.scheduled_for)}</p>}
                      {order.discount_chf > 0 && <p>Remise : {chf(order.discount_chf)}</p>}
                      {order.tax_chf > 0 && <p>Taxes enregistrées : {chf(order.tax_chf)}</p>}
                      {order.tip_chf > 0 && <p>Pourboire : {chf(order.tip_chf)}</p>}
                    </div>
                  </div>
                </details>)}
            </div>
          )}
          {history.data && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
              <span className="text-sm text-muted-foreground">
                {history.data.total.toLocaleString("fr-CH")} commande(s) dans cette fenêtre
                {" · "}page {page + 1}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 0}
                  onClick={() => setPage((value) => Math.max(0, value - 1))}>
                  <ChevronLeft className="mr-1 h-4 w-4" /> Précédente
                </Button>
                <Button variant="outline" size="sm"
                  disabled={(page + 1) * 30 >= history.data.total || page >= 1000}
                  onClick={() => setPage((value) => value + 1)}>
                  Suivante <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
