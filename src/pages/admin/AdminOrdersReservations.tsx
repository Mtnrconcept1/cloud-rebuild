import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  RotateCcw,
  Search,
  ShoppingCart,
  Store,
  Users,
} from "lucide-react";

import AdminOperationDetailSheet from "@/components/admin/AdminOperationDetailSheet";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import { Badge } from "@/components/ui/badge";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { getSupabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import {
  fetchAdminRefundQueue,
  markRefundApplied,
  processRefund,
  toAmount,
  type RefundQueueItem,
} from "@/lib/refundMutations";
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
type AdminDashboardTab = AdminHistoryTab | "refunds";

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
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<AdminDashboardTab>("orders");
  const [search, setSearch] = useState("");
  const [restaurantFilter, setRestaurantFilter] = useState("all");
  const [startDate, setStartDate] = useState(defaultFilters.startDate);
  const [endDate, setEndDate] = useState(defaultFilters.endDate);
  const [selectedOperation, setSelectedOperation] = useState<
    | { kind: "order"; item: AdminOrderHistoryItem }
    | { kind: "reservation"; item: AdminReservationHistoryItem }
    | null
  >(null);
  const [selectedRefund, setSelectedRefund] = useState<RefundQueueItem | null>(null);

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

  const {
    data: refundQueue = [],
    isLoading: isRefundQueueLoading,
    error: refundQueueError,
  } = useQuery({
    queryKey: ["admin-refund-queue"],
    queryFn: fetchAdminRefundQueue,
  });

  useEffect(() => {
    setSelectedOperation(null);
    setSelectedRefund(null);
  }, [activeTab, restaurantFilter, startDate, endDate]);

  const filteredOrders = useMemo(() => (
    orders.filter((order) => orderMatchesSearchTerm(order, deferredSearch))
  ), [orders, deferredSearch]);

  const filteredReservations = useMemo(() => (
    reservations.filter((reservation) => reservationMatchesSearchTerm(reservation, deferredSearch))
  ), [reservations, deferredSearch]);

  const filteredRefunds = useMemo(() => {
    const normalizedSearch = deferredSearch.trim().toLowerCase();

    return refundQueue.filter((refund) => {
      if (restaurantFilter !== "all" && refund.restaurant_id !== restaurantFilter) {
        return false;
      }

      const effectiveDate = String(refund.cancelled_at || refund.created_at || "");
      if (startDate && effectiveDate && effectiveDate < toStartOfDayIso(startDate)) {
        return false;
      }
      if (endDate && effectiveDate && effectiveDate > toEndOfDayIso(endDate)) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const haystack = [
        refund.reference,
        refund.item_label,
        refund.restaurant_name,
        refund.customer_name,
        refund.customer_phone,
        refund.feature,
        refund.target_id,
        refund.payment_method,
      ]
        .map((value) => String(value || "").toLowerCase())
        .join(" ");

      return haystack.includes(normalizedSearch);
    });
  }, [deferredSearch, endDate, refundQueue, restaurantFilter, startDate]);

  const currentMetrics = useMemo(() => {
    if (activeTab === "orders") {
      return {
        count: filteredOrders.length,
        totalAmount: filteredOrders.reduce((sum, order) => sum + order.totalAmount, 0),
        customers: getUniqueCustomerCount(filteredOrders),
        restaurants: getUniqueRestaurantCount(filteredOrders),
      };
    }

    if (activeTab === "refunds") {
      return {
        count: filteredRefunds.length,
        totalAmount: filteredRefunds.reduce((sum, refund) => sum + toAmount(refund.remaining_amount_chf), 0),
        customers: new Set(filteredRefunds.map((refund) => refund.customer_user_id).filter(Boolean)).size,
        restaurants: new Set(filteredRefunds.map((refund) => refund.restaurant_id).filter(Boolean)).size,
      };
    }

    return {
      count: filteredReservations.length,
      totalAmount: filteredReservations.reduce((sum, reservation) => sum + reservation.totalAmount, 0),
      customers: getUniqueCustomerCount(filteredReservations),
      restaurants: getUniqueRestaurantCount(filteredReservations),
      covers: filteredReservations.reduce((sum, reservation) => sum + reservation.partySize, 0),
    };
  }, [activeTab, filteredOrders, filteredRefunds, filteredReservations]);

  const activeError = activeTab === "orders"
    ? ordersError
    : activeTab === "reservations"
      ? reservationsError
      : refundQueueError;
  const activeLoading = isRestaurantsLoading || (
    activeTab === "orders"
      ? isOrdersLoading
      : activeTab === "reservations"
        ? isReservationsLoading
        : isRefundQueueLoading
  );

  const refundStripeMutation = useMutation({
    mutationFn: async (refund: RefundQueueItem) => {
      const result = await processRefund({
        targetType: refund.target_type,
        targetId: refund.target_id,
        reason: refund.refund_reason || undefined,
        amountChf: toAmount(refund.remaining_amount_chf),
      });

      if (!result.ok) {
        throw new Error(result.errorMessage || "Remboursement impossible.");
      }

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-refund-queue"] });
      setSelectedRefund(null);
      toast({ title: "Remboursement lance", description: "Le remboursement Stripe a ete enregistre." });
    },
    onError: (error: Error) => {
      toast({ title: "Remboursement impossible", description: error.message, variant: "destructive" });
    },
  });

  const refundMarkMutation = useMutation({
    mutationFn: async (refund: RefundQueueItem) => {
      const result = await markRefundApplied({
        targetType: refund.target_type,
        targetId: refund.target_id,
        amountChf: toAmount(refund.remaining_amount_chf),
        reason: refund.refund_reason || undefined,
      });

      if (!result.ok) {
        throw new Error(result.errorMessage || "Mise a jour impossible.");
      }

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-refund-queue"] });
      setSelectedRefund(null);
      toast({ title: "Remboursement marque", description: "La ligne a ete marquee comme remboursee." });
    },
    onError: (error: Error) => {
      toast({ title: "Mise a jour impossible", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="container space-y-6 py-8">
      <DashboardPageHero
        badge="Operations admin"
        title="Commandes et Reservations"
        description="Historique admin des operations clients, avec recherche par client, restaurant, reference et details complets par operation."
        icon={ShoppingCart}
        tone="violet"
        visualLabel="Operations"
        stats={[
          { label: "Commandes", value: orders.length, icon: ShoppingCart },
          { label: "Reservations", value: reservations.length, icon: CalendarDays },
          { label: "Remboursements", value: refundQueue.length, icon: RotateCcw },
        ]}
      />

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
          description={activeTab === "orders"
            ? "Commandes visibles"
            : activeTab === "reservations"
              ? "Reservations visibles"
              : "Remboursements a traiter"}
          icon={activeTab === "orders" ? ShoppingCart : CalendarDays}
        />
        <MetricsCard
          title={activeTab === "orders"
            ? "Volume commandes"
            : activeTab === "reservations"
              ? "Montant reservations"
              : "Montant a rembourser"}
          value={formatAmount(currentMetrics.totalAmount)}
          description={activeTab === "orders"
            ? "Total du filtre courant"
            : activeTab === "reservations"
              ? "Montant total du filtre courant"
              : "Reste a rembourser sur le filtre courant"}
          icon={ShoppingCart}
        />
        <MetricsCard
          title="Clients"
          value={String(currentMetrics.customers)}
          description="Clients uniques sur le filtre courant"
          icon={Users}
        />
        <MetricsCard
          title={activeTab === "orders"
            ? "Restaurants"
            : activeTab === "reservations"
              ? "Restaurants / Couverts"
              : "Restaurants"}
          value={activeTab === "orders"
            ? String(currentMetrics.restaurants)
            : activeTab === "reservations"
              ? `${currentMetrics.restaurants} / ${currentMetrics.covers || 0}`
              : String(currentMetrics.restaurants)}
          description={activeTab === "orders"
            ? "Restaurants concernes"
            : activeTab === "reservations"
              ? "Restaurants et couverts visibles"
              : "Restaurants avec remboursement en attente"}
          icon={Store}
        />
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as AdminDashboardTab)}
        className="space-y-6"
      >
        <TabsList className="grid w-full max-w-xl grid-cols-3">
          <TabsTrigger value="orders">Commandes ({filteredOrders.length})</TabsTrigger>
          <TabsTrigger value="reservations">Reservations ({filteredReservations.length})</TabsTrigger>
          <TabsTrigger value="refunds">Remboursements ({filteredRefunds.length})</TabsTrigger>
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

        <TabsContent value="refunds" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>File des remboursements</CardTitle>
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
                  Impossible de charger la file des remboursements.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Restaurant</TableHead>
                      <TableHead>Details</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="text-right">Montant</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRefunds.map((refund) => (
                      <TableRow
                        key={`${refund.target_type}-${refund.target_id}`}
                        className="cursor-pointer hover:bg-muted/30"
                        onClick={() => setSelectedRefund(refund)}
                      >
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {formatDateTime(String(refund.cancelled_at || refund.created_at))}
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <p className="font-medium">{refund.reference || refund.target_id.slice(0, 8)}</p>
                            <p className="text-xs text-muted-foreground">{refund.target_id}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <p className="font-medium">{refund.customer_name || "Client inconnu"}</p>
                            {refund.customer_phone ? (
                              <p className="text-xs text-muted-foreground">{refund.customer_phone}</p>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{refund.restaurant_name || "-"}</TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <Badge variant="outline">{refund.target_type === "order" ? "Commande" : "Reservation"}</Badge>
                            <p className="text-xs text-muted-foreground">
                              {refund.feature || "Sans libelle"} · annule par {refund.cancelled_by || "inconnu"}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={getStatusBadgeClass(refund.refund_status)}>{refund.refund_status || "pending"}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatAmount(toAmount(refund.remaining_amount_chf))}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedRefund(refund);
                            }}
                          >
                            Voir
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}

                    {filteredRefunds.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                          Aucun remboursement en attente pour le filtre courant.
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

      <Dialog open={Boolean(selectedRefund)} onOpenChange={(open) => { if (!open) setSelectedRefund(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Traiter le remboursement</DialogTitle>
            <DialogDescription>
              {selectedRefund
                ? `${selectedRefund.reference || selectedRefund.target_id} · ${selectedRefund.restaurant_name || "Restaurant"}`
                : ""}
            </DialogDescription>
          </DialogHeader>

          {selectedRefund ? (
            <div className="space-y-4">
              <div className="rounded-xl border bg-muted/20 p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Client</p>
                    <p className="font-medium">{selectedRefund.customer_name || "Client inconnu"}</p>
                    {selectedRefund.customer_phone ? (
                      <p className="text-xs text-muted-foreground">{selectedRefund.customer_phone}</p>
                    ) : null}
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Montant a rembourser</p>
                    <p className="text-lg font-bold text-destructive">
                      {formatAmount(toAmount(selectedRefund.remaining_amount_chf))}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Mode de paiement: {selectedRefund.payment_method || "carte"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <p><strong>Type:</strong> {selectedRefund.target_type === "order" ? "Commande" : "Reservation"}</p>
                <p><strong>Feature:</strong> {selectedRefund.feature || "-"}</p>
                <p><strong>Annule par:</strong> {selectedRefund.cancelled_by || "-"}</p>
                <p><strong>Statut refund:</strong> {selectedRefund.refund_status || "pending"}</p>
                {selectedRefund.refund_reason ? (
                  <p><strong>Motif:</strong> {selectedRefund.refund_reason}</p>
                ) : null}
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedRefund(null)}>
              Fermer
            </Button>
            <Button
              variant="outline"
              disabled={!selectedRefund || refundMarkMutation.isPending || refundStripeMutation.isPending}
              onClick={() => {
                if (!selectedRefund) return;
                refundMarkMutation.mutate(selectedRefund);
              }}
            >
              {refundMarkMutation.isPending ? "Mise a jour..." : "Marquer rembourse"}
            </Button>
            <Button
              disabled={!selectedRefund || refundStripeMutation.isPending || refundMarkMutation.isPending}
              onClick={() => {
                if (!selectedRefund) return;
                refundStripeMutation.mutate(selectedRefund);
              }}
            >
              {refundStripeMutation.isPending ? "Remboursement..." : "Rembourser via Stripe"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
