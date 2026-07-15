import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useCart } from "@/lib/cart-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Bell,
  CheckCircle2,
  ChefHat,
  Clock3,
  Crown,
  LockKeyhole,
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
import ChefTableSlotDialog from "@/components/ChefTableSlotDialog";
import { useIsTokOneMember } from "@/hooks/useTokOne";
import { invokeSupabaseFunction } from "@/lib/session";
import {
  generateDailyTimeSlots,
  getConfiguredServiceSettings,
  type ServiceSettingsMap,
} from "@/lib/serviceSettings";
import { cn } from "@/lib/utils";
import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";
import { getCommercialDemoClientMenuItems } from "@/lib/commercialDemoClientCatalog";

const supabase = getSupabase();
const CHEFS_TABLE_DROPS_LIMIT = 24;

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
  isVip: boolean;
  requiredMiamzPoints: number;
  serviceSettings: ServiceSettingsMap | null;
  quickTimeSlots: string[];
}

interface ChefTableDropCardProps {
  drop: FlashDrop;
  index: number;
  isReserved: boolean;
  selectedTime: string | null;
  selectedPartySize: number | null;
  hasUser: boolean;
  authLoading: boolean;
  isTokOneMember: boolean;
  tokOneLoading: boolean;
  onToggleReserve: (drop: FlashDrop) => void;
  onQuickTimeSelect: (drop: FlashDrop, time: string) => void;
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
  return parts.length > 0 ? parts.join(", ") : "Adresse communiquee après réservation";
}

function buildChefTableMenuItemId(dropId: string) {
  return `chef-table-${dropId}`;
}

