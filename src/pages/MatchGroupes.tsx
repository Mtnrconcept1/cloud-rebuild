import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Leaf,
  Lock,
  MapPin,
  Minus,
  Plus,
  ShoppingCart,
  Sparkles,
  TrendingDown,
  Truck,
  Users,
} from "lucide-react";

import AddressAutocomplete from "@/components/AddressAutocomplete";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { getSupabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";

const supabase = getSupabase();

type Step = "browse" | "menu" | "confirm";

type MatchGroupStatus = "open" | "locked" | "payment_pending" | "processing" | "completed" | "closed" | "cancelled";
type GroupMemberOrderStatus = "draft" | "joined" | "locked" | "payment_pending" | "paid" | "cancelled" | "expired";

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
  creator_id?: string;
  area: string;
  time_slot: string;
  max_members: number;
  discount_percentage: number;
  final_discount_percentage?: number | null;
  status: MatchGroupStatus;
  is_active: boolean;
  expires_at: string;
  scheduled_at?: string | null;
  lock_at?: string | null;
  member_count: number;
  restaurant?: RestaurantSummary;
  restaurants?: RestaurantSummary;
};

type GroupMemberOrderItem = {
  menu_item_id: string;
  name: string;
  quantity: number;
  original_price: number;
  restaurant_id: string;
  restaurant_name: string;
};

type GroupMemberOrder = {
  id: string;
  group_id: string;
  user_id: string;
  restaurant_id: string;
  items: GroupMemberOrderItem[];
  subtotal: number;
  final_discount_percentage: number;
  final_discount_amount: number;
  final_total: number;
  status: GroupMemberOrderStatus;
  payment_status: string;
  payment_due_at?: string | null;
  updated_at?: string | null;
  metadata?: Record<string, any> | null;
  order_groups?: (Partial<MatchGroup> & {
    restaurants?: RestaurantSummary;
  }) | null;
};

function isMissingRpcError(error: unknown) {
  const message = String((error as { message?: unknown })?.message || "").toLowerCase();
  const code = String((error as { code?: unknown })?.code || "");
  return code === "404" || code === "42883" || message.includes("not found") || message.includes("could not find the function");
}

function getDefaultScheduleValue() {
  const date = new Date(Date.now() + 30 * 60 * 1000);
  date.setSeconds(0, 0);
  return date.toISOString().slice(0, 16);
}

