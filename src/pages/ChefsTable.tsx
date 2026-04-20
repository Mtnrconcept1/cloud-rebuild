import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Bell,
  CheckCircle2,
  ChefHat,
  Clock3,
  MapPin,
  ShoppingCart,
  Sparkles,
  Star,
  Users,
  Zap,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { FeatureWizard, WizardNextButton } from "@/components/FeatureWizard";
import ReservationDetailModal from "@/components/ReservationDetailModal";
import { cn } from "@/lib/utils";

const supabase = getSupabase();

interface FlashDrop {
  id: string;
  chef: string;
  restaurant: string;
  restaurantAddress: string;
  restaurantId: string;
  dish: string;
  description: string;
  price: number;
  originalPrice: number;
  savingsAmount: number;
  discountPercent: number;
  totalPortions: number;
  remaining: number;
  image: string;
  rating: number;
  cuisine: string;
  dropTime: string;
  serviceTimeLabel: string;
  dropMomentLabel: string;
  hasDiscount: boolean;
}

interface ChefTableDropCardProps {
  drop: FlashDrop;
  index: number;
  isReserved: boolean;
  onToggleReserve: (drop: FlashDrop) => void;
}

interface ConfirmedChefReservation {
  id: string;
  restaurant_id: string;
  restaurant_name: string;
  date: string;
  time: string;
  party_size: number;
  status: string;
  total_amount: number;
  created_at: string;
  notes: string | null;
  metadata: Record<string, unknown>;
  preorder_items: Array<Record<string, unknown>>;
}

const currencyFormatter = new Intl.NumberFormat("fr-CH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const serviceTimeFormatter = new Intl.DateTimeFormat("fr-CH", {
  hour: "2-digit",
  minute: "2-digit",
});