function ChefTableDropCard({
  drop,
  index,
  isReserved,
  selectedTime,
  selectedPartySize,
  hasUser,
  authLoading,
  isTokOneMember,
  tokOneLoading,
  onToggleReserve,
  onQuickTimeSelect,
}: ChefTableDropCardProps) {
  const isAlmostSoldOut = drop.remaining <= Math.max(2, Math.ceil(drop.totalPortions * 0.25));
  const isCheckingVipAccess = authLoading || tokOneLoading;
  const hasVipAccess = !drop.isVip || (!isCheckingVipAccess && hasUser && isTokOneMember);
  const isVipLocked = drop.isVip && !hasVipAccess;
  const vipButtonLabel = authLoading
    ? "Verification du compte"
    : !hasUser
      ? "Connexion requise"
      : tokOneLoading
      ? "Verification Tok One"
      : hasVipAccess
      ? "Choisir creneau VIP"
      : "Reserve Tok One";

  return (
    <motion.article
      initial={{ opacity: 0, y: 22 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -6 }}
      transition={{ duration: 0.32, delay: index * 0.04 }}
      className={cn(
        "group overflow-hidden rounded-[28px] border border-amber-200/70 bg-card shadow-[0_22px_70px_-34px_rgba(15,23,42,0.45)] dark:border-amber-300/25 dark:bg-slate-950/95 dark:shadow-[0_30px_90px_rgba(0,0,0,0.58),0_0_42px_rgba(245,158,11,0.14)]",
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
            <Badge className="border-none bg-black/60 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-white backdrop-blur-md">
              La Table du Chef
            </Badge>
            {drop.isVip ? (
              <Badge className="gap-1 border-none bg-amber-400 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-950 shadow-lg">
                {isVipLocked ? <LockKeyhole className="h-3 w-3" /> : <Crown className="h-3 w-3" />}
                Reserve Tok One
              </Badge>
            ) : null}
            <Badge className="border-none bg-white/20 px-3 py-1 text-[11px] font-medium text-white backdrop-blur-md">
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
                Création hors carte
              </p>
              <h3 className="font-display text-2xl font-bold leading-tight drop-shadow-sm">
                {drop.dish}
              </h3>
            </div>

            <div className="flex flex-wrap gap-2 text-xs sm:text-sm">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5 backdrop-blur-md">
                <ChefHat className="h-3.5 w-3.5" />
                <span>{drop.chef}</span>
              </div>

              <div className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5 backdrop-blur-md">
                <Clock3 className="h-3.5 w-3.5" />
                <span>Service {drop.serviceTimeLabel}</span>
              </div>

              {drop.rating > 0 ? (
                <div className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5 backdrop-blur-md">
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
          <div className="rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50 via-white to-orange-50/60 p-4 dark:border-amber-300/25 dark:bg-[linear-gradient(135deg,rgba(120,53,15,0.24),rgba(15,23,42,0.92))] dark:shadow-[0_0_28px_rgba(245,158,11,0.12),inset_0_1px_0_rgba(255,255,255,0.07)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground dark:text-amber-100/75">
                  Restaurant
                </p>
                <p className="text-lg font-semibold text-foreground dark:text-white">{drop.restaurant}</p>
              </div>

              <Badge
                variant="outline"
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-semibold",
                  isAlmostSoldOut
                    ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-300/40 dark:bg-rose-400/20 dark:text-rose-100"
                    : "border-amber-200 bg-white/80 text-amber-700 dark:border-amber-300/40 dark:bg-amber-400/20 dark:text-amber-100",
                )}
              >
                {isAlmostSoldOut
                  ? `Dernieres ${drop.remaining} portions`
                  : `${drop.remaining}/${drop.totalPortions} portions`}
              </Badge>
            </div>

            <p className="mt-3 flex items-start gap-2 text-sm leading-6 text-muted-foreground dark:text-slate-200/90">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" />
              <span className="line-clamp-2">{drop.restaurantAddress}</span>
            </p>
          </div>

          <p className="text-sm leading-6 text-muted-foreground dark:text-slate-100/90">{drop.description}</p>

          {isVipLocked ? (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-300/70 bg-amber-50/90 p-4 text-sm text-amber-900 dark:border-amber-300/35 dark:bg-amber-400/15 dark:text-amber-100">
              <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">Table VIP cadenassee</p>
                <p className="mt-1 text-xs leading-5 text-amber-800/80 dark:text-amber-100/75">
                  Cette experience est indisponible sans abonnement Tok One actif.
                </p>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {drop.isVip ? (
              <Badge className="rounded-full border-none bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-500/10 dark:bg-amber-300/20 dark:text-amber-100">
                {isVipLocked ? <LockKeyhole className="mr-1 h-3 w-3" /> : <Crown className="mr-1 h-3 w-3" />}
                Table VIP Tok One
              </Badge>
            ) : null}
            <Badge
              variant="outline"
              className="rounded-full border-amber-200 bg-amber-50/80 px-3 py-1 text-xs font-medium text-amber-800 dark:border-amber-300/30 dark:bg-amber-400/20 dark:text-amber-100"
            >
              {drop.dropMomentLabel}
            </Badge>

            {drop.savingsAmount > 0 ? (
              <Badge className="rounded-full border-none bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-500/10 dark:bg-emerald-400/20 dark:text-emerald-100 dark:hover:bg-emerald-400/20">
                Vous economisez {formatCurrency(drop.savingsAmount)}
              </Badge>
            ) : null}
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border border-border/60 bg-muted/25 p-4 dark:border-white/20 dark:bg-slate-950/75 dark:shadow-[0_0_30px_rgba(245,158,11,0.12),inset_0_1px_0_rgba(255,255,255,0.06)]">
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

          <div className="space-y-2 rounded-xl bg-background/80 p-3 text-xs dark:border dark:border-white/10 dark:bg-black/30">
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
            {selectedPartySize ? (
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Sélection</span>
                <span className="font-medium text-foreground">
                  {selectedPartySize} convive{selectedPartySize > 1 ? "s" : ""}
                </span>
              </div>
            ) : null}
            {drop.isVip ? (
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Acces VIP</span>
                <span className={cn("font-medium", hasVipAccess ? "text-emerald-600" : "text-amber-700")}>
                  {hasVipAccess ? "Tok One actif" : "Abonnement requis"}
                </span>
              </div>
            ) : null}
          </div>

          {drop.quickTimeSlots.length > 0 ? (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Créneaux rapides
              </p>
              <div className="flex flex-wrap gap-1.5">
                {drop.quickTimeSlots.map((time) => {
                  const isActive = isReserved && selectedTime === time;
                  return (
                    <button
                      key={`${drop.id}-${time}`}
                      type="button"
                      disabled={isVipLocked}
                      onClick={() => onQuickTimeSelect(drop, time)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition",
                        isVipLocked && "cursor-not-allowed opacity-50",
                        isActive
                          ? "border-amber-500 bg-amber-500 text-white shadow dark:border-amber-300 dark:text-slate-950"
                          : "border-amber-200 bg-white text-amber-700 hover:bg-amber-50 dark:border-amber-200/40 dark:bg-amber-100/10 dark:text-amber-100 dark:hover:bg-amber-400/20",
                      )}
                    >
                      <Clock3 className="h-3 w-3" />
                      {time}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <Button
            onClick={() => onToggleReserve(drop)}
            variant={isReserved || isVipLocked ? "outline" : "default"}
            className={cn(
              "min-h-11 h-auto w-full whitespace-normal rounded-xl px-3 py-2 text-center text-sm font-semibold leading-tight",
              isReserved
                ? "border-amber-400 text-amber-700 hover:bg-amber-50 dark:border-amber-300/60 dark:bg-amber-400/20 dark:text-amber-100 dark:hover:bg-amber-400/20"
                : isVipLocked
                ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-300/50 dark:bg-amber-400/15 dark:text-amber-100 dark:hover:bg-amber-400/25"
                : "bg-amber-500 text-white shadow-[0_18px_40px_-24px_rgba(245,158,11,1)] hover:bg-amber-600 dark:bg-amber-400 dark:text-slate-950 dark:shadow-[0_0_28px_rgba(245,158,11,0.26)] dark:hover:bg-amber-300",
            )}
          >
            {isReserved ? (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4 shrink-0" />
                <span className="min-w-0">Retirer du panier</span>
              </>
            ) : (
              <>
                {isVipLocked ? (
                  <LockKeyhole className="mr-2 h-4 w-4 shrink-0" />
                ) : drop.isVip ? (
                  <Crown className="mr-2 h-4 w-4 shrink-0" />
                ) : (
                  <ShoppingCart className="mr-2 h-4 w-4 shrink-0" />
                )}
                <span className="min-w-0">
                  {drop.isVip ? vipButtonLabel : "Choisir créneau et convives"}
                </span>
              </>
            )}
          </Button>
        </div>
      </div>
    </motion.article>
  );
}

export default function ChefsTable() {
  const commercialDemoFrame = useCommercialDemoFrame();
  const isCommercialDemoClient = commercialDemoFrame?.surface === "client";
  const { user, session, loading: authLoading } = useAuth();
  const { items, addItem, removeItem, clearCart, updateCartMetadata } = useCart();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [isFinalizingCheckout, setIsFinalizingCheckout] = useState(false);
  const [pendingCheckoutSessionId, setPendingCheckoutSessionId] = useState<string | null>(null);
  const [confirmedReservations, setConfirmedReservations] = useState<ConfirmedChefReservation[]>([]);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [slotDialogDrop, setSlotDialogDrop] = useState<FlashDrop | null>(null);
  const [slotDialogPresetTime, setSlotDialogPresetTime] = useState<string | null>(null);
  const [slotDialogPresetPartySize, setSlotDialogPresetPartySize] = useState<number | null>(null);
  const [demoAlertsEnabled, setDemoAlertsEnabled] = useState(false);
  const attemptedFinalizationRef = useRef<Set<string>>(new Set());
  const { isMember: isTokOneMember, isLoading: tokOneLoading } = useIsTokOneMember({ enabled: !isCommercialDemoClient });

  const dropsQuery = useQuery({
    queryKey: ["chefs-table-drops"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chef_table_drops" as any)
        .select("id, restaurant_id, chef_name, dish_name, description, image_url, price, original_price, total_portions, remaining_portions, drop_time, is_active, is_vip, required_miamz_points, restaurants (name, rating, cuisine_type, image_url, address, city, opening_hours)")
        .eq("is_active", true)
        .order("drop_time", { ascending: true })
        .limit(CHEFS_TABLE_DROPS_LIMIT);

      if (error) throw error;

      return (data || []).map((drop: any) => {
        const price = Number(drop.price) || 0;
        const originalPrice = Math.max(Number(drop.original_price) || 0, price);
        const savingsAmount = Math.max(originalPrice - price, 0);
        const discountPercent =
          originalPrice > 0 && savingsAmount > 0
            ? Math.round((savingsAmount / originalPrice) * 100)
            : 0;

        const serviceSettings = getConfiguredServiceSettings(drop.restaurants?.opening_hours);
        const slotsForService = serviceSettings
          ? generateDailyTimeSlots(serviceSettings, 30)
          : { lunch: [], dinner: [], all: [] };
        const dropTime = new Date(drop.drop_time);
        const isLunchService = dropTime.getHours() < 16;
        const referenceServiceSlots = isLunchService ? slotsForService.lunch : slotsForService.dinner;
        const quickTimeSlots = (referenceServiceSlots.length > 0
          ? referenceServiceSlots
          : slotsForService.all
        ).slice(0, 6);

        return {
          id: drop.id,
          chef: drop.chef_name || "Chef invite",
          restaurant: drop.restaurants?.name || "Restaurant partenaire",
          restaurantAddress: buildRestaurantAddress(drop.restaurants),
          restaurantId: drop.restaurant_id,
          dish: drop.dish_name,
          description:
            drop.description || "Création signée servie en quantité très limitée pour un service unique.",
          price,
          originalPrice,
          savingsAmount,
          discountPercent,
          totalPortions: Number(drop.total_portions) || 0,
          remaining: Number(drop.remaining_portions) || 0,
          image: drop.image_url || drop.restaurants?.image_url || "/images/octopus-fine-dining.jpeg",
          rating: Number(drop.restaurants?.rating) || 0,
          cuisine: drop.restaurants?.cuisine_type || "Édition exclusive",
          dropTime: drop.drop_time,
          serviceTimeLabel: serviceTimeFormatter.format(dropTime),
          dropMomentLabel: dropMomentFormatter.format(dropTime),
          hasDiscount: savingsAmount > 0,
          isVip: drop.is_vip === true,
          requiredMiamzPoints: Math.max(
            0,
            Math.floor(Number(drop.required_miamz_points || 0)),
          ),
          serviceSettings,
          quickTimeSlots,
        } as FlashDrop;
      });
    },
    enabled: !isCommercialDemoClient,
  });
  const demoDrops = useMemo<FlashDrop[]>(() => {
    if (!isCommercialDemoClient || !commercialDemoFrame) return [];
    const restaurant = commercialDemoFrame.snapshot.demo_restaurant;
    const dropTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
    dropTime.setHours(19, 30, 0, 0);

    return getCommercialDemoClientMenuItems(commercialDemoFrame.snapshot).slice(0, 3).map((item, index) => ({
      id: item.id,
      chef: "Chef du restaurant démo",
      restaurant: restaurant.name,
      restaurantAddress: buildRestaurantAddress(restaurant),
      restaurantId: restaurant.id,
      dish: item.name,
      description: item.description || "Création du menu du restaurant simulé, proposée pour le parcours Table du Chef.",
      price: Number(item.price),
      originalPrice: Number(item.price),
      savingsAmount: 0,
      discountPercent: 0,
      totalPortions: 8,
      remaining: Math.max(2, 6 - index),
      image: item.image_url || restaurant.image_url || "/images/octopus-fine-dining.jpeg",
      rating: Number(restaurant.rating || 0),
      cuisine: restaurant.cuisine_type || "Édition exclusive",
      dropTime: dropTime.toISOString(),
      serviceTimeLabel: serviceTimeFormatter.format(dropTime),
      dropMomentLabel: dropMomentFormatter.format(dropTime),
      hasDiscount: false,
      isVip: false,
      requiredMiamzPoints: 0,
      serviceSettings: null,
      quickTimeSlots: ["19:00", "19:30", "20:00", "20:30"],
    }));
  }, [commercialDemoFrame, isCommercialDemoClient]);
  const drops = isCommercialDemoClient ? demoDrops : dropsQuery.data || [];

  const chefsSubscriptionQuery = useQuery({
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
    enabled: Boolean(user && !isCommercialDemoClient),
  });
  const chefsSubscription = isCommercialDemoClient
    ? (demoAlertsEnabled ? { topic: "chefs_table" } : null)
    : chefsSubscriptionQuery.data;

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

  const selectedTimeByDropId = useMemo(() => {
    const map = new Map<string, string>();
    chefsTableCartItems.forEach((item) => {
      const dropId = String(
        item.metadata?.chef_table_drop_id || item.menuItemId.replace("chef-table-", ""),
      );
      const dropTimeIso = item.metadata?.drop_time;
      if (typeof dropTimeIso === "string") {
        const parsed = new Date(dropTimeIso);
        if (!Number.isNaN(parsed.getTime())) {
          const hours = String(parsed.getHours()).padStart(2, "0");
          const minutes = String(parsed.getMinutes()).padStart(2, "0");
          map.set(dropId, `${hours}:${minutes}`);
        }
      }
    });
    return map;
  }, [chefsTableCartItems]);

  const selectedPartySizeByDropId = useMemo(() => {
    const map = new Map<string, number>();
    chefsTableCartItems.forEach((item) => {
      const dropId = String(
        item.metadata?.chef_table_drop_id || item.menuItemId.replace("chef-table-", ""),
      );
      map.set(dropId, Math.max(1, Number(item.metadata?.party_size || item.quantity || 1)));
    });
    return map;
  }, [chefsTableCartItems]);

  const reservedGuestTotal = useMemo(
    () => chefsTableCartItems.reduce((sum, item) => sum + Math.max(1, Number(item.metadata?.party_size || item.quantity || 1)), 0),
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
  const reservedSummary = useMemo(
    () =>
      chefsTableCartItems.map((item) => ({
        key: item.menuItemId,
        name: item.name.replace("[La Table du Chef] ", ""),
        restaurantName: item.restaurantName,
        serviceTime: String(item.metadata?.service_time || "--:--"),
        guestCount: Math.max(1, Number(item.metadata?.party_size || item.quantity || 1)),
      })),
    [chefsTableCartItems],
  );

  const notifyAll = !!chefsSubscription;
  const confirmed = confirmedReservations.length > 0;

  const completePaidReservations = useCallback(async (sessionId: string) => {
    setIsFinalizingCheckout(true);
    attemptedFinalizationRef.current.add(sessionId);

    try {
      const { data, error } = await invokeSupabaseFunction<{ reservations?: ConfirmedChefReservation[] }>("create-chefs-table-reservation", {
        body: { session_id: sessionId },
      });

      if (error) {
        throw new Error(error.message || "Impossible de finaliser la réservation La Table du Chef.");
      }

      const reservations = Array.isArray(data?.reservations)
        ? data.reservations
        : [];

      if (reservations.length === 0) {
        throw new Error("Paiement valide, réservation en cours de finalisation. Rechargez la page dans quelques secondes.");
      }

      clearCart();
      setConfirmedReservations(reservations as ConfirmedChefReservation[]);
      setPendingCheckoutSessionId(null);
      queryClient.invalidateQueries({ queryKey: ["reservations"] });

      toast({
        title: "Paiement confirmé",
        description:
          reservations.length > 1
            ? `${reservations.length} réservations La Table du Chef ont été confirmées.`
            : "Votre réservation La Table du Chef est confirmée.",
      });
    } catch (error) {
      toast({
        title: "Paiement en vérification",
        description:
          error instanceof Error
            ? error.message
            : "Impossible de finaliser la réservation La Table du Chef.",
        variant: "destructive",
      });
    } finally {
      setIsFinalizingCheckout(false);
    }
  }, [clearCart, queryClient, toast]);

  useEffect(() => {
    if (isCommercialDemoClient) return;
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    const sessionId = params.get("session_id");

    if (status === "success" && sessionId) {
      attemptedFinalizationRef.current.delete(sessionId);
      setPendingCheckoutSessionId(sessionId);
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }

    if (status === "cancelled") {
      setPendingCheckoutSessionId(null);
      toast({
        title: "Paiement annulé",
        description: "Vos expériences restent dans le panier, vous pouvez reessayer.",
        variant: "destructive",
      });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [isCommercialDemoClient, toast]);

  useEffect(() => {
    if (isCommercialDemoClient) return;
    if (!pendingCheckoutSessionId || confirmed || authLoading || isFinalizingCheckout) return;
    if (attemptedFinalizationRef.current.has(pendingCheckoutSessionId)) return;

    if (!user || !session?.access_token) {
      attemptedFinalizationRef.current.add(pendingCheckoutSessionId);
      toast({
        title: "Reconnectez-vous",
        description: "Le paiement a été validé. Reconnectez-vous pour récupérer votre réservation La Table du Chef.",
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
    isCommercialDemoClient,
    pendingCheckoutSessionId,
    session?.access_token,
    toast,
    user,
  ]);

  const ensureCartIsAvailable = () => {
    if (!hasForeignCartItems) return true;
    toast({
      title: "Panier déjà en cours",
      description: "Finalisez ou videz votre panier actuel avant d'ajouter une expérience La Table du Chef.",
      variant: "destructive",
    });
    navigate("/panier");
    return false;
  };

  const ensureVipTokOneAccess = (drop: FlashDrop) => {
    if (!drop.isVip) return true;

    if (authLoading || tokOneLoading) {
      toast({
        title: "Acces VIP Tok One",
        description: "Verification de votre abonnement Tok One en cours.",
      });
      return false;
    }

    if (!user) {
      toast({
        title: "Connexion requise",
        description: "Connectez-vous pour acceder aux tables VIP reservees aux abonnes Tok One.",
        variant: "destructive",
      });
      navigate("/auth");
      return false;
    }

    if (!isTokOneMember) {
      toast({
        title: "Reserve Tok One",
        description: "Cette table VIP est indisponible sans abonnement Tok One actif.",
        variant: "destructive",
      });
      navigate("/tok-one");
      return false;
    }

    return true;
  };

  const upsertDropInCart = (drop: FlashDrop, selectedIso: string, partySize: number) => {
    const menuItemId = isCommercialDemoClient ? drop.id : buildChefTableMenuItemId(drop.id);
    const selectedDate = new Date(selectedIso);
    const safePartySize = Math.max(1, Math.round(partySize));

    if (selectedDropIds.has(drop.id)) {
      removeItem(menuItemId);
    }

    updateCartMetadata({ feature: "chefs_table" });
    addItem({
      menuItemId,
      name: `[La Table du Chef] ${drop.dish}`,
      price: drop.price,
      quantity: safePartySize,
      restaurantId: drop.restaurantId,
      restaurantName: drop.restaurant,
      metadata: {
        is_chefs_table: true,
        chef_table_drop_id: drop.id,
        party_size: safePartySize,
        chef_name: drop.chef,
        source: "chef_table_drop",
        original_price: drop.originalPrice,
        discount_percent: drop.discountPercent,
        service_time: serviceTimeFormatter.format(selectedDate),
        drop_time: selectedIso,
        restaurant_address: drop.restaurantAddress,
        cuisine: drop.cuisine,
        is_vip: drop.isVip,
        required_miamz_points: drop.requiredMiamzPoints,
      },
    });
    toast({
      title: "Ajoute au panier",
      description: `${drop.dish} - ${dropMomentFormatter.format(selectedDate)} - ${safePartySize} convive(s) est pret pour le paiement.`,
    });
  };

  const handleToggleReserve = (drop: FlashDrop) => {
    const menuItemId = isCommercialDemoClient ? drop.id : buildChefTableMenuItemId(drop.id);

    if (selectedDropIds.has(drop.id)) {
      removeItem(menuItemId);
      toast({
        title: "Retire du panier",
        description: `${drop.dish} a été retire de votre panier La Table du Chef.`,
      });
      return;
    }

    if (!ensureVipTokOneAccess(drop)) return;
    if (!ensureCartIsAvailable()) return;

    setSlotDialogPresetTime(null);
    setSlotDialogPresetPartySize(selectedPartySizeByDropId.get(drop.id) ?? null);
    setSlotDialogDrop(drop);
  };

  const handleQuickTimeSelect = (drop: FlashDrop, time: string) => {
    if (!ensureVipTokOneAccess(drop)) return;
    if (!ensureCartIsAvailable()) return;
    setSlotDialogPresetTime(time);
    setSlotDialogPresetPartySize(selectedPartySizeByDropId.get(drop.id) ?? null);
    setSlotDialogDrop(drop);
  };

  const handleConfirmSlot = (selectedIso: string, partySize: number) => {
    const drop = slotDialogDrop;
    if (!drop) return;
    upsertDropInCart(drop, selectedIso, partySize);
    setSlotDialogDrop(null);
    setSlotDialogPresetTime(null);
    setSlotDialogPresetPartySize(null);
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
        title="La Table du Chef"
        subtitle="Plats off-menu en édition ultra-limitée"
        icon={ChefHat}
        colorClass="amber-500"
        steps={[
          { id: "selection", label: "Sélection" },
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
                  description: "Activez les alertes après connexion.",
                  variant: "destructive",
                });
                return;
              }

              if (isCommercialDemoClient) {
                setDemoAlertsEnabled((enabled) => !enabled);
                toast({
                  title: notifyAll ? "Alertes démo désactivées" : "Alertes démo activées",
                  description: "Aucune préférence de notification de production n’a été modifiée.",
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
                title: notifyAll ? "Alertes désactivées" : "Alertes La Table du Chef activées",
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
              disponibles sur la sélection live
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
                  <h2 className="mt-4 font-display text-2xl font-bold">Paiement reçu</h2>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                    Nous finalisons vos réservations La Table du Chef. Cela prend seulement quelques secondes.
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
                      selectedTime={selectedTimeByDropId.get(drop.id) ?? null}
                      selectedPartySize={selectedPartySizeByDropId.get(drop.id) ?? null}
                      hasUser={!!user}
                      authLoading={authLoading}
                      isTokOneMember={isTokOneMember}
                      tokOneLoading={tokOneLoading}
                      onToggleReserve={handleToggleReserve}
                      onQuickTimeSelect={handleQuickTimeSelect}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-[28px] border border-dashed border-amber-200 bg-amber-50/40 p-10 text-center">
                  <ChefHat className="mx-auto h-12 w-12 text-amber-500" />
                  <h2 className="mt-4 font-display text-2xl font-bold">Aucun drop en ce moment</h2>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                    Activez les alertes pour être prevenu des prochaines creations exclusives des chefs.
                  </p>
                </div>
              )}

              {chefsTableCartItems.length > 0 ? (
                <div className="sticky bottom-4 z-40">
                  <div className="mx-4 rounded-[30px] border border-amber-300/70 bg-gradient-to-br from-stone-950 via-neutral-900 to-amber-950 p-5 text-white shadow-[0_28px_90px_-38px_rgba(15,23,42,0.72)] backdrop-blur-xl">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                      <div className="space-y-2">
                        <p className="font-display text-2xl font-bold leading-tight text-white">
                          Votre Table du Chef est presque confirmée
                        </p>
                        <p className="text-sm text-white/75">
                          {reservedRestaurantCount} restaurant(s) · économie totale{" "}
                          <span className="font-semibold text-emerald-600">
                            {formatCurrency(reservedSavingsTotal)}
                          </span>
                        </p>
                        <p className="flex items-center gap-1 text-xs text-white/70">
                          <Users className="h-3 w-3" />
                          Paiement sécurisé requis pour verrouillér {reservedGuestTotal} convive{reservedGuestTotal > 1 ? "s" : ""} et vos portions exclusives
                        </p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {reservedSummary.map((entry) => (
                            <div key={entry.key} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                              <p className="truncate text-sm font-medium text-white">{entry.name}</p>
                              <p className="text-xs text-white/60">
                                {entry.restaurantName} - {entry.serviceTime} - {entry.guestCount} convive{entry.guestCount > 1 ? "s" : ""}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="text-left lg:text-right">
                        {reservedSavingsTotal > 0 ? (
                          <p className="text-xs uppercase tracking-[0.22em] text-white/60">
                            Au lieu de {formatCurrency(reservedOriginalTotal)}
                          </p>
                        ) : null}
                        <p className="font-display text-3xl font-bold text-white">
                          {formatCurrency(reservedTotal)}
                        </p>
                      </div>
                    </div>

                    <Button
                      onClick={handleProceedToCheckout}
                      className="mt-4 h-12 w-full rounded-2xl bg-amber-500 text-base font-semibold text-white shadow-[0_20px_50px_-24px_rgba(245,158,11,0.92)] hover:bg-amber-600"
                    >
                      Verifier et payer maintenant
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <div className="space-y-6">
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6 text-center space-y-2">
                <CheckCircle2 className="mx-auto h-12 w-12 text-amber-500" />
                <h2 className="font-display text-xl font-bold">Reservation confirmée !</h2>
                <p className="text-sm text-muted-foreground">
                  {confirmedReservations.length > 1
                    ? `${confirmedReservations.length} réservations La Table du Chef ont été confirmées après paiement.`
                    : "Votre table et vos plats exclusifs sont réservés après paiement."}
                </p>
              </div>

              <WizardNextButton
                onClick={handleGoToReservations}
                label="Voir mes réservations"
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

      <ChefTableSlotDialog
        open={!!slotDialogDrop}
        onOpenChange={(open) => {
          if (!open) {
            setSlotDialogDrop(null);
            setSlotDialogPresetTime(null);
            setSlotDialogPresetPartySize(null);
          }
        }}
        dishName={slotDialogDrop?.dish ?? ""}
        chefName={slotDialogDrop?.chef ?? ""}
        restaurantName={slotDialogDrop?.restaurant ?? ""}
        serviceSettings={slotDialogDrop?.serviceSettings ?? null}
        pricePerGuest={slotDialogDrop?.price ?? null}
        remainingPortions={slotDialogDrop?.remaining ?? null}
        initialDate={slotDialogDrop ? new Date(slotDialogDrop.dropTime) : null}
        initialTime={slotDialogPresetTime ?? slotDialogDrop?.serviceTimeLabel ?? null}
        initialPartySize={slotDialogPresetPartySize}
        onConfirm={handleConfirmSlot}
      />
    </>
  );
}