function formatTimeSlot(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString("fr-CH", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCountdown(target: string | null | undefined, nowMs: number) {
  if (!target) return "--:--";
  const diff = Math.max(0, new Date(target).getTime() - nowMs);
  const totalSeconds = Math.floor(diff / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function calculatePreviewDiscount(memberCount: number) {
  return Math.min(30, Math.max(5, 5 + (Math.max(memberCount, 1) - 1) * 5));
}

function getSavedOrderItemCount(order: GroupMemberOrder) {
  return (order.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
}

function normalizeGroup(row: any): MatchGroup {
  const restaurant = row.restaurant || row.restaurants || null;
  const memberCount = Number(row.member_count ?? row.group_members?.length ?? 0);
  const lockAt = row.lock_at || row.expires_at;

  return {
    id: String(row.id),
    restaurant_id: String(row.restaurant_id),
    creator_id: row.creator_id,
    area: String(row.area || "Ma position"),
    time_slot: String(row.time_slot || formatTimeSlot(lockAt)),
    max_members: Number(row.max_members || 6),
    discount_percentage: Number(row.discount_percentage || calculatePreviewDiscount(Math.max(1, memberCount))),
    final_discount_percentage: row.final_discount_percentage ?? null,
    status: (row.status as MatchGroupStatus) || "open",
    is_active: row.is_active !== false,
    expires_at: String(row.expires_at || lockAt),
    scheduled_at: row.scheduled_at || lockAt,
    lock_at: lockAt,
    member_count: memberCount,
    restaurant: restaurant ? {
      id: restaurant.id,
      name: restaurant.name,
      cuisine_type: restaurant.cuisine_type,
      image_url: restaurant.image_url,
      city: restaurant.city,
    } : undefined,
    restaurants: row.restaurants,
  };
}

function buildGroupFromSavedOrder(order: GroupMemberOrder, fallbackRestaurants: any[]): MatchGroup | null {
  const rawGroup = order.order_groups;
  if (!rawGroup?.id) return null;

  const restaurant = rawGroup.restaurants || fallbackRestaurants.find((row) => row.id === rawGroup.restaurant_id);
  const lockAt = rawGroup.lock_at || rawGroup.expires_at || order.payment_due_at || new Date().toISOString();

  return {
    id: String(rawGroup.id),
    restaurant_id: String(rawGroup.restaurant_id || order.restaurant_id),
    creator_id: rawGroup.creator_id,
    area: String(rawGroup.area || order.metadata?.delivery_address || "Ma position"),
    time_slot: String(rawGroup.time_slot || formatTimeSlot(lockAt)),
    max_members: Number(rawGroup.max_members || 6),
    discount_percentage: Number(rawGroup.discount_percentage || order.final_discount_percentage || 5),
    final_discount_percentage: rawGroup.final_discount_percentage ?? order.final_discount_percentage ?? null,
    status: (rawGroup.status as MatchGroupStatus) || (order.status === "payment_pending" ? "payment_pending" : "open"),
    is_active: rawGroup.is_active !== false,
    expires_at: String(rawGroup.expires_at || lockAt),
    scheduled_at: rawGroup.scheduled_at || lockAt,
    lock_at: lockAt,
    member_count: Number(rawGroup.member_count || 1),
    restaurant,
    restaurants: restaurant,
  };
}

function isGroupLocked(group: MatchGroup | null | undefined, order: GroupMemberOrder | null | undefined, nowMs: number) {
  const lockAt = group?.lock_at || group?.expires_at || order?.payment_due_at;
  return Boolean(
    order?.status === "payment_pending"
    || group?.status === "payment_pending"
    || group?.status === "locked"
    || (lockAt && new Date(lockAt).getTime() <= nowMs),
  );
}

async function fetchMatchGroups(): Promise<MatchGroup[]> {
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
  const { replaceCartItems, updateCartMetadata, setOrderMode } = useCart();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>("browse");
  const [address, setAddress] = useState("");
  const [selectedRestaurant, setSelectedRestaurant] = useState<any>(null);
  const [activeGroup, setActiveGroup] = useState<MatchGroup | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [createMode, setCreateMode] = useState(false);
  const [scheduledAt, setScheduledAt] = useState(getDefaultScheduleValue);
  const [nowMs, setNowMs] = useState(Date.now());
  const [closedGroupIds, setClosedGroupIds] = useState<Record<string, boolean>>({});
  const [finalCartSyncedOrderId, setFinalCartSyncedOrderId] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const { data: realGroups = [], isLoading: loadingGroups } = useQuery({
    queryKey: ["match-group-public-feed"],
    queryFn: fetchMatchGroups,
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

  const { data: myGroupOrder } = useQuery({
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

  const { data: savedGroupOrders = [] } = useQuery({
    queryKey: ["my-match-group-orders", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("group_member_orders" as any)
        .select("*, order_groups(*, restaurants(id,name,cuisine_type,image_url,city))")
        .eq("user_id", user!.id)
        .in("status", ["joined", "locked", "payment_pending"])
        .order("updated_at", { ascending: false })
        .limit(10);

      if (error) throw error;
      return (data || []) as GroupMemberOrder[];
    },
    enabled: !!user?.id,
    refetchInterval: 5_000,
  });

  const activeGroupFromFeed = activeGroup ? realGroups.find((group) => group.id === activeGroup.id) : null;
  const displayedGroup = activeGroupFromFeed || activeGroup;
  const memberCount = displayedGroup?.member_count || (myGroupOrder ? 1 : 0);
  const savingsPercent = displayedGroup?.discount_percentage || myGroupOrder?.final_discount_percentage || calculatePreviewDiscount(Math.max(1, memberCount));
  const lockAt = displayedGroup?.lock_at || displayedGroup?.expires_at || null;
  const groupIsLocked = isGroupLocked(displayedGroup, myGroupOrder, nowMs);
  const categories = useMemo(() => [...new Set(menuItems.map((item: any) => item.category || "Autres"))] as string[], [menuItems]);

  const count = Object.values(quantities).reduce((sum, qty) => sum + qty, 0);
  const subtotal = Object.entries(quantities).reduce((sum, [id, quantity]) => {
    const item = menuItems.find((menuItem: any) => menuItem.id === id);
    return sum + (item ? Number(item.price) * quantity : 0);
  }, 0);
  const discount = subtotal * (savingsPercent / 100);
  const finalTotal = subtotal - discount;

  const addFinalOrderToCart = useCallback(async (
    order: GroupMemberOrder,
    group: MatchGroup,
    options: { showToast?: boolean } = {},
  ) => {
    if (!user?.id) return;

    await (supabase.rpc as any)("close_due_match_groups");

    const { data: refreshedOrder } = await supabase
      .from("group_member_orders" as any)
      .select("*")
      .eq("id", order.id)
      .eq("user_id", user.id)
      .maybeSingle();

    const finalOrder = (refreshedOrder || order) as GroupMemberOrder;
    const finalDiscountPercent = Number(
      finalOrder.final_discount_percentage
      || group.final_discount_percentage
      || group.discount_percentage
      || calculatePreviewDiscount(group.member_count || 1),
    );
    const factor = 1 - finalDiscountPercent / 100;
    const cartItems = (finalOrder.items || []).map((item) => ({
      menuItemId: item.menu_item_id,
      name: item.name,
      price: Math.round(Number(item.original_price) * factor * 100) / 100,
      quantity: item.quantity,
      restaurantId: item.restaurant_id,
      restaurantName: item.restaurant_name,
      metadata: {
        feature: "match-groupes",
        groupId: group.id,
        groupMemberOrderId: finalOrder.id,
        groupFinalDiscountPercent: finalDiscountPercent,
        originalPrice: Number(item.original_price),
      },
    }));

    setOrderMode("delivery", { force: true });
    replaceCartItems(cartItems, {
      feature: "match-groupes",
      groupId: group.id,
      groupMemberOrderId: finalOrder.id,
      groupFinalDiscountPercent: finalDiscountPercent,
      scheduled_delivery_label: group.time_slot,
      delivery_address: String(finalOrder.metadata?.delivery_address || address || group.area || ""),
    }, "delivery");
    updateCartMetadata({
      feature: "match-groupes",
      groupId: group.id,
      groupMemberOrderId: finalOrder.id,
      groupFinalDiscountPercent: finalDiscountPercent,
    });

    setFinalCartSyncedOrderId(finalOrder.id);
    setStep("confirm");
    queryClient.invalidateQueries({ queryKey: ["match-group-order", group.id, user.id] });
    queryClient.invalidateQueries({ queryKey: ["my-match-group-orders", user.id] });
    queryClient.invalidateQueries({ queryKey: ["match-group-public-feed"] });

    if (options.showToast !== false) {
      toast({
        title: "Panier final prêt",
        description: `La réduction finale de -${finalDiscountPercent}% a été appliquée. Vous pouvez payer.`,
      });
    }
  }, [address, queryClient, replaceCartItems, setOrderMode, toast, updateCartMetadata, user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    const candidates = [
      ...realGroups,
      ...(activeGroup ? [activeGroup] : []),
    ];
    const dueGroupIds = candidates
      .filter((group) => !closedGroupIds[group.id])
      .filter((group) => new Date(group.lock_at || group.expires_at).getTime() <= nowMs)
      .map((group) => group.id);

    if (dueGroupIds.length === 0) return;

    setClosedGroupIds((previous) => ({
      ...previous,
      ...Object.fromEntries(dueGroupIds.map((id) => [id, true])),
    }));

    void (supabase.rpc as any)("close_due_match_groups").then(() => {
      queryClient.invalidateQueries({ queryKey: ["match-group-public-feed"] });
      queryClient.invalidateQueries({ queryKey: ["match-group-order", activeGroup?.id, user.id] });
      queryClient.invalidateQueries({ queryKey: ["my-match-group-orders", user.id] });
    });
  }, [activeGroup, closedGroupIds, nowMs, queryClient, realGroups, user?.id]);

  useEffect(() => {
    if (!displayedGroup || !myGroupOrder || finalCartSyncedOrderId === myGroupOrder.id) return;
    if (!isGroupLocked(displayedGroup, myGroupOrder, nowMs)) return;

    void addFinalOrderToCart(myGroupOrder, displayedGroup, { showToast: true });
  }, [addFinalOrderToCart, displayedGroup, finalCartSyncedOrderId, myGroupOrder, nowMs]);

  const createGroupMutation = useMutation({
    mutationFn: async (restaurant: any) => {
      if (!user) throw new Error("Connexion requise");
      const scheduledDate = new Date(scheduledAt);
      if (!Number.isFinite(scheduledDate.getTime()) || scheduledDate.getTime() <= Date.now() + 4 * 60 * 1000) {
        throw new Error("Choisissez un horaire au moins 5 minutes dans le futur.");
      }

      const { data: rpcGroupId, error: rpcError } = await (supabase.rpc as any)("create_match_group", {
        p_restaurant_id: restaurant.id,
        p_area: address || "Ma position",
        p_scheduled_at: scheduledDate.toISOString(),
        p_max_members: 6,
      });

      if (!rpcError && rpcGroupId) {
        return {
          group: normalizeGroup({
            id: rpcGroupId,
            restaurant_id: restaurant.id,
            creator_id: user.id,
            area: address || "Ma position",
            time_slot: formatTimeSlot(scheduledDate.toISOString()),
            max_members: 6,
            discount_percentage: 5,
            status: "open",
            is_active: true,
            expires_at: scheduledDate.toISOString(),
            scheduled_at: scheduledDate.toISOString(),
            lock_at: scheduledDate.toISOString(),
            member_count: 0,
            restaurant,
          }),
          restaurant,
        };
      }

      if (!isMissingRpcError(rpcError)) throw rpcError;

      const { data, error } = await supabase
        .from("order_groups" as any)
        .insert({
          restaurant_id: restaurant.id,
          creator_id: user.id,
          area: address || "Ma position",
          time_slot: formatTimeSlot(scheduledDate.toISOString()),
          max_members: 6,
          discount_percentage: 5,
          is_active: true,
          expires_at: scheduledDate.toISOString(),
        })
        .select("*, restaurants(id,name,cuisine_type,image_url,city)")
        .single();

      if (error) throw error;
      return { group: normalizeGroup({ ...data, restaurant }), restaurant };
    },
    onSuccess: ({ group, restaurant }) => {
      setActiveGroup({ ...group, restaurant });
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

  const saveGroupOrderMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Connexion requise");
      if (!activeGroup || !selectedRestaurant) throw new Error("Groupe introuvable");
      if (groupIsLocked) throw new Error("Le compte à rebours est terminé. Le panier est verrouillé.");
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

      const { data, error } = await (supabase.rpc as any)("upsert_match_group_member_order", {
        p_group_id: activeGroup.id,
        p_items: items,
        p_subtotal: subtotal,
        p_metadata: {
          feature: "match-groupes",
          delivery_address: address,
          scheduled_at: activeGroup.scheduled_at || activeGroup.lock_at,
          lock_at: activeGroup.lock_at || activeGroup.expires_at,
        },
      });

      if (!error) return data as string;
      if (!isMissingRpcError(error) && !String(error.message || "").toLowerCase().includes("group_member_orders")) throw error;

      const { error: memberError } = await supabase
        .from("group_members" as any)
        .insert({ group_id: activeGroup.id, user_id: user.id });
      if (memberError && !String(memberError.message || "").toLowerCase().includes("duplicate")) throw memberError;
      return activeGroup.id;
    },
    onSuccess: () => {
      toast({
        title: "Panier Match groupe enregistré",
        description: "Vous pouvez revenir modifier vos articles tant que le compte à rebours n'est pas terminé.",
      });
      setStep("confirm");
      queryClient.invalidateQueries({ queryKey: ["match-group-public-feed"] });
      queryClient.invalidateQueries({ queryKey: ["match-group-order", activeGroup?.id, user?.id] });
      queryClient.invalidateQueries({ queryKey: ["my-match-group-orders", user?.id] });
    },
    onError: (error: any) => {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
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
    if (!restaurant) {
      toast({ title: "Restaurant indisponible", description: "Impossible d'ouvrir ce groupe pour le moment.", variant: "destructive" });
      return;
    }

    if (group.member_count >= group.max_members) {
      toast({ title: "Groupe complet", description: "Ce groupe a atteint sa capacité maximale.", variant: "destructive" });
      return;
    }

    setActiveGroup(group);
    setSelectedRestaurant(restaurant);
    setQuantities({});
    setFinalCartSyncedOrderId(null);
    setStep("menu");
  };

  const resumeSavedGroupOrder = async (order: GroupMemberOrder) => {
    if (!user) return navigate("/auth");
    const group = buildGroupFromSavedOrder(order, restaurants);
    if (!group) {
      toast({ title: "Panier introuvable", description: "Impossible de retrouver le groupe associé.", variant: "destructive" });
      return;
    }

    const restaurant = group.restaurant || group.restaurants || restaurants.find((row: any) => row.id === group.restaurant_id);
    setActiveGroup(group);
    setSelectedRestaurant(restaurant);
    setAddress(String(order.metadata?.delivery_address || group.area || address));
    setQuantities(
      Object.fromEntries(
        (order.items || []).map((item) => [item.menu_item_id, Number(item.quantity || 0)]),
      ),
    );
    setCreateMode(false);
    queryClient.invalidateQueries({ queryKey: ["match-group-order", group.id, user.id] });

    if (isGroupLocked(group, order, nowMs)) {
      await addFinalOrderToCart(order, group, { showToast: true });
      return;
    }

    setStep("menu");
    toast({
      title: "Panier repris",
      description: "Vous pouvez ajouter ou retirer des articles tant que le compte à rebours continue.",
    });
  };

  const handlePayFinal = async () => {
    if (!myGroupOrder || !selectedRestaurant || !activeGroup || !displayedGroup) return;

    if (!groupIsLocked) {
      toast({
        title: "Le groupe est encore ouvert",
        description: "Vous pouvez encore modifier votre panier. Le paiement sera disponible à la fin du compte à rebours.",
      });
      return;
    }

    if (finalCartSyncedOrderId !== myGroupOrder.id) {
      await addFinalOrderToCart(myGroupOrder, displayedGroup, { showToast: true });
    }

    navigate("/panier");
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
            <p className="text-muted-foreground text-xs">Créez un groupe, lancez un compte à rebours et baissez le prix final ensemble.</p>
          </div>
        </div>

        {step === "browse" && (
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-xl bg-violet-500/5 border border-violet-500/10 p-4 text-center">
                <TrendingDown className="h-5 w-5 text-violet-500 mx-auto mb-1" />
                <p className="text-xl font-bold">-30%</p>
                <p className="text-xs text-muted-foreground">Max groupe</p>
              </div>
              <div className="rounded-xl bg-green-500/5 border border-green-500/10 p-4 text-center">
                <Leaf className="h-5 w-5 text-green-500 mx-auto mb-1" />
                <p className="text-xl font-bold">-45%</p>
                <p className="text-xs text-muted-foreground">CO₂ réduit</p>
              </div>
              <div className="rounded-xl bg-blue-500/5 border border-blue-500/10 p-4 text-center">
                <Users className="h-5 w-5 text-blue-500 mx-auto mb-1" />
                <p className="text-xl font-bold">{realGroups.length}</p>
                <p className="text-xs text-muted-foreground">Groupes actifs</p>
              </div>
            </div>

            <div className="rounded-xl border bg-card p-4 space-y-3">
              <AddressAutocomplete
                value={address}
                onValueChange={setAddress}
                onAddressSelect={(selectedAddress) => setAddress(selectedAddress)}
                placeholder="Votre adresse pour trouver ou créer un groupe proche..."
                inputClassName="border-0 shadow-none focus-visible:ring-0"
              />
            </div>

            {!createMode ? (
              <>
                {savedGroupOrders.length > 0 ? (
                  <div className="rounded-2xl border bg-card p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h2 className="font-display text-lg font-semibold">Mes paniers Match groupe</h2>
                        <p className="text-xs text-muted-foreground">Cliquez sur un panier pour le modifier avant la fin du compte à rebours, ou le payer après fermeture.</p>
                      </div>
                      <Badge variant="secondary">{savedGroupOrders.length}</Badge>
                    </div>
                    <div className="space-y-2">
                      {savedGroupOrders.map((order) => {
                        const group = buildGroupFromSavedOrder(order, restaurants);
                        const restaurant = group?.restaurant || group?.restaurants;
                        const groupLockAt = group?.lock_at || group?.expires_at;
                        const locked = isGroupLocked(group, order, nowMs);
                        return (
                          <button
                            key={order.id}
                            type="button"
                            onClick={() => void resumeSavedGroupOrder(order)}
                            className="w-full rounded-xl border p-3 text-left transition hover:border-violet-500/40 hover:bg-violet-500/5"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-semibold truncate">{restaurant?.name || "Restaurant"}</p>
                                <p className="text-xs text-muted-foreground">
                                  {getSavedOrderItemCount(order)} article{getSavedOrderItemCount(order) > 1 ? "s" : ""} · {Number(order.subtotal || 0).toFixed(2)} CHF
                                </p>
                              </div>
                              <Badge variant={locked ? "default" : "outline"}>{locked ? "Prêt à payer" : `-${group?.discount_percentage || order.final_discount_percentage || 5}%`}</Badge>
                            </div>
                            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                              <span>{locked ? "Réduction finale appliquée au panier" : `Modifiable · fin dans ${formatCountdown(groupLockAt, nowMs)}`}</span>
                              <span className="font-semibold text-violet-600">{locked ? "Ouvrir le paiement" : "Modifier le panier"}</span>
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
                    {realGroups.map((group) => {
                      const restaurant = group.restaurant || group.restaurants;
                      const groupLockAt = group.lock_at || group.expires_at;
                      return (
                        <div key={group.id} className="rounded-xl border-2 overflow-hidden border-border hover:border-violet-500/30 transition-all">
                          <div className="flex gap-4 p-4">
                            <img src={restaurant?.image_url || "/images/kebab-box-spread.jpeg"} alt={restaurant?.name} className="w-20 h-20 rounded-lg object-cover shrink-0" />
                            <div className="flex-1 min-w-0 space-y-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <h3 className="font-bold truncate">{restaurant?.name}</h3>
                                <Badge className="bg-violet-500 text-white text-xs">-{group.discount_percentage}%</Badge>
                              </div>
                              <p className="text-xs text-muted-foreground">{restaurant?.cuisine_type}</p>
                              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{group.area}</span>
                                <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{group.time_slot}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                                  <div className="h-full bg-violet-500 rounded-full" style={{ width: `${Math.min(100, (group.member_count / group.max_members) * 100)}%` }} />
                                </div>
                                <span className="text-xs font-medium">{group.member_count}/{group.max_members}</span>
                              </div>
                              <p className="text-xs font-semibold text-violet-600">Fin dans {formatCountdown(groupLockAt, nowMs)}</p>
                            </div>
                          </div>
                          <div className="px-4 pb-4">
                            <Button onClick={() => openGroup(group)} variant="outline" className="w-full border-violet-500 text-violet-600 hover:bg-violet-500/10 gap-2" size="sm">
                              <Truck className="h-4 w-4" />Rejoindre et préparer ma commande
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                    {realGroups.length === 0 && (
                      <div className="text-center py-6 text-muted-foreground border-2 border-dashed rounded-xl">
                        Aucun groupe actif pour le moment.
                      </div>
                    )}
                  </div>
                )}
                <div className="rounded-2xl bg-violet-500/5 border border-violet-500/10 p-6 text-center space-y-3">
                  <Users className="h-8 w-8 text-violet-500 mx-auto" />
                  <h3 className="font-semibold text-lg">Aucun groupe ne vous convient ?</h3>
                  <p className="text-sm text-muted-foreground">Créez votre groupe, choisissez l'heure limite et laissez les autres faire baisser le prix.</p>
                  <Button onClick={() => setCreateMode(true)} className="bg-violet-500 hover:bg-violet-600 gap-2">Créer un groupe <ChevronRight className="h-4 w-4" /></Button>
                </div>
              </>
            ) : (
              <div className="space-y-4">
                <Button variant="ghost" size="sm" onClick={() => setCreateMode(false)} className="gap-1">
                  <ChevronLeft className="h-4 w-4" /> Retour
                </Button>
                <div className="rounded-xl border bg-card p-4 space-y-3">
                  <h2 className="font-display text-xl font-semibold">Créer un groupe</h2>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Heure de fermeture du groupe</label>
                    <Input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} />
                    <p className="text-xs text-muted-foreground">Le paiement final sera disponible quand ce compte à rebours sera terminé.</p>
                  </div>
                </div>
                <h2 className="font-display text-xl font-semibold">Choisir un restaurant</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {restaurants.map((restaurant: any) => (
                    <button key={restaurant.id} onClick={() => createGroupMutation.mutate(restaurant)} className="text-left rounded-xl border-2 overflow-hidden hover:border-violet-500/30 border-border transition-all disabled:opacity-50" disabled={createGroupMutation.isPending}>
                      <img src={restaurant.image_url || "/images/kebab-box-spread.jpeg"} alt={restaurant.name} className="w-full h-32 object-cover" />
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
            <Button variant="ghost" size="sm" onClick={() => { setStep("browse"); setCreateMode(false); }} className="gap-1">
              <ChevronLeft className="h-4 w-4" /> Retour
            </Button>
            <div className="rounded-lg bg-violet-500/5 p-3 text-sm space-y-2">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-violet-500" />
                <span>{selectedRestaurant?.name} · <strong className="text-violet-600">-{savingsPercent}% maintenant</strong></span>
              </div>
              <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                <span>{memberCount}/{displayedGroup.max_members} participants</span>
                <span>Fin dans {formatCountdown(lockAt, nowMs)}</span>
                <span>{groupIsLocked ? "Panier verrouillé" : "Vous pouvez encore modifier vos articles"}</span>
              </div>
            </div>

            {categories.map((category) => (
              <div key={category} className="space-y-2">
                <h3 className="font-semibold text-xs text-muted-foreground uppercase tracking-wide">{category}</h3>
                {menuItems.filter((item: any) => (item.category || "Autres") === category).map((item: any) => {
                  const quantity = quantities[item.id] || 0;
                  const original = Number(item.price);
                  const discounted = Math.round(original * (1 - savingsPercent / 100) * 100) / 100;
                  return (
                    <div key={item.id} className="flex items-center gap-3 p-3 border rounded-xl bg-card">
                      {item.image_url && <img src={item.image_url} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">{item.name}</p>
                        {item.description && <p className="text-xs text-muted-foreground line-clamp-1">{item.description}</p>}
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-violet-600">{discounted.toFixed(2)} CHF</span>
                          <span className="text-xs text-muted-foreground line-through">{original.toFixed(2)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {quantity > 0 && (
                          <>
                            <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQty(item.id, -1)} disabled={groupIsLocked}><Minus className="h-3 w-3" /></Button>
                            <span className="w-5 text-center text-sm font-semibold">{quantity}</span>
                          </>
                        )}
                        <Button size="icon" variant={quantity > 0 ? "outline" : "default"} className="h-7 w-7" onClick={() => updateQty(item.id, 1)} disabled={groupIsLocked}><Plus className="h-3 w-3" /></Button>
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
                  <span className="text-muted-foreground line-through">{subtotal.toFixed(2)} CHF</span>
                </div>
                <div className="flex justify-between text-sm text-violet-600 font-medium">
                  <span>Réduction actuelle -{savingsPercent}%</span>
                  <span>-{discount.toFixed(2)} CHF</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span>Total estimé</span>
                  <span>{finalTotal.toFixed(2)} CHF</span>
                </div>
                <Button onClick={() => saveGroupOrderMutation.mutate()} disabled={saveGroupOrderMutation.isPending || groupIsLocked} className="w-full bg-violet-500 hover:bg-violet-600 gap-2">
                  <ShoppingCart className="h-4 w-4" /> {groupIsLocked ? "Panier verrouillé" : "Enregistrer mes modifications"}
                </Button>
              </div>
            )}
          </div>
        )}

        {step === "confirm" && displayedGroup && (
          <div className="space-y-6">
            <div className="rounded-2xl bg-violet-500/5 border border-violet-500/20 p-6 text-center space-y-3">
              {groupIsLocked ? <Lock className="h-12 w-12 text-violet-500 mx-auto" /> : <CheckCircle2 className="h-12 w-12 text-violet-500 mx-auto" />}
              <h2 className="font-display text-xl font-bold">{groupIsLocked ? "Panier final prêt" : "Panier enregistré"}</h2>
              <p className="text-sm text-muted-foreground">
                {groupIsLocked
                  ? "Les articles ont été ajoutés au panier avec la réduction finale. Vous n'avez plus qu'à payer."
                  : "Vous pouvez encore revenir modifier vos articles jusqu'à la fin du compte à rebours."}
              </p>
              <div className="text-3xl font-black text-violet-600">{groupIsLocked ? `-${myGroupOrder?.final_discount_percentage || displayedGroup.final_discount_percentage || savingsPercent}%` : formatCountdown(lockAt, nowMs)}</div>
            </div>

            <div className="rounded-xl bg-secondary/50 p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Restaurant</span><span className="font-medium">{selectedRestaurant?.name}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Participants</span><span className="font-medium">{memberCount}/{displayedGroup.max_members}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Réduction actuelle</span><span className="font-medium text-violet-600">-{savingsPercent}%</span></div>
              {myGroupOrder ? (
                <>
                  <div className="flex justify-between border-t pt-2"><span className="text-muted-foreground">Sous-total</span><span>{Number(myGroupOrder.subtotal).toFixed(2)} CHF</span></div>
                  <div className="flex justify-between text-violet-600"><span>Réduction finale</span><span>-{Number(myGroupOrder.final_discount_amount || myGroupOrder.subtotal * (savingsPercent / 100)).toFixed(2)} CHF</span></div>
                  <div className="flex justify-between font-bold"><span>Total final</span><span>{Number(myGroupOrder.final_total || myGroupOrder.subtotal - (myGroupOrder.subtotal * (savingsPercent / 100))).toFixed(2)} CHF</span></div>
                </>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {!groupIsLocked ? (
                <Button onClick={() => setStep("menu")} variant="outline" size="lg">
                  Modifier mon panier
                </Button>
              ) : null}
              <Button onClick={handlePayFinal} className="w-full bg-violet-500 hover:bg-violet-600 gap-2 sm:col-span-1" size="lg" disabled={!groupIsLocked || !myGroupOrder}>
                {groupIsLocked ? "Procéder au paiement" : "Paiement disponible à la fin"}
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
