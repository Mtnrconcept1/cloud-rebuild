import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  Clock3,
  RotateCcw,
  Search,
  ShoppingCart,
  Store,
  Users,
} from "lucide-react";

import AdminOperationDetailSheet from "@/components/admin/AdminOperationDetailSheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getSupabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import {
  getDefaultAdminHistoryFilters,
  getOrderTypePresentation,
  getReservationFeaturePresentation,
  getUniqueCustomerCount,
  getUniqueRestaurantCount,
  normalizeOrderHistoryRow,
  normalizeReservationHistoryRow,
  orderMatchesSearchTerm,
  reservationMatchesSearchTerm,
  type AdminHistoryTab,
  type AdminOrderHistoryItem,
  type AdminReservationHistoryItem,
  type AdminRestaurantOption,
} from "./adminOrdersReservationsShared";

const supabase = getSupabase();

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

function formatAmount(value: number) {
  return `${value.toFixed(2)} CHF`;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString("fr-CH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatReservationDate(dateValue: string, timeValue: string) {
  const date = new Date(`${dateValue}T${timeValue || "00:00:00"}`);
  if (Number.isNaN(date.getTime())) {
    return `${dateValue} ${timeValue}`.trim();
  }

  return date.toLocaleString("fr-CH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getStatusBadgeClass(status: string | null | undefined) {
  const normalized = String(status || "").trim().toLowerCase();

  if (["paid", "delivered", "completed", "confirmed"].includes(normalized)) {
    return "bg-emerald-100 text-emerald-800";
  }

  if (["cancelled", "canceled", "failed", "no_show", "refunded"].includes(normalized)) {
    return "bg-red-100 text-red-800";
  }

  if (["pending", "awaiting_payment", "processing"].includes(normalized)) {
    return "bg-amber-100 text-amber-800";
  }

  return "bg-slate-100 text-slate-700";
}

function toStartOfDayIso(dateValue: string) {
  return `${dateValue}T00:00:00`;
}

function toEndOfDayIso(dateValue: string) {
  return `${dateValue}T23:59:59.999`;
}

function MetricsCard({
  title,
  value,
  description,
  icon: Icon,
}: {
  title: string;
  value: string;
  description: string;
  icon: typeof CalendarDays;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

async function fetchRestaurantOptions() {
  const { data, error } = await supabase
    .from("restaurants")
    .select("id, name")
    .order("name");

  if (error) throw error;

  return (data || []) as AdminRestaurantOption[];
}

async function fetchOrderHistory(
  restaurantId: string,
  startDate: string,
  endDate: string,
) {
  let query = (supabase as any)
    .from("orders")
    .select(`
      id,
      order_number,
      created_at,
      status,
      payment_status,
      total_amount,
      delivery_address,
      notes,
      metadata,
      restaurant_id,
      user_id,
      restaurants (
        id,
        name
      ),
      customer:profiles!orders_user_id_fkey_profiles (
        user_id,
        full_name,
        phone,
        city,
        address
      ),
      order_items (
        id,
        quantity,
        unit_price,
        total_price,
        metadata,
        menu_items (
          name
        ),
        anti_waste_offers (
          title
        ),
        order_item_modifiers (
          name,
          quantity,
          unit_price
        )
      )
    `)
    .order("created_at", { ascending: false })
    .range(0, 999);

  if (restaurantId !== "all") {
    query = query.eq("restaurant_id", restaurantId);
  }

  if (startDate) {
    query = query.gte("created_at", toStartOfDayIso(startDate));
  }

  if (endDate) {
    query = query.lte("created_at", toEndOfDayIso(endDate));
  }

  const { data, error } = await query;
  if (error) throw error;

  return ((data || []) as Record<string, unknown>[]).map(normalizeOrderHistoryRow);
}

async function fetchReservationHistory(
  restaurantId: string,
  startDate: string,
  endDate: string,
) {
  let query = (supabase as any)
    .from("reservations")
    .select(`
      id,
      created_at,
      date,
      time,
      reservation_time,
      status,
      feature,
      total_amount,
      party_size,
      notes,
      special_requests,
      order_reference,
      payment_method,
      billing_fee_chf,
      metadata,
      preorder_items,
      restaurant_id,
      user_id,
      restaurants (
        id,
        name
      )
    `)
    .order("date", { ascending: false })
    .order("time", { ascending: false })
    .range(0, 999);

  if (restaurantId !== "all") {
    query = query.eq("restaurant_id", restaurantId);
  }

  if (startDate) {
    query = query.gte("date", startDate);
  }

  if (endDate) {
    query = query.lte("date", endDate);
  }

  const { data, error } = await query;
  if (error) throw error;

  const reservationRows = (data || []) as Record<string, unknown>[];
  const userIds = Array.from(new Set(
    reservationRows
      .map((row) => String(row.user_id || "").trim())
      .filter(Boolean),
  ));

  let profileMap = new Map<string, ProfileRow>();
  if (userIds.length > 0) {
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("user_id, full_name, phone, city, address, id, avatar_url, created_at, current_tier, loyalty_points, updated_at")
      .in("user_id", userIds);

    if (profilesError) throw profilesError;

    profileMap = new Map((profiles || []).map((profile) => [profile.user_id, profile]));
  }

  return reservationRows.map((row) => normalizeReservationHistoryRow(row, profileMap));
}

export default function AdminOrdersReservations() {
  const defaultFilters = useMemo(() => getDefaultAdminHistoryFilters(), []);
  const [activeTab, setActiveTab] = useState<AdminHistoryTab>("orders");
  const [search, setSearch] = useState("");
  const [restaurantFilter, setRestaurantFilter] = useState("all");
  const [startDate, setStartDate] = useState(defaultFilters.startDate);
  const [endDate, setEndDate] = useState(defaultFilters.endDate);
  const [selectedOperation, setSelectedOperation] = useState<
    | { kind: "order"; item: AdminOrderHistoryItem }
    | { kind: "reservation"; item: AdminReservationHistoryItem }
    | null
  >(null);

  const deferredSearch = useDeferredValue(search);

  const {
    data: restaurants = [],
    isLoading: isRestaurantsLoading,
    error: restaurantsError,
  } = useQuery({
    queryKey: ["admin-orders-reservations-restaurants"],
    queryFn: fetchRestaurantOptions,
  });

  const {
    data: orders = [],
    isLoading: isOrdersLoading,
    error: ordersError,
  } = useQuery({
    queryKey: ["admin-orders-history", restaurantFilter, startDate, endDate],
    queryFn: () => fetchOrderHistory(restaurantFilter, startDate, endDate),
  });

  const {
    data: reservations = [],
    isLoading: isReservationsLoading,
    error: reservationsError,
  } = useQuery({
    queryKey: ["admin-reservations-history", restaurantFilter, startDate, endDate],
    queryFn: () => fetchReservationHistory(restaurantFilter, startDate, endDate),
  });

  useEffect(() => {
    setSelectedOperation(null);
  }, [activeTab, restaurantFilter, startDate, endDate]);

  const filteredOrders = useMemo(() => (
    orders.filter((order) => orderMatchesSearchTerm(order, deferredSearch))
  ), [orders, deferredSearch]);

  const filteredReservations = useMemo(() => (
    reservations.filter((reservation) => reservationMatchesSearchTerm(reservation, deferredSearch))
  ), [reservations, deferredSearch]);

  const currentMetrics = useMemo(() => {
    if (activeTab === "orders") {
      return {
        count: filteredOrders.length,
        totalAmount: filteredOrders.reduce((sum, order) => sum + order.totalAmount, 0),
        customers: getUniqueCustomerCount(filteredOrders),
        restaurants: getUniqueRestaurantCount(filteredOrders),
      };
    }

    return {
      count: filteredReservations.length,
      totalAmount: filteredReservations.reduce((sum, reservation) => sum + reservation.totalAmount, 0),
      customers: getUniqueCustomerCount(filteredReservations),
      restaurants: getUniqueRestaurantCount(filteredReservations),
      covers: filteredReservations.reduce((sum, reservation) => sum + reservation.partySize, 0),
    };
  }, [activeTab, filteredOrders, filteredReservations]);

  const activeError = activeTab === "orders" ? ordersError : reservationsError;
  const activeLoading = isRestaurantsLoading || (activeTab === "orders" ? isOrdersLoading : isReservationsLoading);

  return (
    <div className="container space-y-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Commandes et Reservations</h1>
          <p className="text-sm text-muted-foreground">
            Historique admin des operations clients, avec recherche par client, restaurant, reference et details complets par operation.
          </p>
        </div>
        <Badge variant="outline" className="px-3 py-1 text-[11px] uppercase tracking-[0.25em]">
          Admin
        </Badge>
      </div>

      <Card>
        <CardContent className="space-y-4 py-4">
          <div className="grid gap-3 lg:grid-cols-[1.4fr_220px_180px_180px_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Rechercher un client, un restaurant, une reference, une note ou un article"
                className="pl-9"
              />
            </div>

            <Select value={restaurantFilter} onValueChange={setRestaurantFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Restaurant" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les restaurants</SelectItem>
                {restaurants.map((restaurant) => (
                  <SelectItem key={restaurant.id} value={restaurant.id}>
                    {restaurant.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />

            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={() => {
                setSearch("");
                setRestaurantFilter("all");
                setStartDate(defaultFilters.startDate);
                setEndDate(defaultFilters.endDate);
              }}
            >
              <RotateCcw className="h-4 w-4" />
              Reinitialiser
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary">Periode par defaut: 30 derniers jours</Badge>
            <span>Efface les dates pour elargir la recherche.</span>
            {restaurantsError ? <span className="text-destructive">Impossible de charger les restaurants.</span> : null}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricsCard
          title="Resultats"
          value={String(currentMetrics.count)}
          description={activeTab === "orders" ? "Commandes visibles" : "Reservations visibles"}
          icon={activeTab === "orders" ? ShoppingCart : CalendarDays}
        />
        <MetricsCard
          title={activeTab === "orders" ? "Volume commandes" : "Montant reservations"}
          value={formatAmount(currentMetrics.totalAmount)}
          description={activeTab === "orders" ? "Total du filtre courant" : "Montant total du filtre courant"}
          icon={ShoppingCart}
        />
        <MetricsCard
          title="Clients"
          value={String(currentMetrics.customers)}
          description="Clients uniques sur le filtre courant"
          icon={Users}
        />
        <MetricsCard
          title={activeTab === "orders" ? "Restaurants" : "Restaurants / Couverts"}
          value={activeTab === "orders" ? String(currentMetrics.restaurants) : `${currentMetrics.restaurants} / ${currentMetrics.covers || 0}`}
          description={activeTab === "orders" ? "Restaurants concernes" : "Restaurants et couverts visibles"}
          icon={Store}
        />
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as AdminHistoryTab)}
        className="space-y-6"
      >
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="orders">Commandes ({filteredOrders.length})</TabsTrigger>
          <TabsTrigger value="reservations">Reservations ({filteredReservations.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Historique des commandes</CardTitle>
            </CardHeader>
            <CardContent className="py-0">
              {activeLoading ? (
                <div className="space-y-3 py-6">
                  {[1, 2, 3].map((index) => (
                    <div key={index} className="h-20 animate-pulse rounded-xl bg-muted" />
                  ))}
                </div>
              ) : activeError ? (
                <div className="py-10 text-center text-destructive">
                  Impossible de charger l&apos;historique des commandes.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Commande</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Restaurant</TableHead>
                      <TableHead>Details</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="text-right">Montant</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOrders.map((order) => {
                      const orderType = getOrderTypePresentation(order.orderType);
                      return (
                        <TableRow
                          key={order.id}
                          className="cursor-pointer hover:bg-muted/30"
                          onClick={() => setSelectedOperation({ kind: "order", item: order })}
                        >
                          <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                            {formatDateTime(order.createdAt)}
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <p className="font-medium">{order.orderNumber || `CMD-${order.id.slice(0, 8)}`}</p>
                              <p className="text-xs text-muted-foreground">{order.id}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <p className="font-medium">{order.customer.displayName}</p>
                              {order.customer.phone ? (
                                <p className="text-xs text-muted-foreground">{order.customer.phone}</p>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{order.restaurant.name}</TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <Badge className={orderType.className}>{orderType.label}</Badge>
                              <p className="text-xs text-muted-foreground">
                                {order.items.length} article{order.items.length > 1 ? "s" : ""}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-2">
                              <Badge className={getStatusBadgeClass(order.status)}>{order.status}</Badge>
                              {order.paymentStatus ? (
                                <Badge variant="secondary" className={getStatusBadgeClass(order.paymentStatus)}>
                                  {order.paymentStatus}
                                </Badge>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-semibold">{formatAmount(order.totalAmount)}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelectedOperation({ kind: "order", item: order });
                              }}
                            >
                              Voir
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}

                    {filteredOrders.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                          Aucune commande ne correspond au filtre courant.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reservations" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Historique des reservations</CardTitle>
            </CardHeader>
            <CardContent className="py-0">
              {activeLoading ? (
                <div className="space-y-3 py-6">
                  {[1, 2, 3].map((index) => (
                    <div key={index} className="h-20 animate-pulse rounded-xl bg-muted" />
                  ))}
                </div>
              ) : activeError ? (
                <div className="py-10 text-center text-destructive">
                  Impossible de charger l&apos;historique des reservations.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Reservation</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Restaurant</TableHead>
                      <TableHead>Details</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="text-right">Montant</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredReservations.map((reservation) => {
                      const feature = getReservationFeaturePresentation(reservation.feature);
                      return (
                        <TableRow
                          key={reservation.id}
                          className="cursor-pointer hover:bg-muted/30"
                          onClick={() => setSelectedOperation({ kind: "reservation", item: reservation })}
                        >
                          <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                            {formatReservationDate(reservation.reservationDate, reservation.displayTime)}
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <p className="font-medium">{reservation.reference}</p>
                              <p className="text-xs text-muted-foreground">{reservation.id}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <p className="font-medium">{reservation.customer.displayName}</p>
                              {reservation.customer.phone ? (
                                <p className="text-xs text-muted-foreground">{reservation.customer.phone}</p>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{reservation.restaurant.name}</TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              {feature ? <Badge className={feature.className}>{feature.label}</Badge> : null}
                              <p className="text-xs text-muted-foreground">
                                {reservation.partySize} pers. · {reservation.preorderItems.length} precommande{reservation.preorderItems.length > 1 ? "s" : ""}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={getStatusBadgeClass(reservation.status)}>{reservation.status}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-semibold">{formatAmount(reservation.totalAmount)}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelectedOperation({ kind: "reservation", item: reservation });
                              }}
                            >
                              Voir
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}

                    {filteredReservations.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                          Aucune reservation ne correspond au filtre courant.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AdminOperationDetailSheet
        operation={selectedOperation}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedOperation(null);
          }
        }}
      />
    </div>
  );
}