const dropMomentFormatter = new Intl.DateTimeFormat("fr-CH", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function formatCurrency(value: number) {
  return `${currencyFormatter.format(value)} CHF`;
}

function buildRestaurantAddress(restaurant?: { address?: string | null; city?: string | null }) {
  const parts = [restaurant?.address, restaurant?.city].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "Adresse communiquee apres reservation";
}

function buildChefTableMenuItemId(dropId: string) {
  return `chef-table-${dropId}`;
}

function ChefTableDropCard({
  drop,
  index,
  isReserved,
  onToggleReserve,
}: ChefTableDropCardProps) {
  const isAlmostSoldOut = drop.remaining <= Math.max(2, Math.ceil(drop.totalPortions * 0.25));

  return (
    <motion.article
      initial={{ opacity: 0, y: 22 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -6 }}
      transition={{ duration: 0.32, delay: index * 0.04 }}
      className={cn(
        "group overflow-hidden rounded-[28px] border border-amber-200/70 bg-card shadow-[0_22px_70px_-34px_rgba(15,23,42,0.45)]",
        isReserved && "ring-2 ring-amber-500 ring-offset-2 ring-offset-background",
      )}
    >
      <div className="relative">
        <img
          src={drop.image}
          alt={`${drop.dish} - ${drop.restaurant}`}
          className="h-64 w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/10" />

        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4">
          <div className="flex flex-wrap gap-2">
            <Badge className="border-none bg-black/55 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-white backdrop-blur-md">
              Chef&apos;s Table
            </Badge>
            <Badge className="border-none bg-white/14 px-3 py-1 text-[11px] font-medium text-white backdrop-blur-md">
              {drop.cuisine}
            </Badge>
          </div>

          {drop.hasDiscount ? (
            <Badge className="border-none bg-emerald-500 px-3 py-1 text-[11px] font-bold text-white shadow-lg">
              -{drop.discountPercent}%
            </Badge>
          ) : null}
        </div>

        <div className="absolute inset-x-0 bottom-0 p-5 text-white">
          <div className="max-w-2xl space-y-3">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-white/70">
                Creation hors carte
              </p>
              <h3 className="font-display text-2xl font-bold leading-tight drop-shadow-sm">
                {drop.dish}
              </h3>
            </div>

            <div className="flex flex-wrap gap-2 text-xs sm:text-sm">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-white/14 px-3 py-1.5 backdrop-blur-md">
                <ChefHat className="h-3.5 w-3.5" />
                <span>{drop.chef}</span>
              </div>

              <div className="inline-flex items-center gap-1.5 rounded-full bg-white/14 px-3 py-1.5 backdrop-blur-md">
                <Clock3 className="h-3.5 w-3.5" />
                <span>Service {drop.serviceTimeLabel}</span>
              </div>

              {drop.rating > 0 ? (
                <div className="inline-flex items-center gap-1.5 rounded-full bg-white/14 px-3 py-1.5 backdrop-blur-md">
                  <Star className="h-3.5 w-3.5 fill-current" />
                  <span>{drop.rating.toFixed(1)}</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1.3fr)_240px] lg:items-end">
        <div className="space-y-4">
          <div className="rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50 via-white to-orange-50/60 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                  Restaurant
                </p>
                <p className="text-lg font-semibold text-foreground">{drop.restaurant}</p>
              </div>

              <Badge
                variant="outline"
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-semibold",
                  isAlmostSoldOut
                    ? "border-rose-200 bg-rose-50 text-rose-700"
                    : "border-amber-200 bg-white/80 text-amber-700",
                )}
              >
                {isAlmostSoldOut
                  ? `Dernieres ${drop.remaining} portions`
                  : `${drop.remaining}/${drop.totalPortions} portions`}
              </Badge>
            </div>

            <p className="mt-3 flex items-start gap-2 text-sm leading-6 text-muted-foreground">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <span className="line-clamp-2">{drop.restaurantAddress}</span>
            </p>
          </div>

          <p className="text-sm leading-6 text-muted-foreground">{drop.description}</p>

          <div className="flex flex-wrap gap-2">
            <Badge
              variant="outline"
              className="rounded-full border-amber-200 bg-amber-50/80 px-3 py-1 text-xs font-medium text-amber-800"
            >
              {drop.dropMomentLabel}
            </Badge>

            {drop.savingsAmount > 0 ? (
              <Badge className="rounded-full border-none bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-500/10">
                Vous economisez {formatCurrency(drop.savingsAmount)}
              </Badge>
            ) : null}
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border border-border/60 bg-muted/25 p-4">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              Prix exclusif
            </p>
            <div className="flex items-end gap-2">
              <span className="font-display text-3xl font-bold tracking-tight text-foreground">
                {formatCurrency(drop.price)}
              </span>
            </div>
            {drop.hasDiscount ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="line-through">{formatCurrency(drop.originalPrice)}</span>
                <span className="font-semibold text-emerald-600">-{drop.discountPercent}%</span>
              </div>
            ) : null}
          </div>

          <div className="space-y-2 rounded-xl bg-background/80 p-3 text-xs">
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Chef</span>
              <span className="font-medium text-foreground">{drop.chef}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Disponibilite</span>
              <span className="font-medium text-foreground">
                {drop.remaining}/{drop.totalPortions}
              </span>
            </div>
          </div>

          <Button
            onClick={() => onToggleReserve(drop)}
            variant={isReserved ? "outline" : "default"}
            className={cn(
              "h-11 w-full rounded-xl font-semibold",
              isReserved
                ? "border-amber-400 text-amber-700 hover:bg-amber-50"
                : "bg-amber-500 text-white shadow-[0_18px_40px_-24px_rgba(245,158,11,1)] hover:bg-amber-600",
            )}
          >
            {isReserved ? (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Retirer du panier
              </>
            ) : (
              <>
                <ShoppingCart className="mr-2 h-4 w-4" />
                Ajouter au panier
              </>
            )}
          </Button>
        </div>
      </div>
    </motion.article>
  );
}

