import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  CreditCard,
  Loader2,
  MapPin,
  Minus,
  Plus,
  Sparkles,
  TrendingDown,
  Truck,
  Users,
} from "lucide-react";

import AddressAutocomplete from "@/components/AddressAutocomplete";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { getSupabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { buildCheckoutReturnUrl } from "@/lib/checkoutReturnUrl";
import { invokeSupabaseFunction } from "@/lib/session";

const supabase = getSupabase();

const COUNTDOWN_MINUTES = 30;
const MAX_MEMBERS = 10;
const DISCOUNT_STEP = 5;
const MAX_DISCOUNT = 50;

type Step = "browse" | "menu" | "status";

type ConfirmMatchGroupAuthorizationResult = {
  ok?: boolean;
  already_confirmed?: boolean;
  confirmed?: boolean;
  pending_confirmation?: boolean;
  retry_after_seconds?: number;
  group_id?: string;
  member_order_id?: string;
};

type RestaurantSummary = {
  id: string;
  name: string;
  cuisine_type?: string | null;
  image_url?: string | null;
  city?: string | null;
};

type MatchGroup = {
  id: string;
  restaurant_id: string;
  area: string;
  time_slot: string;
  max_members: number;
  discount_percentage: number;
  final_discount_percentage?: number | null;
  status: string;
  is_active: boolean;
  expires_at: string;
  scheduled_at?: string | null;
  lock_at?: string | null;
  member_count: number;
  restaurant?: RestaurantSummary;
  restaurants?: RestaurantSummary;
};

type GroupMemberOrder = {
  id: string;
  group_id: string;
  user_id: string;
  restaurant_id: string;
  items: Array<{
    menu_item_id: string;
    name: string;
    quantity: number;
    original_price: number;
    restaurant_id: string;
    restaurant_name: string;
  }>;
  subtotal: number;
  final_discount_percentage: number;
  final_discount_amount: number;
  final_total: number;
  status: string;
  payment_status: string;
  payment_due_at?: string | null;
  updated_at?: string | null;
  metadata?: Record<string, any> | null;
  order_groups?: (Partial<MatchGroup> & { restaurants?: RestaurantSummary }) | null;
};

function isMissingRpcError(error: unknown) {
  const message = String((error as { message?: unknown })?.message || "").toLowerCase();
  const code = String((error as { code?: unknown })?.code || "");
  return code === "404" || code === "42883" || message.includes("not found") || message.includes("could not find the function");
}

function formatCountdown(target: string | null | undefined, nowMs: number) {
  if (!target) return "--:--";
  const diff = Math.max(0, new Date(target).getTime() - nowMs);
  const totalSeconds = Math.floor(diff / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatTime(value: string | null | undefined) {
  if (!value) return "--:--";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString("fr-CH", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function previewDiscount(memberCount: number) {
  return Math.min(MAX_DISCOUNT, Math.max(0, Math.max(memberCount, 0) * DISCOUNT_STEP));
}

function isPrepaid(order?: GroupMemberOrder | null) {
  return order?.payment_status === "authorized" || order?.payment_status === "captured";
}

function isLocked(group?: MatchGroup | null, order?: GroupMemberOrder | null, nowMs = Date.now()) {
  const lockAt = group?.lock_at || group?.expires_at || order?.payment_due_at;
  return Boolean(
    order?.status === "payment_pending"
      || group?.status === "payment_pending"
      || group?.status === "locked"
      || (lockAt && new Date(lockAt).getTime() <= nowMs),
  );
}

function paymentLabel(order?: GroupMemberOrder | null) {
  if (!order) return "À prépayer";
  if (order.payment_status === "captured") return "Payé";
  if (order.payment_status === "authorized") return "Prépayé";
  if (order.payment_status === "pending") return "Paiement à finaliser";
  return "À prépayer";
}

function normalizeGroup(row: any): MatchGroup {
  const restaurant = row.restaurant || row.restaurants || undefined;
  const memberCount = Number(row.member_count ?? row.group_members?.length ?? 0);
  const lockAt = row.lock_at || row.expires_at;

  return {
    id: String(row.id),
    restaurant_id: String(row.restaurant_id),
    area: String(row.area || "Ma position"),
    time_slot: String(row.time_slot || `Fin ${formatTime(lockAt)}`),
    max_members: Number(row.max_members || MAX_MEMBERS),
    discount_percentage: Number(row.discount_percentage ?? previewDiscount(memberCount)),
    final_discount_percentage: row.final_discount_percentage ?? null,
    status: String(row.status || "open"),
    is_active: row.is_active !== false,
    expires_at: String(row.expires_at || lockAt),
    scheduled_at: row.scheduled_at || lockAt,
    lock_at: lockAt,
    member_count: memberCount,
    restaurant,
    restaurants: row.restaurants,
  };
}

function groupFromOrder(order: GroupMemberOrder, restaurants: any[]) {
  const rawGroup = order.order_groups;
  const restaurant = rawGroup?.restaurants || restaurants.find((row) => row.id === (rawGroup?.restaurant_id || order.restaurant_id));
  const lockAt = rawGroup?.lock_at || rawGroup?.expires_at || order.payment_due_at || new Date().toISOString();

  return normalizeGroup({
    id: rawGroup?.id || order.group_id,
    restaurant_id: rawGroup?.restaurant_id || order.restaurant_id,
    area: rawGroup?.area || order.metadata?.delivery_address || "Ma position",
    time_slot: rawGroup?.time_slot || `Fin ${formatTime(lockAt)}`,
    max_members: rawGroup?.max_members || MAX_MEMBERS,
    discount_percentage: rawGroup?.discount_percentage ?? order.final_discount_percentage ?? previewDiscount(isPrepaid(order) ? 1 : 0),
    final_discount_percentage: rawGroup?.final_discount_percentage ?? order.final_discount_percentage ?? null,
    status: rawGroup?.status || order.status,
    is_active: rawGroup?.is_active ?? true,
    expires_at: rawGroup?.expires_at || lockAt,
    scheduled_at: rawGroup?.scheduled_at || lockAt,
    lock_at: lockAt,
    member_count: Number((rawGroup as any)?.member_count || (isPrepaid(order) ? 1 : 0)),
    restaurant,
  });
}

async function fetchGroups(): Promise<MatchGroup[]> {
  const { data: rpcData, error: rpcError } = await (supabase.rpc as any)("get_match_group_public_feed");
  if (!rpcError) return (rpcData || []).map(normalizeGroup);
  if (!isMissingRpcError(rpcError)) throw rpcError;

  const { data, error } = await supabase
    .from("order_groups" as any)
    .select("*, restaurants(id,name,cuisine_type,image_url,city), group_members(id)")
    .eq("is_active", true)
    .gt("expires_at", new Date().toISOString())
    .order("expires_at", { ascending: true })
    .limit(50);

  if (error) throw error;
  return (data || []).map(normalizeGroup);
}

export default function MatchGroupes() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>("browse");
  const [address, setAddress] = useState("");
  const [createMode, setCreateMode] = useState(false);
  const [activeGroup, setActiveGroup] = useState<MatchGroup | null>(null);
  const [selectedRestaurant, setSelectedRestaurant] = useState<any>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [nowMs, setNowMs] = useState(Date.now());
  const processedReturnKeys = useRef(new Set<string>());

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const { data: groups = [], isLoading: loadingGroups } = useQuery({
    queryKey: ["match-group-public-feed"],
    queryFn: fetchGroups,
    refetchInterval: 10_000,
    retry: 1,
  });

  const { data: restaurants = [] } = useQuery({
    queryKey: ["restaurants-group-all"],
    queryFn: async () => {
      const { data } = await supabase
        .from("restaurants")
        .select("*")
        .eq("is_active", true)
        .eq("delivery_available", true)
        .order("rating", { ascending: false });
      return data || [];
    },
  });

  const { data: menuItems = [] } = useQuery({
    queryKey: ["menu-group", selectedRestaurant?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("menu_items")
        .select("*")
        .eq("restaurant_id", selectedRestaurant.id)
        .eq("is_available", true)
        .order("category");
      return data || [];
    },
    enabled: !!selectedRestaurant,
  });

  const { data: myOrder } = useQuery({
    queryKey: ["match-group-order", activeGroup?.id, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("group_member_orders" as any)
        .select("*")
        .eq("group_id", activeGroup!.id)
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as GroupMemberOrder | null;
    },
    enabled: !!activeGroup?.id && !!user?.id,
    refetchInterval: 5_000,
  });

  const { data: savedOrders = [] } = useQuery({
    queryKey: ["my-match-group-orders", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("group_member_orders" as any)
        .select("*, order_groups(*, restaurants(id,name,cuisine_type,image_url,city))")
        .eq("user_id", user!.id)
        .in("status", ["joined", "payment_pending", "paid"])
        .order("updated_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data || []) as GroupMemberOrder[];
    },
    enabled: !!user?.id,
    refetchInterval: 5_000,
  });

  const displayedGroup = activeGroup ? groups.find((group) => group.id === activeGroup.id) || activeGroup : null;
  const memberCount = displayedGroup?.member_count || (isPrepaid(myOrder) ? 1 : 0);
  const savingsPercent = Number(displayedGroup?.discount_percentage ?? myOrder?.final_discount_percentage ?? previewDiscount(memberCount));
  const lockAt = displayedGroup?.lock_at || displayedGroup?.expires_at || null;
  const locked = isLocked(displayedGroup, myOrder, nowMs);
  const prepaid = isPrepaid(myOrder);

  const categories = useMemo(
    () => [...new Set(menuItems.map((item: any) => item.category || "Autres"))] as string[],
    [menuItems],
  );

  const count = Object.values(quantities).reduce((sum, qty) => sum + qty, 0);
  const subtotal = Object.entries(quantities).reduce((sum, [id, quantity]) => {
    const item = menuItems.find((menuItem: any) => menuItem.id === id);
    return sum + (item ? Number(item.price) * quantity : 0);
  }, 0);
  const estimatedDiscount = subtotal * (savingsPercent / 100);
  const estimatedCapture = subtotal - estimatedDiscount;

  const confirmReturn = useMutation({
    mutationFn: async (memberOrderId: string) => {
      const { data, error } = await invokeSupabaseFunction<ConfirmMatchGroupAuthorizationResult>("confirm-match-group-authorization", {
        body: { member_order_id: memberOrderId },
      });
      if (error) throw error;
      return data;
    },
    retry: false,
    onSuccess: (data) => {
      if (data?.pending_confirmation) {
        toast({
          title: "Prépaiement en cours de confirmation",
          description: "La commande sera synchronisée automatiquement dès que Stripe confirme le paiement.",
        });
        queryClient.invalidateQueries({ queryKey: ["match-group-public-feed"] });
        queryClient.invalidateQueries({ queryKey: ["my-match-group-orders", user?.id] });
        setStep("status");
        return;
      }

      toast({
        title: "Prépaiement confirmé",
        description: "Votre commande a été envoyée au restaurateur. La réduction finale sera déduite automatiquement.",
      });
      queryClient.invalidateQueries({ queryKey: ["match-group-public-feed"] });
      queryClient.invalidateQueries({ queryKey: ["my-match-group-orders", user?.id] });
      if (activeGroup?.id) queryClient.invalidateQueries({ queryKey: ["match-group-order", activeGroup.id, user?.id] });
      setStep("status");
    },
    onError: (error: any) => {
      toast({ title: "Vérification impossible", description: error.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    if (!user?.id) return;

    const params = new URLSearchParams(window.location.search);
    const status = params.get("match_group_authorized");
    const memberOrderId = params.get("member_order_id");
    if (!status) return;

    if (status === "1" && memberOrderId) {
      const returnKey = `${status}:${memberOrderId}`;
      if (processedReturnKeys.current.has(returnKey)) return;
      processedReturnKeys.current.add(returnKey);
      confirmReturn.mutate(memberOrderId);
    } else {
      toast({ title: "Prépaiement annulé", variant: "destructive" });
    }

    params.delete("match_group_authorized");
    params.delete("member_order_id");
    window.history.replaceState({}, "", `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    const dueGroups = groups.filter((group) => new Date(group.lock_at || group.expires_at).getTime() <= nowMs);
    if (dueGroups.length === 0) return;

    queryClient.invalidateQueries({ queryKey: ["match-group-public-feed"] });
    queryClient.invalidateQueries({ queryKey: ["my-match-group-orders", user.id] });
  }, [groups, nowMs, queryClient, user?.id]);

  const createGroup = useMutation({
    mutationFn: async (restaurant: any) => {
      if (!user) throw new Error("Connexion requise");
      const localLockAt = new Date(Date.now() + COUNTDOWN_MINUTES * 60 * 1000).toISOString();
      const { data: groupId, error } = await (supabase.rpc as any)("create_match_group", {
        p_restaurant_id: restaurant.id,
        p_area: address || "Ma position",
        p_scheduled_at: null,
        p_max_members: MAX_MEMBERS,
      });
      if (error) throw error;

      return {
        restaurant,
        group: normalizeGroup({
          id: groupId,
          restaurant_id: restaurant.id,
          area: address || "Ma position",
          time_slot: `Fin ${formatTime(localLockAt)}`,
          max_members: MAX_MEMBERS,
          discount_percentage: 0,
          status: "open",
          is_active: true,
          expires_at: localLockAt,
          scheduled_at: localLockAt,
          lock_at: localLockAt,
          member_count: 0,
          restaurant,
        }),
      };
    },
    onSuccess: ({ group, restaurant }) => {
      setActiveGroup(group);
      setSelectedRestaurant(restaurant);
      setQuantities({});
      setCreateMode(false);
      setStep("menu");
      queryClient.invalidateQueries({ queryKey: ["match-group-public-feed"] });
    },
    onError: (error: any) => {
      toast({ title: "Impossible de créer le groupe", description: error.message, variant: "destructive" });
    },
  });

  const prepay = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Connexion requise");
      if (!activeGroup || !selectedRestaurant) throw new Error("Groupe introuvable");
      if (locked) throw new Error("Le compte à rebours est terminé.");
      if (prepaid) throw new Error("Cette commande est déjà prépayée.");
      if (count <= 0 || subtotal <= 0) throw new Error("Ajoutez au moins un article.");

      const items = Object.entries(quantities)
        .map(([id, quantity]) => {
          const item = menuItems.find((menuItem: any) => menuItem.id === id);
          if (!item || quantity <= 0) return null;
          return {
            menu_item_id: item.id,
            name: item.name,
            quantity,
            original_price: Number(item.price),
            restaurant_id: selectedRestaurant.id,
            restaurant_name: selectedRestaurant.name,
          };
        })
        .filter(Boolean);

      const { data: memberOrderId, error } = await (supabase.rpc as any)("upsert_match_group_member_order", {
        p_group_id: activeGroup.id,
        p_items: items,
        p_subtotal: subtotal,
        p_metadata: {
          feature: "match-groupes",
          delivery_address: address,
          lock_at: activeGroup.lock_at || activeGroup.expires_at,
          prepayment_required: true,
        },
      });
      if (error) throw error;
      if (!memberOrderId) throw new Error("Commande Match groupe introuvable");

      const { data: checkout, error: checkoutError } = await (supabase.functions as any).invoke("authorize-match-group-order", {
        body: {
          group_member_order_id: memberOrderId,
          return_url: buildCheckoutReturnUrl("/match-groupes"),
        },
      });
      if (checkoutError) throw checkoutError;
      if (!checkout?.url) throw new Error("Lien de prépaiement introuvable");
      return checkout.url as string;
    },
    onSuccess: (url) => {
      window.location.assign(url);
    },
    onError: (error: any) => {
      toast({ title: "Prépaiement impossible", description: error.message, variant: "destructive" });
    },
  });

  const updateQty = (id: string, delta: number) => setQuantities((previous) => {
    const next = Math.max(0, (previous[id] || 0) + delta);
    if (next === 0) {
      const { [id]: _removed, ...rest } = previous;
      return rest;
    }
    return { ...previous, [id]: next };
  });

  const openGroup = (group: MatchGroup) => {
    if (!user) return navigate("/auth");
    const restaurant = group.restaurant || group.restaurants || restaurants.find((row: any) => row.id === group.restaurant_id);
    if (!restaurant) return toast({ title: "Restaurant indisponible", variant: "destructive" });
    if (group.member_count >= group.max_members) {
      return toast({ title: "Groupe complet", description: "Ce groupe accepté au maximum 10 clients.", variant: "destructive" });
    }

    setActiveGroup(group);
    setSelectedRestaurant(restaurant);
    setQuantities({});
    setStep("menu");
  };

  const resumeOrder = (order: GroupMemberOrder) => {
    if (!user) return navigate("/auth");
    const group = groupFromOrder(order, restaurants);
    const restaurant = group.restaurant || group.restaurants || restaurants.find((row: any) => row.id === group.restaurant_id);
    setActiveGroup(group);
    setSelectedRestaurant(restaurant);
    setAddress(String(order.metadata?.delivery_address || group.area || address));
    setQuantities(Object.fromEntries((order.items || []).map((item) => [item.menu_item_id, Number(item.quantity || 0)])));
    setCreateMode(false);
    setStep(isPrepaid(order) || isLocked(group, order, nowMs) ? "status" : "menu");
  };

  return (
    <main className="min-h-screen bg-background">
      <div className="container py-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-violet-500/10 flex items-center justify-center">
            <Users className="h-6 w-6 text-violet-500" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold">Match de groupes</h1>
            <p className="text-muted-foreground text-xs">
              30 minutes pour se regrouper : chaque client prépayé ajoute 5% de réduction, jusqu'à 50%.
            </p>
          </div>
        </div>

        {confirmReturn.isPending ? (
          <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
            Vérification du prépaiement...
          </div>
        ) : null}

        {step === "browse" && (
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-xl bg-violet-500/5 border border-violet-500/10 p-4 text-center">
                <TrendingDown className="h-5 w-5 text-violet-500 mx-auto mb-1" />
                <p className="text-xl font-bold">-50%</p>
                <p className="text-xs text-muted-foreground">maximum</p>
              </div>
              <div className="rounded-xl bg-violet-500/5 border border-violet-500/10 p-4 text-center">
                <CreditCard className="h-5 w-5 text-violet-500 mx-auto mb-1" />
                <p className="text-xl font-bold">+5%</p>
                <p className="text-xs text-muted-foreground">par prépaiement</p>
              </div>
              <div className="rounded-xl bg-violet-500/5 border border-violet-500/10 p-4 text-center">
                <Users className="h-5 w-5 text-violet-500 mx-auto mb-1" />
                <p className="text-xl font-bold">10</p>
                <p className="text-xs text-muted-foreground">clients max</p>
              </div>
            </div>

            <div className="rounded-xl border bg-card p-4">
              <AddressAutocomplete
                value={address}
                onValueChange={setAddress}
                onAddressSelect={setAddress}
                placeholder="Votre adresse pour trouver ou créer un groupe proche..."
                inputClassName="border-0 shadow-none focus-visible:ring-0"
              />
            </div>

            {!createMode ? (
              <>
                {savedOrders.length > 0 ? (
                  <div className="rounded-2xl border bg-card p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h2 className="font-display text-lg font-semibold">Mes commandes Match groupe</h2>
                        <p className="text-xs text-muted-foreground">
                          Les commandes prépayées sont envoyées au restaurateur immédiatement. Le montant final sera capturé à la fin du compte à rebours.
                        </p>
                      </div>
                      <Badge variant="secondary">{savedOrders.length}</Badge>
                    </div>

                    <div className="space-y-2">
                      {savedOrders.map((order) => {
                        const group = groupFromOrder(order, restaurants);
                        const restaurant = group.restaurant || group.restaurants;
                        const itemCount = (order.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
                        return (
                          <button
                            key={order.id}
                            type="button"
                            onClick={() => resumeOrder(order)}
                            className="w-full rounded-xl border p-3 text-left transition hover:border-violet-500/40 hover:bg-violet-500/5"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-semibold truncate">{restaurant?.name || "Restaurant"}</p>
                                <p className="text-xs text-muted-foreground">
                                  {itemCount} article{itemCount > 1 ? "s" : ""} · {Number(order.subtotal || 0).toFixed(2)} CHF préautorisé
                                </p>
                              </div>
                              <Badge variant={isPrepaid(order) ? "default" : "outline"}>{paymentLabel(order)}</Badge>
                            </div>
                            <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                              <span>Fin dans {formatCountdown(group.lock_at || group.expires_at, nowMs)}</span>
                              <span className="font-semibold text-violet-600">{isPrepaid(order) ? "Suivi" : "Prépayer"}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                <div className="flex items-center justify-between">
                  <h2 className="font-display text-xl font-semibold">Groupes à proximité</h2>
                  <Badge variant="outline" className="gap-1"><Sparkles className="h-3 w-3" />En direct</Badge>
                </div>

                {loadingGroups ? (
                  <div className="text-center py-10 text-muted-foreground animate-pulse">Chargement des groupes...</div>
                ) : (
                  <div className="space-y-3">
                    {groups.map((group) => {
                      const restaurant = group.restaurant || group.restaurants;
                      return (
                        <div key={group.id} className="rounded-xl border-2 overflow-hidden border-border hover:border-violet-500/30 transition-all">
                          <div className="flex gap-4 p-4">
                            <img
                              src={restaurant?.image_url || "/images/kebab-box-spread.jpeg"}
                              alt={restaurant?.name}
                              className="w-20 h-20 rounded-lg object-cover shrink-0"
                            />
                            <div className="flex-1 min-w-0 space-y-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <h3 className="font-bold truncate">{restaurant?.name}</h3>
                                <Badge className="bg-violet-500 text-white text-xs">-{group.discount_percentage}% maintenant</Badge>
                              </div>
                              <p className="text-xs text-muted-foreground">{restaurant?.cuisine_type}</p>
                              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{group.area}</span>
                                <span className="flex items-center gap-1"><Clock className="h-3 w-3" />30 min automatiques</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                                  <div
                                    className="h-full bg-violet-500 rounded-full"
                                    style={{ width: `${Math.min(100, (group.member_count / group.max_members) * 100)}%` }}
                                  />
                                </div>
                                <span className="text-xs font-medium">{group.member_count}/{group.max_members}</span>
                              </div>
                              <p className="text-xs font-semibold text-violet-600">
                                Fin dans {formatCountdown(group.lock_at || group.expires_at, nowMs)}
                              </p>
                            </div>
                          </div>
                          <div className="px-4 pb-4">
                            <Button
                              onClick={() => openGroup(group)}
                              variant="outline"
                              className="w-full border-violet-500 text-violet-600 hover:bg-violet-500/10 gap-2"
                              size="sm"
                            >
                              <Truck className="h-4 w-4" />
                              Rejoindre et prépayer ma commande
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                    {groups.length === 0 && (
                      <div className="text-center py-6 text-muted-foreground border-2 border-dashed rounded-xl">
                        Aucun groupe actif pour le moment.
                      </div>
                    )}
                  </div>
                )}

                <div className="rounded-2xl bg-violet-500/5 border border-violet-500/10 p-6 text-center space-y-3">
                  <Users className="h-8 w-8 text-violet-500 mx-auto" />
                  <h3 className="font-semibold text-lg">Aucun groupe ne vous convient ?</h3>
                  <p className="text-sm text-muted-foreground">
                    Créez un groupe : le compte à rebours de 30 minutes démarre automatiquement.
                  </p>
                  <Button onClick={() => setCreateMode(true)} className="bg-violet-500 hover:bg-violet-600 gap-2">
                    Créer un groupe <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </>
            ) : (
              <div className="space-y-4">
                <Button variant="ghost" size="sm" onClick={() => setCreateMode(false)} className="gap-1">
                  <ChevronLeft className="h-4 w-4" /> Retour
                </Button>

                <div className="rounded-xl border bg-card p-4 space-y-2">
                  <h2 className="font-display text-xl font-semibold">Créer un groupe</h2>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl bg-secondary/50 p-3">
                      <p className="text-sm font-bold">30 minutes</p>
                      <p className="text-xs text-muted-foreground">Automatique</p>
                    </div>
                    <div className="rounded-xl bg-secondary/50 p-3">
                      <p className="text-sm font-bold">0% → 50%</p>
                      <p className="text-xs text-muted-foreground">+5% par prépaiement</p>
                    </div>
                    <div className="rounded-xl bg-secondary/50 p-3">
                      <p className="text-sm font-bold">10 clients</p>
                      <p className="text-xs text-muted-foreground">maximum</p>
                    </div>
                  </div>
                </div>

                <h2 className="font-display text-xl font-semibold">Choisir un restaurant</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {restaurants.map((restaurant: any) => (
                    <button
                      key={restaurant.id}
                      onClick={() => createGroup.mutate(restaurant)}
                      className="text-left rounded-xl border-2 overflow-hidden hover:border-violet-500/30 border-border transition-all disabled:opacity-50"
                      disabled={createGroup.isPending}
                    >
                      <img
                        src={restaurant.image_url || "/images/kebab-box-spread.jpeg"}
                        alt={restaurant.name}
                        className="w-full h-32 object-cover"
                      />
                      <div className="p-3">
                        <p className="font-bold text-sm">{restaurant.name}</p>
                        <p className="text-xs text-muted-foreground">{restaurant.cuisine_type} · {restaurant.city}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {step === "menu" && displayedGroup && (
          <div className="space-y-4">
            <Button variant="ghost" size="sm" onClick={() => setStep("browse")} className="gap-1">
              <ChevronLeft className="h-4 w-4" /> Retour
            </Button>

            <div className="rounded-lg bg-violet-500/5 p-3 text-sm space-y-2">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-violet-500" />
                <span>{selectedRestaurant?.name} · <strong className="text-violet-600">-{savingsPercent}% si le groupe fermait maintenant</strong></span>
              </div>
              <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                <span>{memberCount}/{displayedGroup.max_members} clients prépayés</span>
                <span>Fin dans {formatCountdown(lockAt, nowMs)}</span>
                <span>{prepaid ? "Commande envoyée au restaurateur" : "Prépaiement requis"}</span>
              </div>
            </div>

            {categories.map((category) => (
              <div key={category} className="space-y-2">
                <h3 className="font-semibold text-xs text-muted-foreground uppercase tracking-wide">{category}</h3>
                {menuItems
                  .filter((item: any) => (item.category || "Autres") === category)
                  .map((item: any) => {
                    const quantity = quantities[item.id] || 0;
                    const original = Number(item.price);
                    return (
                      <div key={item.id} className="flex items-center gap-3 p-3 border rounded-xl bg-card">
                        {item.image_url && <img src={item.image_url} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm">{item.name}</p>
                          {item.description && <p className="text-xs text-muted-foreground line-clamp-1">{item.description}</p>}
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-violet-600">{original.toFixed(2)} CHF</span>
                            <span className="text-[11px] text-muted-foreground">préautorisé, réduction capturée à la fin</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {quantity > 0 && (
                            <>
                              <Button
                                size="icon"
                                variant="outline"
                                className="h-7 w-7"
                                onClick={() => updateQty(item.id, -1)}
                                disabled={locked || prepaid}
                              >
                                <Minus className="h-3 w-3" />
                              </Button>
                              <span className="w-5 text-center text-sm font-semibold">{quantity}</span>
                            </>
                          )}
                          <Button
                            size="icon"
                            variant={quantity > 0 ? "outline" : "default"}
                            className="h-7 w-7"
                            onClick={() => updateQty(item.id, 1)}
                            disabled={locked || prepaid}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            ))}

            {count > 0 && (
              <div className="sticky bottom-4 rounded-xl border bg-card p-4 shadow-lg space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{count} article{count > 1 ? "s" : ""}</span>
                  <span className="font-bold">{subtotal.toFixed(2)} CHF</span>
                </div>
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Montant préautorisé maintenant</span>
                  <span>{subtotal.toFixed(2)} CHF</span>
                </div>
                <div className="flex justify-between text-sm text-violet-600 font-medium">
                  <span>Réduction actuelle estimée -{savingsPercent}%</span>
                  <span>-{estimatedDiscount.toFixed(2)} CHF</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span>Montant capturé si fermeture maintenant</span>
                  <span>{estimatedCapture.toFixed(2)} CHF</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Si d'autres clients prépayent avant la fin des 30 minutes, votre montant capturé baisse automatiquement.
                </p>
                <Button
                  onClick={() => prepay.mutate()}
                  disabled={prepay.isPending || locked || prepaid}
                  className="w-full bg-violet-500 hover:bg-violet-600 gap-2"
                >
                  {prepay.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                  {prepaid ? "Commande déjà prépayée" : "Prépayer ma commande"}
                </Button>
              </div>
            )}
          </div>
        )}

        {step === "status" && displayedGroup && (
          <div className="space-y-6">
            <div className="rounded-2xl bg-violet-500/5 border border-violet-500/20 p-6 text-center space-y-3">
              <Users className="h-12 w-12 text-violet-500 mx-auto" />
              <h2 className="font-display text-xl font-bold">{prepaid ? "Commande prépayée" : "Prépaiement requis"}</h2>
              <p className="text-sm text-muted-foreground">
                {prepaid
                  ? "Votre commande est envoyée au restaurateur. Le montant final sera capturé automatiquement à la fin du compte à rebours."
                  : "Vous devez prépayer votre commande pour rejoindre le groupe."}
              </p>
              <div className="text-3xl font-black text-violet-600">
                {locked ? `-${myOrder?.final_discount_percentage || displayedGroup.final_discount_percentage || savingsPercent}% final` : formatCountdown(lockAt, nowMs)}
              </div>
            </div>

            <div className="rounded-xl bg-secondary/50 p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Restaurant</span>
                <span className="font-medium">{selectedRestaurant?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Clients prépayés</span>
                <span className="font-medium">{memberCount}/{displayedGroup.max_members}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Statut</span>
                <span className="font-medium text-violet-600">{paymentLabel(myOrder)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Réduction actuelle</span>
                <span className="font-medium text-violet-600">-{savingsPercent}%</span>
              </div>
              {myOrder && (
                <>
                  <div className="flex justify-between border-t pt-2">
                    <span className="text-muted-foreground">Montant préautorisé</span>
                    <span>{Number(myOrder.subtotal).toFixed(2)} CHF</span>
                  </div>
                  <div className="flex justify-between text-violet-600">
                    <span>Réduction estimée</span>
                    <span>-{Number(myOrder.final_discount_amount || myOrder.subtotal * (savingsPercent / 100)).toFixed(2)} CHF</span>
                  </div>
                  <div className="flex justify-between font-bold">
                    <span>Montant capturé estimé</span>
                    <span>{Number(myOrder.final_total || myOrder.subtotal - (myOrder.subtotal * (savingsPercent / 100))).toFixed(2)} CHF</span>
                  </div>
                </>
              )}
            </div>

            <Button onClick={() => setStep("browse")} className="w-full bg-violet-500 hover:bg-violet-600 gap-2" size="lg">
              Retour aux groupes <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