export default function ChefsTable() {
  const { user, session, loading: authLoading } = useAuth();
  const { items, addItem, removeItem, clearCart, updateCartMetadata } = useCart();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [isFinalizingCheckout, setIsFinalizingCheckout] = useState(false);
  const [pendingCheckoutSessionId, setPendingCheckoutSessionId] = useState<string | null>(null);
  const [confirmedReservations, setConfirmedReservations] = useState<ConfirmedChefReservation[]>([]);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const { data: drops = [] } = useQuery({
    queryKey: ["chefs-table-drops"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chef_table_drops" as any)
        .select("*, restaurants (name, rating, cuisine_type, image_url, address, city)")
        .eq("is_active", true)
        .order("drop_time", { ascending: true });

      if (error) throw error;

      return (data || []).map((drop: any) => {
        const price = Number(drop.price) || 0;
        const originalPrice = Math.max(Number(drop.original_price) || 0, price);
        const savingsAmount = Math.max(originalPrice - price, 0);
        const discountPercent =
          originalPrice > 0 && savingsAmount > 0
            ? Math.round((savingsAmount / originalPrice) * 100)
            : 0;

        return {
          id: drop.id,
          chef: drop.chef_name || "Chef invite",
          restaurant: drop.restaurants?.name || "Restaurant partenaire",
          restaurantAddress: buildRestaurantAddress(drop.restaurants),
          restaurantId: drop.restaurant_id,
          dish: drop.dish_name,
          description:
            drop.description || "Creation signee servie en quantite tres limitee pour un service unique.",
          price,
          originalPrice,
          savingsAmount,
          discountPercent,
          totalPortions: Number(drop.total_portions) || 0,
          remaining: Number(drop.remaining_portions) || 0,
          image: drop.image_url || drop.restaurants?.image_url || "/images/octopus-fine-dining.jpeg",
          rating: Number(drop.restaurants?.rating) || 0,
          cuisine: drop.restaurants?.cuisine_type || "Edition exclusive",
          dropTime: drop.drop_time,
          serviceTimeLabel: serviceTimeFormatter.format(new Date(drop.drop_time)),
          dropMomentLabel: dropMomentFormatter.format(new Date(drop.drop_time)),
          hasDiscount: savingsAmount > 0,
        } as FlashDrop;
      });
    },
  });

  const { data: chefsSubscription } = useQuery({
    queryKey: ["chefs-table-subscription", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("notification_subscriptions" as any)
        .select("*")
        .eq("user_id", user!.id)
        .eq("topic", "chefs_table")
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const chefsTableCartItems = useMemo(
    () => items.filter((item) => item.metadata?.is_chefs_table),
    [items],
  );

  const hasForeignCartItems = items.length > chefsTableCartItems.length;
  const selectedDropIds = useMemo(
    () =>
      new Set(
        chefsTableCartItems.map((item) =>
          String(item.metadata?.chef_table_drop_id || item.menuItemId.replace("chef-table-", ""))),
      ),
    [chefsTableCartItems],
  );

  const reservedTotal = useMemo(
    () => chefsTableCartItems.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [chefsTableCartItems],
  );

  const reservedOriginalTotal = useMemo(
    () =>
      chefsTableCartItems.reduce(
        (sum, item) =>
          sum + (Number(item.metadata?.original_price || item.price) * item.quantity),
        0,
      ),
    [chefsTableCartItems],
  );

  const reservedSavingsTotal = Math.max(reservedOriginalTotal - reservedTotal, 0);
  const reservedRestaurantCount = useMemo(
    () => new Set(chefsTableCartItems.map((item) => item.restaurantId)).size,
    [chefsTableCartItems],
  );

  const notifyAll = !!chefsSubscription;
  const confirmed = confirmedReservations.length > 0;

  const completePaidReservations = useCallback(async (sessionId: string) => {
    setIsFinalizingCheckout(true);

    try {
      const { data, error } = await supabase.functions.invoke("create-chefs-table-reservation", {
        body: { session_id: sessionId },
      });

      if (error) {
        throw new Error(error.message || "Impossible de finaliser la reservation Chef's Table.");
      }

      const reservations = Array.isArray(data?.reservations)
        ? data.reservations
        : [];

      if (reservations.length === 0) {
        throw new Error("Paiement valide, reservation en cours de finalisation. Rechargez la page dans quelques secondes.");
      }

      clearCart();
      setConfirmedReservations(reservations as ConfirmedChefReservation[]);
      setPendingCheckoutSessionId(null);
      queryClient.invalidateQueries({ queryKey: ["reservations"] });

      toast({
        title: "Paiement confirme",
        description:
          reservations.length > 1
            ? `${reservations.length} reservations Chef's Table ont ete confirmees.`
            : "Votre reservation Chef's Table est confirmee.",
      });
    } catch (error) {
      toast({
        title: "Erreur",
        description:
          error instanceof Error
            ? error.message
            : "Impossible de finaliser la reservation Chef's Table.",
        variant: "destructive",
      });
    } finally {
      setIsFinalizingCheckout(false);
    }
  }, [clearCart, queryClient, toast]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    const sessionId = params.get("session_id");

    if (status === "success" && sessionId) {
      setPendingCheckoutSessionId(sessionId);
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }

    if (status === "cancelled") {
      setPendingCheckoutSessionId(null);
      toast({
        title: "Paiement annule",
        description: "Vos experiences restent dans le panier, vous pouvez reessayer.",
        variant: "destructive",
      });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [toast]);

  useEffect(() => {
    if (!pendingCheckoutSessionId || confirmed || authLoading || isFinalizingCheckout) return;

    if (!user || !session?.access_token) {
      toast({
        title: "Reconnectez-vous",
        description: "Le paiement a ete valide. Reconnectez-vous pour recuperer votre reservation Chef's Table.",
        variant: "destructive",
      });
      return;
    }

    void completePaidReservations(pendingCheckoutSessionId);
  }, [
    authLoading,
    completePaidReservations,
    confirmed,
    isFinalizingCheckout,
    pendingCheckoutSessionId,
    session?.access_token,
    toast,
    user,
  ]);

  const handleToggleReserve = (drop: FlashDrop) => {
    if (hasForeignCartItems) {
      toast({
        title: "Panier deja en cours",
        description: "Finalisez ou videz votre panier actuel avant d'ajouter une experience Chef's Table.",
        variant: "destructive",
      });
      navigate("/panier");
      return;
    }

    const menuItemId = buildChefTableMenuItemId(drop.id);

    if (selectedDropIds.has(drop.id)) {
      removeItem(menuItemId);
      toast({
        title: "Retire du panier",
        description: `${drop.dish} a ete retire de votre panier Chef's Table.`,
      });
      return;
    }

    updateCartMetadata({ feature: "chefs_table" });
    addItem({
      menuItemId,
      name: `[Chef's Table] ${drop.dish}`,
      price: drop.price,
      restaurantId: drop.restaurantId,
      restaurantName: drop.restaurant,
      metadata: {
        is_chefs_table: true,
        chef_table_drop_id: drop.id,
        chef_name: drop.chef,
        source: "chef_table_drop",
        original_price: drop.originalPrice,
        discount_percent: drop.discountPercent,
        service_time: drop.serviceTimeLabel,
        drop_time: drop.dropTime,
        restaurant_address: drop.restaurantAddress,
        cuisine: drop.cuisine,
      },
    });
    toast({
      title: "Ajoute au panier",
      description: `${drop.dish} est pret pour le paiement.`,
    });
  };

  const handleProceedToCheckout = () => {
    if (chefsTableCartItems.length === 0) return;
    updateCartMetadata({ feature: "chefs_table" });
    navigate("/panier");
  };

  const handleGoToReservations = () => {
    if (confirmedReservations.length === 1) {
      setShowDetailModal(true);
      return;
    }
    navigate("/reservations");
  };

  const detailForModal = confirmedReservations.length > 0
    ? {
        id: confirmedReservations[0].id,
        date: confirmedReservations[0].date,
        time: confirmedReservations[0].time,
        party_size: confirmedReservations[0].party_size,
        status: confirmedReservations[0].status,
        feature: "chefs_table",
        notes: confirmedReservations[0].notes,
        total_amount: confirmedReservations[0].total_amount,
        created_at: confirmedReservations[0].created_at,
        metadata: confirmedReservations[0].metadata as any,
        preorder_items: confirmedReservations[0].preorder_items as any,
        restaurant_name: confirmedReservations[0].restaurant_name,
      }
    : null;

  return (
    <>
      <FeatureWizard
        title="Chef's Table"
        subtitle="Plats off-menu en edition ultra-limitee"
        icon={ChefHat}
        colorClass="amber-500"
        steps={[
          { id: "selection", label: "Selection" },
          { id: "confirm", label: "Confirmation" },
        ]}
        currentStepId={confirmed ? "confirm" : "selection"}
        headerAction={
          <Button
            variant={notifyAll ? "default" : "outline"}
            onClick={async () => {
              if (!user) {
                toast({
                  title: "Connectez-vous",
                  description: "Activez les alertes apres connexion.",
                  variant: "destructive",
                });
                return;
              }

              if (notifyAll) {
                await supabase
                  .from("notification_subscriptions" as any)
                  .delete()
                  .eq("user_id", user.id)
                  .eq("topic", "chefs_table");
              } else {
                await supabase
                  .from("notification_subscriptions" as any)
                  .upsert(
                    { user_id: user.id, topic: "chefs_table", filters: {} },
                    { onConflict: "user_id,topic" },
                  );
              }

              queryClient.invalidateQueries({ queryKey: ["chefs-table-subscription", user.id] });
              toast({
                title: notifyAll ? "Alertes desactivees" : "Alertes Chef's Table activees",
              });
            }}
            className="gap-2"
          >
            <Bell className={cn("h-4 w-4", notifyAll && "fill-current")} />
            {notifyAll ? "Notifications ON" : "M'alerter"}
          </Button>
        }
      >
        <div className="space-y-8">
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-500/20 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-rose-500/10 p-4">
            <div className="h-3 w-3 rounded-full bg-red-500 animate-pulse" />
            <p className="text-sm font-medium">
              <span className="font-semibold text-amber-700">
                {drops.reduce((sum, drop) => sum + drop.remaining, 0)} portions
              </span>{" "}
              disponibles sur la selection live
            </p>
            <Badge variant="outline" className="ml-auto gap-1 border-amber-300/70 bg-white/70">
              <Zap className="h-3 w-3" />
              Live
            </Badge>
          </div>

          {!confirmed ? (
            <>
              {isFinalizingCheckout ? (
                <div className="rounded-[28px] border border-amber-200 bg-amber-50/50 p-10 text-center">
                  <Sparkles className="mx-auto h-12 w-12 text-amber-500" />
                  <h2 className="mt-4 font-display text-2xl font-bold">Paiement recu</h2>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                    Nous finalisons vos reservations Chef's Table. Cela prend seulement quelques secondes.
                  </p>
                </div>
              ) : drops.length > 0 ? (
                <div className="grid gap-6">
                  {drops.map((drop, index) => (
                    <ChefTableDropCard
                      key={drop.id}
                      drop={drop}
                      index={index}
                      isReserved={selectedDropIds.has(drop.id)}
                      onToggleReserve={handleToggleReserve}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-[28px] border border-dashed border-amber-200 bg-amber-50/40 p-10 text-center">
                  <ChefHat className="mx-auto h-12 w-12 text-amber-500" />
                  <h2 className="mt-4 font-display text-2xl font-bold">Aucun drop en ce moment</h2>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                    Activez les alertes pour etre prevenu des prochaines creations exclusives des chefs.
                  </p>
                </div>
              )}

              {chefsTableCartItems.length > 0 ? (
                <div className="sticky bottom-4 z-40">
                  <div className="mx-4 rounded-[28px] border border-amber-500/40 bg-card/92 p-5 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.45)] backdrop-blur-xl">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                      <div className="space-y-2">
                        <p className="text-sm font-semibold text-foreground">
                          {chefsTableCartItems.length} experience(s) dans votre panier
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {reservedRestaurantCount} restaurant(s) · economie totale{" "}
                          <span className="font-semibold text-emerald-600">
                            {formatCurrency(reservedSavingsTotal)}
                          </span>
                        </p>
                        <p className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Users className="h-3 w-3" />
                          Paiement securise avant confirmation definitive de la reservation
                        </p>
                      </div>

                      <div className="text-left lg:text-right">
                        {reservedSavingsTotal > 0 ? (
                          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                            Au lieu de {formatCurrency(reservedOriginalTotal)}
                          </p>
                        ) : null}
                        <p className="font-display text-3xl font-bold text-foreground">
                          {formatCurrency(reservedTotal)}
                        </p>
                      </div>
                    </div>

                    <Button
                      onClick={handleProceedToCheckout}
                      className="mt-4 h-11 w-full rounded-xl bg-amber-500 font-semibold text-white hover:bg-amber-600"
                    >
                      Proceder au paiement
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <div className="space-y-6">
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6 text-center space-y-2">
                <CheckCircle2 className="mx-auto h-12 w-12 text-amber-500" />
                <h2 className="font-display text-xl font-bold">Reservation confirmee !</h2>
                <p className="text-sm text-muted-foreground">
                  {confirmedReservations.length > 1
                    ? `${confirmedReservations.length} reservations Chef's Table ont ete confirmees apres paiement.`
                    : "Votre table et vos plats exclusifs sont reserves apres paiement."}
                </p>
              </div>

              <WizardNextButton
                onClick={handleGoToReservations}
                label="Voir mes reservations"
                colorClass="amber-500"
              />
            </div>
          )}
        </div>
      </FeatureWizard>

      <ReservationDetailModal
        reservation={detailForModal}
        open={showDetailModal}
        onOpenChange={(open) => {
          setShowDetailModal(open);
          if (!open && confirmedReservations.length !== 1) {
            navigate("/reservations");
          }
        }}
      />
    </>
  );
}
