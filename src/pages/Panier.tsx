import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useCart } from "@/lib/cart-context";
import { useAuth } from "@/lib/auth-context";
import { getSupabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, ArrowRight, CheckCircle2, LogIn, MapPin, ShieldCheck, ShoppingCart, Sparkles, Zap, Clock, Leaf, Crown, ChefHat } from "lucide-react";
import { Link } from "react-router-dom";
import FormulaDetector from "@/components/FormulaDetector";
import PromotionDetector from "@/components/PromotionDetector";
import PromoCodeInput from "@/components/PromoCodeInput";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { generateOrderReference } from "@/lib/email-service";
import AddressAutocomplete, { type AddressSelection } from "@/components/AddressAutocomplete";
import { trackSponsoredConversion, trackEvent, trackCheckoutEvent } from "@/lib/analytics";
import {
  buildDeliverySlotGroups,
  findFirstAvailableDeliveryDate,
  formatScheduledDeliveryLabel,
  getMaxScheduledDateValue,
  getTodayDateValue,
  type DeliveryScheduleMode,
} from "@/lib/deliverySlots";
import type { ServicePeriod } from "@/lib/serviceSettings";

import CartItemList from "@/components/cart/CartItemList";
import LoyaltySection from "@/components/cart/LoyaltySection";
import FlexOptions from "@/components/cart/FlexOptions";
import PaymentMethodSelector from "@/components/cart/PaymentMethodSelector";
import CartSuggestionsStep from "@/components/cart/CartSuggestionsStep";
import { useActiveFeatures } from "@/lib/featureFlags";
import {
  getAllowedPaymentMethods,
  getFirstAvailablePaymentMethod,
  getGloballyEnabledPaymentMethods,
  type PaymentMethodId,
} from "@/lib/paymentMethods";
import { writePendingOrderCheckoutSessionId } from "@/lib/orderConfirmation";
import { buildCheckoutReturnUrl } from "@/lib/checkoutReturnUrl";
import { redirectToTrustedCheckoutUrl } from "@/lib/securityUrls";
import {
  TOK_ONE_DEFAULT_DISCOUNT_PERCENT,
  resolveTokOneDiscountPercentageForContext,
  resolveTokOneFreeDeliveryMinOrderForContext,
  useIsTokOneMember,
  useTokOneBenefits,
} from "@/hooks/useTokOne";
import { getFreshAccessToken, invokeSupabaseFunction, invokeSupabaseRpc } from "@/lib/session";
import { buildAuthRedirectTarget } from "@/lib/stripeReturn";
import { getCartItemOrderGroupKey, getMealSubscriptionOrderMetadata } from "@/lib/subscriptionCheckout";
import { getCartRestaurantSummaryLabel } from "@/lib/cartRestaurantSummary";
import {
  buildGuaranteedDeliveryOrderMetadata,
  getGuaranteedDeliveryCartContext,
} from "@/lib/guaranteedDeliveryCart";
import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";
import {
  buildCommercialDemoCheckoutReturnUrl,
  createCommercialDemoCheckout,
  createCommercialDemoOrder,
  openCommercialDemoCheckout,
} from "@/lib/commercialDemoJourney";

const supabase = getSupabase();

const AUTH_TIMEOUT_MS = 30000;
const CHECKOUT_TIMEOUT_MS = 15000;
const ORDER_VALIDATION_TIMEOUT_MS = 15000;

type CheckoutStepId = "summary" | "address" | "suggestions" | "payment";

type ValidateOrderFunctionResponse = {
  error?: string | null;
  verified_total?: number | string | null;
  order_id?: string | null;
  applied_promo_code_id?: string | null;
  applied_promo_code_discount?: number | string | null;
};

type CreateCheckoutFunctionResponse = {
  error?: string | null;
  url?: string | null;
  session_id?: string | null;
};

const CHECKOUT_STEPS: Array<{ id: CheckoutStepId; label: string; description: string }> = [
  { id: "summary", label: "Resume", description: "Commande et mode" },
  { id: "address", label: "Adresse", description: "Adresse ou retrait" },
  { id: "suggestions", label: "Suggestions", description: "Produits en plus" },
  { id: "payment", label: "Paiement", description: "Validation finale" },
];

function getCheckoutSteps(orderMode: "delivery" | "takeaway") {
  return CHECKOUT_STEPS.map((step) => {
    if (step.id !== "address" || orderMode === "delivery") return step;

    return {
      ...step,
      label: "Heure de retrait",
      description: "Date et créneau",
    };
  });
}

function hasPreciseStreetNumber(address: string, selection: AddressSelection | null) {
  const candidates = [
    address,
    selection?.fullAddress,
    selection?.label,
  ].filter(Boolean) as string[];

  return candidates.some((candidate) => {
    const firstLine = candidate.split(",")[0] || candidate;
    return /\b\d{1,5}\s?(?:[a-zA-Z]|bis|ter|quater)?\b/i.test(firstLine);
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), ms);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

export default function Panier() {
  const { items, updateQuantity, removeItem, clearCart, total, restaurantId, cartMetadata, orderMode, setOrderMode, addItem } = useCart();
  const { user, loading: authLoading, signOut } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const commercialDemoFrame = useCommercialDemoFrame();
  const globalActiveFeatures = useActiveFeatures({ enabled: !commercialDemoFrame });
  const activeFeatures = commercialDemoFrame
    ? new Set(commercialDemoFrame.snapshot.active_features)
    : globalActiveFeatures;
  const guaranteedDeliveryContext = useMemo(
    () => getGuaranteedDeliveryCartContext(cartMetadata, items),
    [cartMetadata, items],
  );
  const guaranteedDeliveryOrderMetadata = useMemo(
    () => buildGuaranteedDeliveryOrderMetadata(guaranteedDeliveryContext),
    [guaranteedDeliveryContext],
  );
  const isGuaranteedDeliveryCheckout = Boolean(guaranteedDeliveryContext);
  const authRedirectTarget = buildAuthRedirectTarget(location.pathname, location.search);
  const continueShoppingHref = restaurantId ? `/restaurant/${restaurantId}` : "/recherche";
  const deliveryFeatureEnabled = activeFeatures.has("livraison");
  const takeawayFeatureEnabled = activeFeatures.has("emporter");
  const [address, setAddress] = useState("");
  const [deliverySelection, setDeliverySelection] = useState<AddressSelection | null>(null);
  const [deliveryCity, setDeliveryCity] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [formulaDiscount, setFormulaDiscount] = useState(0);
  const [formulaName, setFormulaName] = useState<string | null>(null);
  const [promoDiscount, setPromoDiscount] = useState(0);
  const [promoName, setPromoName] = useState<string | null>(null);
  const [promoCodeDiscount, setPromoCodeDiscount] = useState(0);
  const [promoCodeName, setPromoCodeName] = useState<string | null>(null);
  const [promoCodeId, setPromoCodeId] = useState<string | null>(null);
  const [useLoyaltyPoints, setUseLoyaltyPoints] = useState(false);
  const [pointsToRedeemInput, setPointsToRedeemInput] = useState(0);
  const [donateEarnedXp, setDonateEarnedXp] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodId>("card");
  const [flexOption, setFlexOption] = useState<"express" | "standard" | "flex">("standard");
  const [pickupDate, setPickupDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [pickupTime, setPickupTime] = useState("");
  const [deliveryScheduleMode, setDeliveryScheduleMode] = useState<DeliveryScheduleMode>(
    () => guaranteedDeliveryContext?.deliveryScheduleMode ?? "asap",
  );
  const [deliveryDate, setDeliveryDate] = useState(() => guaranteedDeliveryContext?.deliveryDate ?? getTodayDateValue());
  const [deliveryTime, setDeliveryTime] = useState(() => guaranteedDeliveryContext?.deliveryTime ?? "");
  const [deliveryService, setDeliveryService] = useState<ServicePeriod | null>(
    () => guaranteedDeliveryContext?.deliveryService ?? null,
  );
  const [checkoutStep, setCheckoutStep] = useState<CheckoutStepId>("summary");
  const lastDiscount = useRef({ amount: 0, name: null as string | null });

  const { isMember: isTokOneMember, subscription: tokOneSubscription } = useIsTokOneMember();
  const { data: tokOneBenefits } = useTokOneBenefits(tokOneSubscription?.plan_id);

  const isChefsTableCheckout = cartMetadata.feature === "chefs_table"
    || (items.length > 0 && items.every((item) => item.metadata?.is_chefs_table));
  const hasAntiGaspi = items.some(item => item.metadata?.is_anti_waste);
  const antiGaspiItem = items.find(item => item.metadata?.is_anti_waste);
  const antiGaspiPickupDate = antiGaspiItem?.metadata?.available_date || null;
  const antiGaspiPickupStart = antiGaspiItem?.metadata?.pickup_start || null;
  const antiGaspiPickupEnd = antiGaspiItem?.metadata?.pickup_end || null;
  const flashItems = items.filter(item => item.metadata?.is_flash_sale);
  const chefsTableItems = items.filter(item => item.metadata?.is_chefs_table);
  const hasTakeawayFlash = orderMode === "takeaway" && flashItems.length > 0;
  const flashTakeawayItem = flashItems[0];
  const flashPickupDate = flashTakeawayItem?.metadata?.sale_date || null;
  const flashPickupStart = flashTakeawayItem?.metadata?.sale_start || null;
  const flashPickupEnd = flashTakeawayItem?.metadata?.sale_end || null;
  const discountableSubtotal = useMemo(
    () => items
      .filter((item) => item.menuItemId !== "garantie-qualite-fee")
      .reduce((sum, item) => sum + item.price * item.quantity, 0),
    [items],
  );

  const roundMoney = useCallback((value: number) => Math.round((value + Number.EPSILON) * 100) / 100, []);
  const flexFees = { express: 2.50, standard: 1.00, flex: 0 };
  const quotedDeliveryFee = isChefsTableCheckout
    ? 0
    : orderMode === "takeaway"
      ? 0
      : flexFees[flexOption];
  const tokOneJourney = isChefsTableCheckout
    ? "reservation"
    : orderMode === "delivery"
      ? "delivery"
      : "takeaway";
  const tokOneDiscountPercent = useMemo(() => {
    if (!isTokOneMember) return 0;
    return resolveTokOneDiscountPercentageForContext(
      tokOneBenefits,
      { restaurantId, journey: tokOneJourney },
      TOK_ONE_DEFAULT_DISCOUNT_PERCENT,
    );
  }, [isTokOneMember, restaurantId, tokOneBenefits, tokOneJourney]);
  const tokOneFreeDeliveryMinOrder = useMemo(
    () => resolveTokOneFreeDeliveryMinOrderForContext(
      tokOneSubscription?.user_subscription_plans,
      tokOneBenefits,
      { restaurantId, journey: tokOneJourney },
    ),
    [restaurantId, tokOneBenefits, tokOneJourney, tokOneSubscription?.user_subscription_plans],
  );
  const tokOneFreeDeliveryEligible = !isChefsTableCheckout
    && orderMode === "delivery"
    && isTokOneMember
    && quotedDeliveryFee > 0
    && discountableSubtotal >= tokOneFreeDeliveryMinOrder;
  const tokOneDiscount = useMemo(
    () => (isTokOneMember && !isChefsTableCheckout
      ? roundMoney((discountableSubtotal * tokOneDiscountPercent) / 100)
      : 0),
    [discountableSubtotal, isChefsTableCheckout, isTokOneMember, roundMoney, tokOneDiscountPercent],
  );
  const tokOneDeliverySaved = tokOneFreeDeliveryEligible ? quotedDeliveryFee : 0;
  const deliveryFee = roundMoney(Math.max(0, quotedDeliveryFee - tokOneDeliverySaved));
  const missingForFreeDelivery = !isChefsTableCheckout
    && orderMode === "delivery"
    && isTokOneMember
    && quotedDeliveryFee > 0
    && discountableSubtotal < tokOneFreeDeliveryMinOrder
    ? roundMoney(tokOneFreeDeliveryMinOrder - discountableSubtotal)
    : null;
  const deliveryAddressHasPreciseNumber = useMemo(
    () => orderMode !== "delivery" || hasPreciseStreetNumber(address, deliverySelection),
    [address, deliverySelection, orderMode],
  );
  const checkoutSteps = useMemo(() => getCheckoutSteps(orderMode), [orderMode]);
  const currentCheckoutStepIndex = Math.max(
    0,
    checkoutSteps.findIndex((step) => step.id === checkoutStep),
  );
  const deliveryLeadMinutes = flexOption === "express" ? 30 : flexOption === "flex" ? 90 : 45;
  const uniqueRestaurantIds = useMemo(() => Array.from(new Set(items.map((item) => item.restaurantId))), [items]);
  const cartRestaurantSummaryLabel = useMemo(
    () => getCartRestaurantSummaryLabel({ cartMetadata, items }),
    [cartMetadata, items],
  );
  const isSingleRestaurant = uniqueRestaurantIds.length === 1 && !cartMetadata.multi_restaurant;
  const canScheduleDelivery = !isChefsTableCheckout
    && orderMode === "delivery"
    && (isGuaranteedDeliveryCheckout || (isSingleRestaurant && deliveryFeatureEnabled));
  const needsTakeawaySlots = !isChefsTableCheckout && orderMode === "takeaway" && isSingleRestaurant && takeawayFeatureEnabled && !hasAntiGaspi && !hasTakeawayFlash;

  const { data: profile } = useQuery({
    queryKey: ["profile-loyalty", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles" as any).select("loyalty_points").eq("user_id", user?.id).single();
      return data as any;
    },
    enabled: !!user,
  });

  const { data: deliveryRestaurant } = useQuery({
    queryKey: ["cart-restaurant-hours", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurants")
        .select("id, name, opening_hours, delivery_available")
        .eq("id", restaurantId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: (canScheduleDelivery || needsTakeawaySlots) && !!restaurantId,
  });

  const { data: restaurantPaymentConfig } = useQuery({
    queryKey: ["restaurant-payment-config", restaurantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("restaurants")
        .select("disabled_payment_methods, delivery_available, supports_pickup")
        .eq("id", restaurantId!)
        .single();
      return data;
    },
    enabled: !!restaurantId,
  });

  const deliveryAvailable = deliveryFeatureEnabled && !!restaurantPaymentConfig?.delivery_available;
  const takeawayAvailable = takeawayFeatureEnabled && !!restaurantPaymentConfig?.supports_pickup;
  const allowedPaymentMethods = useMemo(() => {
    const globalSecureMethods = getGloballyEnabledPaymentMethods(activeFeatures).filter((method) => method !== "cash");
    if (isChefsTableCheckout) {
      return globalSecureMethods;
    }
    const disabled = (restaurantPaymentConfig as Record<string, unknown>)?.disabled_payment_methods as string[] || [];
    return getAllowedPaymentMethods(activeFeatures, disabled);
  }, [activeFeatures, isChefsTableCheckout, restaurantPaymentConfig]);

  useEffect(() => {
    if (isChefsTableCheckout) return;
    if (isGuaranteedDeliveryCheckout) return;
    if (orderMode === "delivery" && !deliveryAvailable && takeawayAvailable) {
      setOrderMode("takeaway", { force: true });
      return;
    }

    if (orderMode === "takeaway" && !takeawayAvailable && deliveryAvailable) {
      setOrderMode("delivery", { force: true });
    }
  }, [deliveryAvailable, isChefsTableCheckout, isGuaranteedDeliveryCheckout, orderMode, setOrderMode, takeawayAvailable]);

  useEffect(() => {
    if (isChefsTableCheckout && checkoutStep !== "payment") {
      setCheckoutStep("payment");
    }
  }, [checkoutStep, isChefsTableCheckout]);

  useEffect(() => {
    if (allowedPaymentMethods.includes(paymentMethod)) return;
    const nextMethod = getFirstAvailablePaymentMethod(
      activeFeatures,
      isChefsTableCheckout
        ? ["cash"]
        : ((restaurantPaymentConfig as Record<string, unknown>)?.disabled_payment_methods as string[] || []),
      "card",
    );
    if (nextMethod) setPaymentMethod(nextMethod);
  }, [activeFeatures, allowedPaymentMethods, isChefsTableCheckout, paymentMethod, restaurantPaymentConfig]);

  const loyaltyPoints = profile?.loyalty_points || 0;
  const maxPointsDiscount = loyaltyPoints / 100;

  const handleDiscountCalculated = useCallback((discount: number, name: string | null) => {
    if (discount !== lastDiscount.current.amount || name !== lastDiscount.current.name) {
      lastDiscount.current = { amount: discount, name };
      setFormulaDiscount(discount);
      setFormulaName(name);
    }
  }, []);

  const handlePromoCalculated = useCallback((discount: number, name: string | null) => {
    setPromoDiscount(discount);
    setPromoName(name);
  }, []);

  const handlePromoCodeApplied = useCallback((discount: number, name: string | null, codeId: string | null) => {
    setPromoCodeDiscount(discount);
    setPromoCodeName(name);
    setPromoCodeId(codeId);
  }, []);

  const effectiveFormulaDiscount = isChefsTableCheckout ? 0 : formulaDiscount;
  const effectivePromoDiscount = isChefsTableCheckout ? 0 : Math.max(promoDiscount, promoCodeDiscount);
  const effectivePromoName = isChefsTableCheckout
    ? null
    : (promoCodeDiscount >= promoDiscount && promoCodeName ? promoCodeName : promoName);
  const subFinalTotal = total - effectiveFormulaDiscount - effectivePromoDiscount - tokOneDiscount + deliveryFee;
  const flexDiscount = isChefsTableCheckout ? 0 : (flexOption === "flex" ? total * 0.1 : 0);
  const maxPointsRedeemable = Math.min(loyaltyPoints, Math.floor(Math.max(subFinalTotal - flexDiscount, 0) * 100));

  useEffect(() => {
    if (!useLoyaltyPoints && pointsToRedeemInput !== 0) { setPointsToRedeemInput(0); return; }
    if (useLoyaltyPoints && pointsToRedeemInput > maxPointsRedeemable) setPointsToRedeemInput(maxPointsRedeemable);
  }, [useLoyaltyPoints, pointsToRedeemInput, maxPointsRedeemable]);

  const firstAvailableDeliveryDate = useMemo(() => findFirstAvailableDeliveryDate({
    openingHours: deliveryRestaurant?.opening_hours,
    leadMinutes: deliveryLeadMinutes,
  }), [deliveryLeadMinutes, deliveryRestaurant?.opening_hours]);

  const deliverySlotGroups = useMemo(() => buildDeliverySlotGroups({
    openingHours: deliveryRestaurant?.opening_hours,
    dateValue: deliveryDate,
    leadMinutes: deliveryLeadMinutes,
  }), [deliveryDate, deliveryLeadMinutes, deliveryRestaurant?.opening_hours]);

  const availableDeliverySlots = useMemo(
    () => deliverySlotGroups.flatMap((group) => group.slots),
    [deliverySlotGroups],
  );

  const selectedDeliverySlot = useMemo(
    () => availableDeliverySlots.find((slot) => slot.time === deliveryTime && slot.service === deliveryService) || null,
    [availableDeliverySlots, deliveryService, deliveryTime],
  );

  const scheduledDeliveryLabel = useMemo(() => {
    if (guaranteedDeliveryContext?.scheduledDeliveryLabel) {
      return guaranteedDeliveryContext.scheduledDeliveryLabel;
    }
    if (deliveryScheduleMode !== "scheduled" || !deliveryDate || !deliveryTime) return null;
    return formatScheduledDeliveryLabel(deliveryDate, deliveryTime);
  }, [deliveryDate, deliveryScheduleMode, deliveryTime, guaranteedDeliveryContext?.scheduledDeliveryLabel]);

  useEffect(() => {
    if (!guaranteedDeliveryContext) return;
    if (orderMode !== "delivery") setOrderMode("delivery", { force: true });
    setDeliveryScheduleMode(guaranteedDeliveryContext.deliveryScheduleMode);
    setDeliveryDate(guaranteedDeliveryContext.deliveryDate);
    setDeliveryTime(guaranteedDeliveryContext.deliveryTime);
    setDeliveryService(guaranteedDeliveryContext.deliveryService);
  }, [guaranteedDeliveryContext, orderMode, setOrderMode]);

  useEffect(() => {
    if (guaranteedDeliveryContext) return;
    if (!canScheduleDelivery) {
      setDeliveryScheduleMode("asap");
      setDeliveryDate(getTodayDateValue());
      setDeliveryTime("");
      setDeliveryService(null);
      return;
    }

    if (deliveryScheduleMode !== "scheduled") return;

    if (availableDeliverySlots.length === 0 && deliveryDate !== firstAvailableDeliveryDate) {
      setDeliveryDate(firstAvailableDeliveryDate);
      return;
    }

    if (!selectedDeliverySlot) {
      const firstSlot = availableDeliverySlots[0];
      setDeliveryTime(firstSlot?.time || "");
      setDeliveryService(firstSlot?.service || null);
    }
  }, [
    availableDeliverySlots,
    canScheduleDelivery,
    deliveryDate,
    deliveryScheduleMode,
    firstAvailableDeliveryDate,
    guaranteedDeliveryContext,
    selectedDeliverySlot,
  ]);

  // --- Takeaway service-hours slot groups ---
  const takeawayLeadMinutes = 15;

  const firstAvailablePickupDate = useMemo(() => {
    if (!needsTakeawaySlots) return getTodayDateValue();
    return findFirstAvailableDeliveryDate({
      openingHours: deliveryRestaurant?.opening_hours,
      leadMinutes: takeawayLeadMinutes,
    });
  }, [needsTakeawaySlots, deliveryRestaurant?.opening_hours]);

  const takeawaySlotGroups = useMemo(() => {
    if (!needsTakeawaySlots) return [];
    return buildDeliverySlotGroups({
      openingHours: deliveryRestaurant?.opening_hours,
      dateValue: pickupDate,
      leadMinutes: takeawayLeadMinutes,
    });
  }, [needsTakeawaySlots, pickupDate, deliveryRestaurant?.opening_hours]);

  const availableTakeawaySlots = useMemo(
    () => takeawaySlotGroups.flatMap((group) => group.slots),
    [takeawaySlotGroups],
  );

  const [pickupService, setPickupService] = useState<ServicePeriod | null>(null);

  const selectedPickupSlot = useMemo(
    () => availableTakeawaySlots.find((slot) => slot.time === pickupTime && slot.service === pickupService) || null,
    [availableTakeawaySlots, pickupService, pickupTime],
  );

  useEffect(() => {
    if (!needsTakeawaySlots) return;

    if (availableTakeawaySlots.length === 0 && pickupDate !== firstAvailablePickupDate) {
      setPickupDate(firstAvailablePickupDate);
      return;
    }

    if (!selectedPickupSlot && availableTakeawaySlots.length > 0) {
      const firstSlot = availableTakeawaySlots[0];
      setPickupTime(firstSlot?.time || "");
      setPickupService(firstSlot?.service || null);
    }
  }, [availableTakeawaySlots, needsTakeawaySlots, pickupDate, firstAvailablePickupDate, selectedPickupSlot]);

  const pointsToRedeem = isChefsTableCheckout
    ? 0
    : (useLoyaltyPoints ? Math.min(pointsToRedeemInput, maxPointsRedeemable) : 0);
  const pointsDiscount = pointsToRedeem / 100;
  const earnedXp = isChefsTableCheckout ? 0 : Math.floor(Math.max(subFinalTotal, 0) * 10);
  const finalTotal = subFinalTotal - pointsDiscount - flexDiscount;
  const requiresStripeCheckout = paymentMethod !== "cash" && finalTotal > 0.01;
  const hasJourneyAvailable = isChefsTableCheckout ? true : (deliveryAvailable || takeawayAvailable);
  const checkoutDeliveryAddress = orderMode === "delivery" ? address : "";
  const checkoutDeliveryCity = orderMode === "delivery" ? (deliveryCity || null) : null;
  const checkoutDeliveryLat = orderMode === "delivery" ? (deliverySelection?.latitude ?? null) : null;
  const checkoutDeliveryLng = orderMode === "delivery" ? (deliverySelection?.longitude ?? null) : null;

  const chefsTableReservationGroups = useMemo(() => {
    if (!isChefsTableCheckout) return [];

    const groups = new Map<string, {
      key: string;
      restaurantId: string;
      restaurantName: string;
      serviceDate: string;
      serviceTime: string;
      items: typeof chefsTableItems;
      total: number;
      guestCount: number;
    }>();

    for (const item of chefsTableItems) {
      const dropTime = String(item.metadata?.drop_time || "");
      const restaurantId = String(item.restaurantId || "");
      const serviceDate = dropTime ? dropTime.split("T")[0] : "";
      const serviceTime = dropTime ? dropTime.slice(11, 16) : "";
      const key = `${restaurantId}:${dropTime}`;
      const existing = groups.get(key);

      if (existing) {
        existing.items.push(item);
        existing.total += item.price * item.quantity;
        existing.guestCount += Math.max(1, Number(item.metadata?.party_size || item.quantity || 1));
        continue;
      }

      groups.set(key, {
        key,
        restaurantId,
        restaurantName: item.restaurantName,
        serviceDate,
        serviceTime,
        items: [item],
        total: item.price * item.quantity,
        guestCount: Math.max(1, Number(item.metadata?.party_size || item.quantity || 1)),
      });
    }

    return Array.from(groups.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [chefsTableItems, isChefsTableCheckout]);

  const scrollCheckoutTop = () => {
    window.scrollTo?.({ top: 0, behavior: "smooth" });
  };

  const validateJourneyStep = () => {
    if (!hasJourneyAvailable) {
      toast({
        title: "Parcours indisponible",
        description: "Livraison et emporter sont désactivés pour ce restaurant.",
        variant: "destructive",
      });
      return false;
    }

    if (orderMode === "delivery" && !deliveryAvailable) {
      if (takeawayAvailable) setOrderMode("takeaway", { force: true });
      toast({
        title: "Livraison indisponible",
        description: "Ce restaurant n'accepte plus la livraison actuellement.",
        variant: "destructive",
      });
      return false;
    }

    if (orderMode === "takeaway" && !takeawayAvailable) {
      if (deliveryAvailable) setOrderMode("delivery", { force: true });
      toast({
        title: "Emporter indisponible",
        description: "Ce restaurant n'accepte plus l'emporter actuellement.",
        variant: "destructive",
      });
      return false;
    }

    if (hasAntiGaspi && orderMode !== "takeaway") {
      toast({
        title: "Mode incompatible",
        description: "Les offres anti-gaspi sont uniquement disponibles a l'emporter.",
        variant: "destructive",
      });
      return false;
    }

    const hasIncompatibleFlashMode = flashItems.some((item) => {
      const canDelivery = item.metadata?.delivery_available !== false;
      const canTakeaway = item.metadata?.takeaway_available !== false;
      return orderMode === "delivery" ? !canDelivery : !canTakeaway;
    });

    if (hasIncompatibleFlashMode) {
      toast({
        title: "Mode incompatible",
        description: "Certaines ventes flash du panier ne sont pas disponibles dans ce mode.",
        variant: "destructive",
      });
      return false;
    }

    return true;
  };

  const validateAddressStep = () => {
    if (orderMode === "delivery") {
      if (!address.trim()) {
        toast({ title: "Adresse requise", variant: "destructive" });
        return false;
      }

      if (deliverySelection?.latitude == null || deliverySelection?.longitude == null) {
        toast({
          title: "Adresse invalide",
          description: "Sélectionnez une adresse dans la liste pour calculer correctement le trajet de livraison.",
          variant: "destructive",
        });
        return false;
      }

      if (!deliveryAddressHasPreciseNumber) {
        toast({
          title: "Numero de rue requis",
          description: "Ajoutez le numero exact de la rue avant de continuer.",
          variant: "destructive",
        });
        return false;
      }

      if (deliveryScheduleMode === "scheduled") {
        if (!canScheduleDelivery) {
          toast({
            title: "Planification indisponible",
            description: "La livraison planifiee est disponible pour une commande sur un seul restaurant.",
            variant: "destructive",
          });
          return false;
        }

        if (!deliveryDate || (!selectedDeliverySlot && !isGuaranteedDeliveryCheckout)) {
          toast({
            title: "Horaire requis",
            description: "Choisissez une date et une heure de livraison valides.",
            variant: "destructive",
          });
          return false;
        }
      }

      return true;
    }

    if (!hasAntiGaspi && !hasTakeawayFlash) {
      if (!pickupDate || !pickupTime) {
        toast({
          title: "Date et heure requises",
          variant: "destructive",
          description: "Veuillez preciser quand vous passerez recuperer la commande.",
        });
        return false;
      }

      if (needsTakeawaySlots && !selectedPickupSlot) {
        toast({
          title: "Horaire invalide",
          variant: "destructive",
          description: "Veuillez choisir un creneau de retrait pendant les heures de service du restaurant.",
        });
        return false;
      }
    }

    return true;
  };

  const handleSummaryContinue = () => {
    if (!validateJourneyStep()) return;
    setCheckoutStep("address");
    scrollCheckoutTop();
  };

  const handleAddressContinue = () => {
    if (!validateJourneyStep()) return;
    if (!validateAddressStep()) return;
    setCheckoutStep("suggestions");
    scrollCheckoutTop();
  };

  const handleSuggestionsContinue = () => {
    setCheckoutStep("payment");
    scrollCheckoutTop();
  };

  const handleAddSuggestedItem = (suggestedItem: {
    id: string;
    name: string;
    price: number;
    restaurant_id: string;
  }) => {
    const restaurantName = items.find((item) => item.restaurantId === suggestedItem.restaurant_id)?.restaurantName || "";

    addItem({
      menuItemId: suggestedItem.id,
      name: suggestedItem.name,
      price: Number(suggestedItem.price),
      quantity: 1,
      restaurantId: suggestedItem.restaurant_id,
      restaurantName,
    });
  };

  const handleCheckout = () => {
    void processCheckout();
  };

  const processCheckout = async () => {
    if (authLoading) {
      toast({
        title: "Authentification en cours",
        description: "Patientez un instant puis relancez le paiement.",
        variant: "destructive",
      });
      return;
    }

    if (!user) return navigate(authRedirectTarget);

    setLoading(true);
    try {
      if (commercialDemoFrame?.surface === "client") {
        const demoRestaurantId = commercialDemoFrame.snapshot.demo_restaurant.id;
        const invalidItem = items.find((item) => item.restaurantId !== demoRestaurantId);
        if (invalidItem || items.length === 0) {
          throw new Error("Le panier démo ne peut contenir que les articles du restaurant simulé.");
        }

        const snapshot = await createCommercialDemoOrder(commercialDemoFrame.config.sessionId, {
          customerName: String(user.user_metadata?.full_name || user.email?.split("@")[0] || "Client démo"),
          deliveryAddress: address.trim() || "18 rue de la Démonstration, 1204 Genève",
          items: items.map((item) => ({
            name: item.name,
            quantity: item.quantity,
            // The RPC ignores this price and resolves the authoritative demo
            // catalogue amount by item name.
            unit_amount_cents: Math.round(Number(item.price || 0) * 100),
          })),
        });
        queryClient.setQueryData(
          ["commercial-demo-frame-snapshot", commercialDemoFrame.config.sessionId],
          snapshot,
        );
        if (snapshot.order?.payment_status === "test_paid") {
          clearCart();
          navigate("/commandes");
          return;
        }

        const checkout = await createCommercialDemoCheckout({
          demoRestaurantId,
          demoSessionId: commercialDemoFrame.config.sessionId,
          returnUrl: buildCommercialDemoCheckoutReturnUrl(commercialDemoFrame.config.sessionId),
        });
        clearCart();
        openCommercialDemoCheckout(commercialDemoFrame.config.sessionId, checkout.checkout_url);
        return;
      }

      let accessToken = "";
      try {
        accessToken = await withTimeout(
          getFreshAccessToken(),
          AUTH_TIMEOUT_MS,
          "Le rafraîchissement de session prend trop de temps. Reconnectez-vous puis réessayez.",
        );
      } catch {
        await signOut();
        toast({ title: "Session expirée", description: "Veuillez vous reconnecter.", variant: "destructive" });
        return navigate("/auth");
      }

      const checkoutRestaurantIds = Array.from(new Set(
        items.map((item) => item.restaurantId).filter(Boolean),
      ));
      if (checkoutRestaurantIds.length > 1) {
        return toast({
          title: "Un paiement par restaurant",
          description: "Pour sécuriser la répartition des fonds, finalisez séparément les articles de chaque restaurant.",
          variant: "destructive",
        });
      }

      if (isChefsTableCheckout) {
        const chefsTablePartySize = chefsTableItems.reduce(
          (sum, item) => sum + Math.max(1, Number(item.metadata?.party_size || item.quantity || 1)),
          0,
        );
        if (allowedPaymentMethods.length === 0) {
          return toast({
            title: "Paiement indisponible",
            description: "Aucun moyen de paiement sécurisé n'est actuellement disponible.",
            variant: "destructive",
          });
        }
        if (paymentMethod === "cash") {
          return toast({
            title: "Paiement sécurisé requis",
          description: "La Table du Chef doit être réglée à l'avance pour confirmer la réservation.",
            variant: "destructive",
          });
        }

        const { data: checkoutData, error: checkoutError } = await withTimeout(
          invokeSupabaseFunction<CreateCheckoutFunctionResponse>("create-checkout", {
            accessToken,
            body: {
              checkout_kind: "chefs-table",
              items: chefsTableItems.map((item) => ({
                name: item.name,
                price: item.price,
                quantity: item.quantity,
                restaurant_name: item.restaurantName,
                restaurant_id: item.restaurantId,
                menu_item_id: item.menuItemId,
                metadata: item.metadata || {},
              })),
              payment_method: paymentMethod,
              return_url: buildCheckoutReturnUrl("/chefs-table"),
              order_metadata: {
                checkout_kind: "chefs-table",
                restaurant_id: restaurantId,
                order_reference: `CT-${Date.now()}`,
                checkout_group_id: crypto.randomUUID(),
                pre_discount_subtotal: total,
                authoritative_total: finalTotal,
                party_size: chefsTablePartySize,
              },
            },
          }),
          CHECKOUT_TIMEOUT_MS,
          "La creation de la session de paiement prend trop de temps. Reessayez dans quelques instants.",
        );

        if (checkoutError) throw new Error(checkoutError.message);
        if (checkoutData?.error) throw new Error(checkoutData.error);
        if (!checkoutData?.url) throw new Error("Impossible de lancer le paiement La Table du Chef.");

        redirectToTrustedCheckoutUrl(checkoutData.url);
        return;
      }

      trackEvent({
        eventType: "checkout_initiated",
        eventData: { restaurant_id: restaurantId, total: finalTotal },
        restaurantId,
      });
      if (!validateJourneyStep() || !validateAddressStep()) return;
      if (!hasJourneyAvailable) {
        return toast({
          title: "Parcours indisponible",
          description: "Livraison et emporter sont désactivés pour ce restaurant.",
          variant: "destructive",
        });
      }
      if (allowedPaymentMethods.length === 0) {
        return toast({
          title: "Paiement indisponible",
          description: "Aucun moyen de paiement n'est actuellement disponible.",
          variant: "destructive",
        });
      }
      if (!allowedPaymentMethods.includes(paymentMethod)) {
        const fallbackPaymentMethod = getFirstAvailablePaymentMethod(
          activeFeatures,
          (restaurantPaymentConfig as Record<string, unknown>)?.disabled_payment_methods as string[] || [],
          "card",
        );
        if (fallbackPaymentMethod) {
          setPaymentMethod(fallbackPaymentMethod);
        }
        return toast({
          title: "Moyen de paiement indisponible",
          description: "Sélectionnez un moyen de paiement encore actif.",
          variant: "destructive",
        });
      }
      if (orderMode === "delivery" && !deliveryAvailable) {
        if (takeawayAvailable) setOrderMode("takeaway", { force: true });
        return toast({
          title: "Livraison indisponible",
          description: "Ce restaurant n'accepté plus la livraison actuellement.",
          variant: "destructive",
        });
      }
      if (orderMode === "takeaway" && !takeawayAvailable) {
        if (deliveryAvailable) setOrderMode("delivery", { force: true });
        return toast({
          title: "Emporter indisponible",
          description: "Ce restaurant n'accepté plus l'emporter actuellement.",
          variant: "destructive",
        });
      }
      if (hasAntiGaspi && orderMode !== "takeaway") return toast({ title: "Mode incompatible", description: "Les offres anti-gaspi sont uniquement disponibles à l'emporter.", variant: "destructive" });

      const hasIncompatibleFlashMode = flashItems.some((item) => {
        const canDelivery = item.metadata?.delivery_available !== false;
        const canTakeaway = item.metadata?.takeaway_available !== false;
        return orderMode === "delivery" ? !canDelivery : !canTakeaway;
      });
      if (hasIncompatibleFlashMode) return toast({ title: "Mode incompatible", description: "Certaines ventes flash du panier ne sont pas disponibles dans ce mode.", variant: "destructive" });

      if (orderMode === "delivery") {
        if (!address.trim()) return toast({ title: "Adresse requise", variant: "destructive" });
        if (deliverySelection?.latitude == null || deliverySelection?.longitude == null) {
          return toast({
            title: "Adresse invalide",
            description: "Sélectionnez une adresse dans la liste pour calculer correctement le trajet de livraison.",
            variant: "destructive",
          });
        }
        if (deliveryScheduleMode === "scheduled") {
          if (!canScheduleDelivery) {
            return toast({
              title: "Planification indisponible",
              description: "La livraison planifiée est disponible pour une commande sur un seul restaurant.",
              variant: "destructive",
            });
          }
          if (!deliveryDate || (!selectedDeliverySlot && !isGuaranteedDeliveryCheckout)) {
            return toast({
              title: "Horaire requis",
              description: "Choisissez une date et une heure de livraison valides.",
              variant: "destructive",
            });
          }
        }
      } else if (!hasAntiGaspi && !hasTakeawayFlash) {
        if (!pickupDate || !pickupTime) {
          return toast({ title: "Date et heure requises", variant: "destructive", description: "Veuillez préciser quand vous passerez récupérer la commande." });
        }
        if (needsTakeawaySlots && !selectedPickupSlot) {
          return toast({ title: "Horaire invalide", variant: "destructive", description: "Veuillez choisir un créneau de retrait pendant les heures de service du restaurant." });
        }
      }

      const itemsByRestaurant = items.reduce((acc, item) => {
        const groupKey = getCartItemOrderGroupKey(item);
        if (!acc[groupKey]) acc[groupKey] = [];
        acc[groupKey].push(item);
        return acc;
      }, {} as Record<string, any[]>);

      const orderGroups = Object.entries(itemsByRestaurant).map(([groupKey, resItems]) => {
        const resId = String(resItems[0]?.restaurantId || "");
        const qualityFeeItem = resItems.find(i => i.menuItemId === "garantie-qualite-fee");
        const realItems = resItems.filter(i => i.menuItemId !== "garantie-qualite-fee");
        const resSubtotal = realItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
        return { groupKey, resId, resItems, realItems, qualityFeeItem, resSubtotal };
      }).filter((group) => group.realItems.length > 0);
      const resCount = orderGroups.length;
      const checkoutGroupId = crypto.randomUUID();
      let firstOrderId: string | null = null;
      let checkoutBenefitsOrderId: string | null = null;
      let checkoutBenefitsPromoCodeId: string | null = null;
      let checkoutBenefitsPromoDiscount = 0;
      const orderReference = generateOrderReference();
      const allocateAcrossGroups = (totalDiscount: number) => {
        const baseTotal = orderGroups.reduce((sum, group) => sum + group.resSubtotal, 0);
        let remaining = Math.round(totalDiscount * 100) / 100;

        return new Map(orderGroups.map((group, index) => {
          const share = baseTotal > 0 ? group.resSubtotal / baseTotal : (resCount > 0 ? 1 / resCount : 0);
          const allocated = index === orderGroups.length - 1
            ? Math.max(0, remaining)
            : Math.round((totalDiscount * share) * 100) / 100;
          remaining = Math.max(0, Math.round((remaining - allocated) * 100) / 100);
          return [group.groupKey, allocated];
        }));
      };

      const allocateEvenlyAcrossGroups = (totalAmount: number) => {
        let remaining = Math.round(totalAmount * 100) / 100;
        return new Map(orderGroups.map((group, index) => {
          const allocated = index === orderGroups.length - 1
            ? Math.max(0, remaining)
            : Math.round((totalAmount / Math.max(orderGroups.length, 1)) * 100) / 100;
          remaining = Math.max(0, Math.round((remaining - allocated) * 100) / 100);
          return [group.groupKey, allocated];
        }));
      };

      const pointsDiscountByRestaurant = allocateAcrossGroups(pointsDiscount);
      const flexDiscountByRestaurant = allocateAcrossGroups(flexDiscount);
      const tokOneDiscountByRestaurant = allocateAcrossGroups(tokOneDiscount);
      const deliveryFeeByRestaurant = allocateEvenlyAcrossGroups(quotedDeliveryFee);
      const tokOneDeliverySavedByRestaurant = allocateEvenlyAcrossGroups(tokOneDeliverySaved);
      const validationPayloads = orderGroups.map((group, index) => buildOrderValidationPayload(
        group,
        index,
        resCount,
        orderReference,
        checkoutGroupId,
        deliveryFeeByRestaurant,
        tokOneDeliverySavedByRestaurant,
        tokOneDiscountByRestaurant,
        pointsDiscountByRestaurant,
        flexDiscountByRestaurant,
      ));
      const previewResults = await Promise.all(validationPayloads.map(async ({ resId, body }) => {
        const { data, error } = await withTimeout(
          invokeSupabaseFunction<ValidateOrderFunctionResponse>("validate-order", {
            accessToken,
            body: {
              ...body,
              preview_only: true,
            },
          }),
          ORDER_VALIDATION_TIMEOUT_MS,
          "La vérification du montant prend trop de temps. Reessayez dans quelques instants.",
        );

        if (error) throw new Error(error.message);
        if (data?.error) throw new Error(data.error);

        return {
          resId,
          verifiedTotal: Number(data?.verified_total || 0),
        };
      }));
      const authoritativeTotal = roundMoney(
        previewResults.reduce((sum, result) => sum + result.verifiedTotal, 0),
      );
      const authoritativeRequiresStripeCheckout = paymentMethod !== "cash" && authoritativeTotal > 0.01;

      // For online payments with a remaining balance, redirect to Stripe
      if (authoritativeRequiresStripeCheckout) {
        if (!requiresStripeCheckout) {
          toast({
            title: "Montant mis à jour",
            description: `Le total confirme est de ${authoritativeTotal.toFixed(2)} CHF. Redirection vers le paiement.`,
          });
        }

        const pendingOrderResults = await Promise.all(validationPayloads.map(async ({ resId, body }) => {
          const { data: validateResult, error: validateError } = await withTimeout(
            invokeSupabaseFunction<ValidateOrderFunctionResponse>("validate-order", {
              accessToken,
              body: {
                ...body,
                metadata: {
                  ...(body.metadata || {}),
                  checkout_session_state: "pending",
                  requires_stripe_checkout: true,
                },
              },
            }),
            ORDER_VALIDATION_TIMEOUT_MS,
            "La préparation de votre commande prend trop de temps. Reessayez dans quelques instants.",
          );

          if (validateError) throw new Error(validateError.message);
          if (validateResult?.error) throw new Error(validateResult.error);
          return { resId, orderId: validateResult?.order_id || null };
        }));

        firstOrderId = pendingOrderResults.find((result) => result.orderId)?.orderId || null;
        const pendingOrderIds = pendingOrderResults
          .map((result) => result.orderId)
          .filter((orderId): orderId is string => Boolean(orderId));
        const compensatePendingCheckout = async (reason: string) => {
          if (pendingOrderIds.length === 0) return;

          try {
            await invokeSupabaseFunction("cancel-pending-order-checkout", {
              accessToken,
              body: {
                order_ids: pendingOrderIds,
                checkout_group_id: checkoutGroupId,
                reason,
              },
            });
          } catch (compensationError) {
            console.error("Pending checkout compensation failed", compensationError);
          }
        };

        let checkoutData: Record<string, any> | null = null;
        try {
          const { data, error: checkoutError } = await withTimeout(
            invokeSupabaseFunction<CreateCheckoutFunctionResponse>("create-checkout", {
              accessToken,
              body: {
                items: items.map(i => ({
                  name: i.name,
                  price: i.price,
                  quantity: i.quantity,
                  restaurant_name: i.restaurantName,
                  restaurant_id: i.restaurantId,
                  menu_item_id: i.menuItemId,
                  metadata: i.metadata || {},
                })),
                payment_method: paymentMethod,
                return_url: buildCheckoutReturnUrl("/commande/confirmation"),
                order_metadata: {
                  order_reference: orderReference,
                  restaurant_id: restaurantId,
                  delivery_fee: quotedDeliveryFee,
                  checkout_group_id: checkoutGroupId,
                  primary_order_id: firstOrderId,
                  checkout_session_state: "pending",
                  promo_code_id: promoCodeId,
                  points_to_redeem: pointsToRedeem,
                  ...guaranteedDeliveryOrderMetadata,
                  delivery_address: checkoutDeliveryAddress,
                  delivery_city: checkoutDeliveryCity,
                  delivery_lat: checkoutDeliveryLat,
                  delivery_lng: checkoutDeliveryLng,
                  formula_discount: formulaDiscount,
                  formula_discount_amount: formulaDiscount,
                  promotion_discount_amount: effectivePromoDiscount,
                  promotion_applied: effectivePromoName,
                  points_discount: pointsDiscount,
                  points_discount_amount: pointsDiscount,
                  flex_discount: flexDiscount,
                  flex_discount_amount: flexDiscount,
                  tok_one_discount_amount: tokOneDiscount,
                  tok_one_discount_percent: tokOneDiscountPercent,
                  tok_one_member: isTokOneMember,
                  tok_one_delivery_saved: tokOneDeliverySaved,
                  flex_option: flexOption,
                },
              },
            }),
            CHECKOUT_TIMEOUT_MS,
            "La creation de la session Stripe prend trop de temps. Reessayez dans quelques instants.",
          );

          if (checkoutError) throw new Error(checkoutError.message);
          if (data?.error) throw new Error(data.error);
          if (!data?.url || !data?.session_id) {
            throw new Error("Impossible de lancer le paiement Stripe pour cette commande.");
          }
          checkoutData = data;
        } catch (checkoutFailure: any) {
          await compensatePendingCheckout(checkoutFailure?.message || "Echec creation session Stripe");
          throw checkoutFailure;
        }
        if (!checkoutData) {
          throw new Error("Impossible de lancer le paiement Stripe pour cette commande.");
        }

        writePendingOrderCheckoutSessionId(checkoutData.session_id);

        for (const { resId, orderId } of pendingOrderResults) {
          if (orderId) {
            void trackCheckoutEvent(orderId, "checkout_online_pending", { stripe_session_id: checkoutData.session_id });
          }
          void trackSponsoredConversion(resId, {
            conversionType: "order",
            entityId: orderId,
            paymentMethod,
            journeyType: orderMode === "delivery" ? "delivery" : "takeaway",
          });
        }

        redirectToTrustedCheckoutUrl(checkoutData.url);
        return;
      }

      if (paymentMethod !== "cash" && !authoritativeRequiresStripeCheckout) {
        toast({
          title: "Aucun paiement requis",
          description: "Votre total est entièrement couvert par vos avantages. La commande est confirmée sans passage Stripe.",
        });
      }

      // Cash payment flow or zero-balance online flow — create orders directly as confirmed
      for (const { resId, body } of validationPayloads) {

        const { data: validateResult, error: validateError } = await invokeSupabaseFunction<ValidateOrderFunctionResponse>("validate-order", {
          accessToken,
          body,
        });

        if (validateError) throw new Error(validateError.message);
        if (validateResult?.error) throw new Error(validateResult.error);
        const orderId = validateResult?.order_id;
        if (!firstOrderId) firstOrderId = orderId;
        if (!checkoutBenefitsOrderId && orderId) {
          checkoutBenefitsOrderId = orderId;
        }
        if (orderId && validateResult?.applied_promo_code_id) {
          checkoutBenefitsOrderId = orderId;
          checkoutBenefitsPromoCodeId = String(validateResult.applied_promo_code_id);
          checkoutBenefitsPromoDiscount = Number(validateResult.applied_promo_code_discount || 0);
        }

        if (orderId) {
          await trackCheckoutEvent(orderId, paymentMethod === "cash" ? "checkout_cash_confirmed" : "checkout_zero_balance_confirmed", {
            total: Number(validateResult?.verified_total || body.total_amount || 0),
          });
        }

        if (cartMetadata.groupId) {
          await supabase.from("group_members" as any).update({ order_id: orderId }).eq("group_id", cartMetadata.groupId).eq("user_id", user.id);
        }
        await trackSponsoredConversion(resId, {
          conversionType: "order",
          entityId: orderId || null,
          paymentMethod,
          journeyType: orderMode === "delivery" ? "delivery" : "takeaway",
        });
      }

      if (user?.id && checkoutBenefitsOrderId && (pointsToRedeem > 0 || checkoutBenefitsPromoCodeId)) {
        await invokeSupabaseRpc("apply_checkout_benefits", {
          accessToken,
          body: {
            p_user_id: user.id,
            p_order_id: checkoutBenefitsOrderId,
            p_points_to_redeem: pointsToRedeem,
            p_promo_code_id: checkoutBenefitsPromoCodeId,
            p_discount_applied: checkoutBenefitsPromoDiscount,
            p_description: `Paiement commande ${orderReference}`,
          },
        });
      }

      await new Promise(resolve => setTimeout(resolve, 1500));
      clearCart();
      queryClient.invalidateQueries({ queryKey: ["my-orders"] });
      queryClient.invalidateQueries({ queryKey: ["profile-loyalty"] });
      queryClient.invalidateQueries({ queryKey: ["loyalty-transactions"] });
      if (donateEarnedXp) {
        queryClient.invalidateQueries({ queryKey: ["donated-meals-total"] });
        queryClient.invalidateQueries({ queryKey: ["donated-points-total"] });
      }

      toast({ title: "Commandes confirmées !", description: resCount > 1 ? `Vos ${resCount} commandes ont été synchronisées. Réf: ${orderReference}` : `Votre commande est en cours de préparation. Réf: ${orderReference}` });
      navigate(firstOrderId ? `/commande/${firstOrderId}` : "/commandes");
    } catch (error: any) {
      toast({ title: "Erreur lors du paiement", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const buildOrderMetadata = (
    resId: string,
    resSubtotal: number,
    resDiscount: number,
    resPromoDiscount: number,
    tokOneDiscountAmount: number,
    qualityFeeAmount: number,
    deliveryFeePerRestaurant: number,
    tokOneDeliverySavedAmount: number,
    resCount: number,
    orderReference: string,
    checkoutGroupId: string,
    pointsDiscountAmount: number,
    flexDiscountAmount: number,
  ) => {
    const resFormulaDiscountPercent = resSubtotal > 0 && resDiscount > 0 ? (resDiscount / resSubtotal) * 100 : 0;
    const resTokOneDiscountPercent = resSubtotal > 0 && tokOneDiscountAmount > 0 ? (tokOneDiscountAmount / resSubtotal) * 100 : 0;
    return {
      ...cartMetadata,
      ...guaranteedDeliveryOrderMetadata,
      order_reference: orderReference,
      checkout_group_id: checkoutGroupId,
      feature: hasAntiGaspi ? "anti-gaspi" : (isGuaranteedDeliveryCheckout ? "creneaux-garantis" : cartMetadata?.feature),
      has_anti_gaspi: hasAntiGaspi, has_flash_sale: flashItems.length > 0,
      quality_guarantee: !!qualityFeeAmount, quality_fee_amount: qualityFeeAmount,
      formula_applied: resDiscount > 0 ? formulaName : null,
      formula_discount_amount: resDiscount > 0 ? Number(resDiscount.toFixed(2)) : 0,
      formula_discount_percent: resFormulaDiscountPercent > 0 ? Number(resFormulaDiscountPercent.toFixed(2)) : 0,
      promotion_applied: resPromoDiscount > 0 ? effectivePromoName : null,
      promotion_discount_amount: resPromoDiscount > 0 ? Number(resPromoDiscount.toFixed(2)) : 0,
      tok_one_discount_amount: tokOneDiscountAmount > 0 ? Number(tokOneDiscountAmount.toFixed(2)) : 0,
      tok_one_discount_percent: resTokOneDiscountPercent > 0 ? Number(resTokOneDiscountPercent.toFixed(2)) : 0,
      points_to_redeem: pointsDiscountAmount > 0 ? Math.round(pointsDiscountAmount * 100) : 0,
      points_discount: pointsDiscountAmount > 0 ? Number(pointsDiscountAmount.toFixed(2)) : 0,
      points_discount_amount: pointsDiscountAmount > 0 ? Number(pointsDiscountAmount.toFixed(2)) : 0,
      flex_discount_amount: flexDiscountAmount > 0 ? Number(flexDiscountAmount.toFixed(2)) : 0,
      pre_discount_subtotal: Number(resSubtotal.toFixed(2)),
      original_total: Number((resSubtotal + deliveryFeePerRestaurant + qualityFeeAmount).toFixed(2)),
      multi_restaurant: resCount > 1, total_restaurants: resCount,
      payment_method: paymentMethod, donate_earned_xp: donateEarnedXp,
      delivery_address: orderMode === "delivery" ? address : null,
      delivery_city: orderMode === "delivery" ? (deliveryCity || null) : null,
      delivery_lat: orderMode === "delivery" ? (deliverySelection?.latitude ?? null) : null,
      delivery_lng: orderMode === "delivery" ? (deliverySelection?.longitude ?? null) : null,
      arrival_date: null, arrival_time: null,
      delivery_schedule_mode: orderMode === "delivery" ? deliveryScheduleMode : null,
      delivery_date: orderMode === "delivery" && deliveryScheduleMode === "scheduled" ? deliveryDate : null,
      delivery_time: orderMode === "delivery" && deliveryScheduleMode === "scheduled" ? deliveryTime : null,
      delivery_service: orderMode === "delivery" && deliveryScheduleMode === "scheduled" ? deliveryService : null,
      scheduled_delivery_label: orderMode === "delivery" && deliveryScheduleMode === "scheduled" ? scheduledDeliveryLabel : null,
      pickup_date: orderMode === "takeaway"
        ? hasAntiGaspi
          ? antiGaspiPickupDate
          : hasTakeawayFlash
            ? flashPickupDate
            : pickupDate
        : null,
      pickup_time: orderMode === "takeaway"
        ? hasAntiGaspi
          ? antiGaspiPickupStart
          : hasTakeawayFlash
            ? flashPickupStart
            : pickupTime
        : null,
      pickup_time_end: orderMode === "takeaway"
        ? hasAntiGaspi
          ? antiGaspiPickupEnd
          : hasTakeawayFlash
            ? flashPickupEnd
            : null
        : null,
      flex_option: flexOption,
      flex_guarantee: flexOption === "express" ? "1% discount per minute delay" : flexOption === "standard" ? "1% discount per 2 minute delay" : "10% subtotal discount applied",
      tok_one_member: isTokOneMember,
      tok_one_delivery_saved: tokOneDeliverySavedAmount > 0 ? Number(tokOneDeliverySavedAmount.toFixed(2)) : 0,
      tok_one_total_saved: Number((Math.max(0, tokOneDiscountAmount) + Math.max(0, tokOneDeliverySavedAmount)).toFixed(2)),
    };
  };

  const buildOrderValidationPayload = (
    group: { groupKey: string; resId: string; realItems: any[]; qualityFeeItem: any; resSubtotal: number },
    index: number,
    resCount: number,
    orderReference: string,
    checkoutGroupId: string,
    deliveryFeeByRestaurant: Map<string, number>,
    tokOneDeliverySavedByRestaurant: Map<string, number>,
    tokOneDiscountByRestaurant: Map<string, number>,
    pointsDiscountByRestaurant: Map<string, number>,
    flexDiscountByRestaurant: Map<string, number>,
  ) => {
    const { groupKey, resId, realItems, qualityFeeItem, resSubtotal } = group;
    const resDiscount = restaurantId === resId ? formulaDiscount : 0;
    const resPromoDiscount = restaurantId === resId ? effectivePromoDiscount : 0;
    const resTokOneDiscount = tokOneDiscountByRestaurant.get(groupKey) || 0;
    const qualityFeeAmount = qualityFeeItem?.price || 0;
    const deliveryFeePerRestaurant = deliveryFeeByRestaurant.get(groupKey) || 0;
    const resTokOneDeliverySaved = tokOneDeliverySavedByRestaurant.get(groupKey) || 0;
    const resPointsDiscount = pointsDiscountByRestaurant.get(groupKey) || 0;
    const resFlexDiscount = flexDiscountByRestaurant.get(groupKey) || 0;
    const orderCheckoutId = crypto.randomUUID();
    const orderRefForRestaurant = resCount > 1 ? `${orderReference}-${index + 1}` : orderReference;
    const clientTotal = resSubtotal
      - resDiscount
      - resPromoDiscount
      - resTokOneDiscount
      - resPointsDiscount
      - resFlexDiscount
      - resTokOneDeliverySaved
      + deliveryFeePerRestaurant
      + qualityFeeAmount;

    const finalMetadata = buildOrderMetadata(
      resId,
      resSubtotal,
      resDiscount,
      resPromoDiscount,
      resTokOneDiscount,
      qualityFeeAmount,
      deliveryFeePerRestaurant,
      resTokOneDeliverySaved,
      resCount,
      orderRefForRestaurant,
      checkoutGroupId,
      resPointsDiscount,
      resFlexDiscount,
    );

    const orderItemsJson = realItems.map((item) => ({
      menu_item_id: item.menuItemId,
      restaurant_id: item.restaurantId,
      quantity: Math.floor(item.quantity),
      unit_price: Number(item.price),
      total_price: Number(item.price) * Math.floor(item.quantity),
      metadata: item.metadata || {},
    }));

    return {
      resId,
      clientTotal,
      body: {
        restaurant_id: resId,
        delivery_address: checkoutDeliveryAddress,
        delivery_fee: deliveryFeePerRestaurant,
        total_amount: clientTotal,
        notes: notes || null,
        items: orderItemsJson,
        metadata: {
          ...finalMetadata,
          ...getMealSubscriptionOrderMetadata(realItems),
        },
        checkout_id: orderCheckoutId,
      },
    };
  };

  if (items.length === 0) {
    return (
      <main className="min-h-screen bg-background">
        <div className="container py-16 text-center space-y-4">
          <ShoppingCart className="h-12 w-12 mx-auto text-muted-foreground" />
          <h1 className="font-display text-2xl font-bold">Votre panier est vide</h1>
          <p className="text-muted-foreground">Explorez nos restaurants et ajoutez des plats</p>
          <Button asChild><Link to="/recherche">Voir les restaurants</Link></Button>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-background">
        <div className="container max-w-2xl space-y-6 py-8">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-primary/80">
              <span className="rounded-full bg-primary/10 px-3 py-1 text-primary">Panier pret</span>
              <span className="rounded-full bg-secondary px-3 py-1 text-muted-foreground">Connexion</span>
              <span className="rounded-full bg-secondary px-3 py-1 text-muted-foreground">Paiement</span>
            </div>
        <h1 className="font-display text-3xl font-bold">Votre panier est prêt à continuer</h1>
            <p className="text-sm text-muted-foreground">
              Finalisez la connexion pour renseigner l&apos;adresse, activer vos avantages et confirmer le paiement.
            </p>
          </div>

          <div className="rounded-3xl border bg-card/70 p-5 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  Connexion demandée à l&apos;étape finale
                </div>
                <p className="text-sm text-muted-foreground">
                  Votre panier reste intact. Une fois connecté, vous retrouverez automatiquement vos plats et pourrez terminer la commande.
                </p>
              </div>
              <Button asChild size="lg" className="gap-2 rounded-full px-6">
                <Link to={authRedirectTarget}>
                  <LogIn className="h-4 w-4" />
                  Me connecter pour continuer
                </Link>
              </Button>
            </div>
          </div>

          <CartItemList items={items} updateQuantity={updateQuantity} removeItem={removeItem} />

          <div className="rounded-3xl border bg-card/60 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{isChefsTableCheckout ? "Reservation La Table du Chef" : cartRestaurantSummaryLabel}</p>
                <p className="text-xs text-muted-foreground">
                  {isChefsTableCheckout
                    ? `${chefsTableReservationGroups.length} réservation(s) à confirmer`
                    : orderMode === "delivery"
                      ? "Mode sélectionné: livraison"
                      : "Mode sélectionné: emporter"}
                </p>
              </div>
              <Link to={continueShoppingHref} className="inline-flex items-center gap-1 text-sm font-medium text-primary transition-colors hover:text-primary/80">
                Continuer mes achats
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="space-y-2 border-t pt-4 text-sm">
              <div className="flex items-center justify-between">
                <span>Sous-total</span>
                <span>{total.toFixed(2)} CHF</span>
              </div>
              {!isChefsTableCheckout ? (
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>{orderMode === "delivery" ? "Estimation livraison" : "Retrait"}</span>
                  <span>{orderMode === "delivery" ? `${deliveryFee.toFixed(2)} CHF` : "Sans frais"}</span>
                </div>
              ) : null}
              <div className="flex items-center justify-between border-t pt-2 text-base font-bold">
                <span>Total estimé</span>
                <span>{finalTotal.toFixed(2)} CHF</span>
              </div>
            </div>

            <div className="rounded-2xl bg-muted/40 p-4 text-xs text-muted-foreground">
              Les promotions, Miamz, Tok One, le choix du paiement et les informations de livraison apparaissent juste après la connexion.
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="container py-8 max-w-3xl space-y-6">
        {isChefsTableCheckout ? (
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-primary/80">
            <span className="rounded-full bg-primary/10 px-3 py-1 text-primary">Panier</span>
            <span className="rounded-full bg-primary/10 px-3 py-1 text-primary">Paiement</span>
            <span className="rounded-full bg-secondary px-3 py-1 text-muted-foreground">Confirmation</span>
          </div>
        ) : (
          <div className="grid gap-2 rounded-2xl border bg-card/70 p-3 sm:grid-cols-4">
            {checkoutSteps.map((step, index) => {
              const isActive = step.id === checkoutStep;
              const isDone = index < currentCheckoutStepIndex;
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => {
                    if (index <= currentCheckoutStepIndex) setCheckoutStep(step.id);
                  }}
                  className={`flex min-h-[74px] items-start gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${
                    isActive
                      ? "border-primary bg-primary/10 text-foreground"
                      : isDone
                        ? "border-primary/30 bg-background text-foreground"
                        : "border-transparent bg-background/50 text-muted-foreground"
                  }`}
                >
                  <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    isActive || isDone ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}>
                    {isDone ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{step.label}</span>
                    <span className="block text-xs">{step.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
        <h1 className="font-display text-3xl font-bold">Votre panier</h1>
        <p className="text-sm text-muted-foreground">
          {isChefsTableCheckout
            ? `${chefsTableReservationGroups.length} réservation(s) La Table du Chef à confirmer`
            : cartRestaurantSummaryLabel}
        </p>

        {(isChefsTableCheckout || checkoutStep === "summary") ? (
          <CartItemList items={items} updateQuantity={updateQuantity} removeItem={removeItem} />
        ) : null}

        {!isChefsTableCheckout && checkoutStep === "summary" ? (
          <div className="space-y-4 rounded-2xl border bg-card/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Mode de commande</p>
                <p className="text-sm text-muted-foreground">
                  Vous pouvez encore choisir entre livraison et emporter avant de continuer.
                </p>
              </div>
              <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
                {finalTotal.toFixed(2)} CHF
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                disabled={!deliveryAvailable || hasAntiGaspi || isGuaranteedDeliveryCheckout}
                onClick={() => setOrderMode("delivery", { force: true })}
                className={`rounded-xl border p-4 text-left transition-colors ${
                  orderMode === "delivery"
                    ? "border-primary bg-primary/10"
                    : "border-border bg-background hover:bg-muted/40"
                } ${(!deliveryAvailable || hasAntiGaspi || isGuaranteedDeliveryCheckout) ? "cursor-not-allowed opacity-60" : ""}`}
              >
                <span className="flex items-center gap-2 font-semibold">
                  <MapPin className="h-4 w-4 text-primary" />
                  Livraison
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  Adresse precise et frais calcules avant paiement.
                </span>
              </button>

              <button
                type="button"
                disabled={!takeawayAvailable || isGuaranteedDeliveryCheckout}
                onClick={() => setOrderMode("takeaway", { force: true })}
                className={`rounded-xl border p-4 text-left transition-colors ${
                  orderMode === "takeaway"
                    ? "border-primary bg-primary/10"
                    : "border-border bg-background hover:bg-muted/40"
                } ${(!takeawayAvailable || isGuaranteedDeliveryCheckout) ? "cursor-not-allowed opacity-60" : ""}`}
              >
                <span className="flex items-center gap-2 font-semibold">
                  <ShoppingCart className="h-4 w-4 text-primary" />
                  A emporter
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  Choisissez le jour et le creneau de retrait.
                </span>
              </button>
            </div>

            {!hasJourneyAvailable ? (
              <div className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
                Livraison et emporter sont actuellement indisponibles pour ce restaurant.
              </div>
            ) : null}
          </div>
        ) : null}

        {isChefsTableCheckout ? (
          <div className="rounded-3xl border border-amber-300 bg-gradient-to-br from-amber-100 via-white to-orange-50 p-5 shadow-[0_24px_70px_-38px_rgba(245,158,11,0.5)] space-y-4">
            <div className="flex items-center gap-2 text-amber-700">
              <ChefHat className="h-5 w-5" />
              <p className="font-semibold">Reservation La Table du Chef</p>
            </div>
            <p className="text-sm text-muted-foreground">
              Le paiement sécurisé confirme la réservation et les plats précommandés. Chaque drop garde son horaire de service et son nombre de convives.
            </p>
            <div className="space-y-3">
              {chefsTableReservationGroups.map((group) => (
                <div key={group.key} className="rounded-2xl border bg-background/90 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{group.restaurantName}</p>
                    <span className="text-sm font-semibold text-amber-700">{group.total.toFixed(2)} CHF</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {group.serviceDate
                      ? `${new Date(group.serviceDate).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })} à ${group.serviceTime || "--:--"}`
                      : "Horaire defini par le drop"}
                  </p>
                  <p className="mt-1 text-xs text-amber-700">
                    {group.guestCount} convive{group.guestCount > 1 ? "s" : ""}
                  </p>
                </div>
              ))}
            </div>
            <div className="rounded-2xl border border-amber-200 bg-white/80 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Paiement visible et prioritaire</p>
                  <p className="text-xs text-muted-foreground">
                    Les convives choisis dans La Table du Chef sont déjà intégrés dans cette étape de paiement.
                  </p>
                </div>
                <span className="font-display text-2xl font-bold text-foreground">{finalTotal.toFixed(2)} CHF</span>
              </div>
            </div>
          </div>
        ) : checkoutStep === "summary" ? (
          <>
            <FormulaDetector items={items} restaurantId={restaurantId} onDiscountCalculated={handleDiscountCalculated} />
            <PromotionDetector restaurantId={restaurantId} subtotal={total} onDiscountCalculated={handlePromoCalculated} />
            <PromoCodeInput restaurantId={restaurantId} userId={user?.id} subtotal={total} onApplied={handlePromoCodeApplied} />
            <Button type="button" className="w-full" size="lg" onClick={handleSummaryContinue}>
              Continuer vers l'adresse
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </>
        ) : null}

        {(isChefsTableCheckout || checkoutStep === "address") ? (
        <div className="space-y-4 pt-4 border-t">
          {isChefsTableCheckout ? (
            <div className="rounded-2xl border bg-card/60 p-4 space-y-2">
              <p className="text-sm font-semibold">Paiement avant confirmation</p>
              <p className="text-sm text-muted-foreground">
                Chef&apos;s Table fonctionne uniquement avec un paiement sécurisé à l&apos;avance. Une fois le paiement accepté, vos réservations apparaissent dans l&apos;espace réservations.
              </p>
            </div>
          ) : orderMode === "delivery" ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Adresse de livraison</Label>
                <AddressAutocomplete
                  value={address}
                  preferredCity={deliveryCity}
                  onValueChange={(value) => {
                    setAddress(value);
                    setDeliveryCity("");
                    setDeliverySelection(null);
                  }}
                  onAddressSelect={(addr, city, selection) => {
                    setAddress(selection?.fullAddress || addr);
                    setDeliveryCity(city || "");
                    setDeliverySelection(selection || null);
                  }}
                  placeholder="Rue du Rhône 8, 1204 Genève"
                />
              </div>

              <div className="space-y-3 rounded-2xl border bg-card/60 p-4">
                <div className="space-y-1">
                  <Label>Heure de livraison</Label>
                  <p className="text-xs text-muted-foreground">
                    Les créneaux respectent les services midi et soir du restaurant.
                  </p>
                </div>

                {isGuaranteedDeliveryCheckout && guaranteedDeliveryContext ? (
                  <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
                    <div className="flex items-center gap-2 text-primary">
                      <ShieldCheck className="h-4 w-4" />
                      <p className="text-sm font-semibold">Créneau garanti verrouillé</p>
                    </div>
                    <div className="space-y-1 text-sm">
                      <p><span className="text-muted-foreground">Livraison planifiée :</span> <strong>{scheduledDeliveryLabel}</strong></p>
                      {guaranteedDeliveryContext.guaranteedDeliveryWindow ? (
                        <p><span className="text-muted-foreground">Fenêtre garantie :</span> <strong>{guaranteedDeliveryContext.guaranteedDeliveryWindow}</strong></p>
                      ) : null}
                      {guaranteedDeliveryContext.guaranteedDeliveryLevelLabel ? (
                        <p><span className="text-muted-foreground">Niveau :</span> <strong>{guaranteedDeliveryContext.guaranteedDeliveryLevelLabel}</strong></p>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Ce créneau vient de l'outil Créneaux garantis. Pour le changer, retournez dans le parcours dédié.
                    </p>
                  </div>
                ) : (
                  <>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setDeliveryScheduleMode("asap")}
                    className={`rounded-xl border px-4 py-3 text-left transition-colors ${deliveryScheduleMode === "asap"
                        ? "border-primary bg-primary/5 text-foreground"
                        : "border-border bg-background hover:bg-muted/40"
                      }`}
                  >
                    <p className="font-semibold">Dès que possible</p>
                    <p className="text-xs text-muted-foreground">Lancement immédiat après validation.</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDeliveryScheduleMode("scheduled")}
                    disabled={!canScheduleDelivery}
                    className={`rounded-xl border px-4 py-3 text-left transition-colors ${deliveryScheduleMode === "scheduled"
                        ? "border-primary bg-primary/5 text-foreground"
                        : "border-border bg-background hover:bg-muted/40"
                      } ${!canScheduleDelivery ? "cursor-not-allowed opacity-60" : ""}`}
                  >
                    <p className="font-semibold">Programmer une heure</p>
                    <p className="text-xs text-muted-foreground">
                      {canScheduleDelivery
                        ? "Choisissez une heure d'arrivée par service."
                        : "Disponible pour un panier d'un seul restaurant."}
                    </p>
                  </button>
                </div>

                {deliveryScheduleMode === "scheduled" ? (
                  <div className="space-y-4 rounded-xl border border-dashed p-4">
                    <div className="space-y-2">
                      <Label>Date souhaitee</Label>
                      <Input
                        type="date"
                        value={deliveryDate}
                        onChange={(e) => setDeliveryDate(e.target.value)}
                        min={getTodayDateValue()}
                        max={getMaxScheduledDateValue()}
                        className="w-full sm:w-56"
                      />
                    </div>

                    {deliverySlotGroups.length > 0 ? (
                      <div className="space-y-3">
                        {deliverySlotGroups.map((group) => (
                          <div key={group.service} className="space-y-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Service {group.label}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {group.slots.map((slot) => (
                                <button
                                  key={`${group.service}-${slot.time}`}
                                  type="button"
                                  onClick={() => {
                                    setDeliveryTime(slot.time);
                                    setDeliveryService(slot.service);
                                  }}
                                  className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${selectedDeliverySlot?.time === slot.time && selectedDeliverySlot?.service === slot.service
                                      ? "border-primary bg-primary text-primary-foreground"
                                      : "border-border bg-background hover:bg-muted/40"
                                    }`}
                                >
                                  {slot.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-xl bg-muted/40 p-3 text-sm text-muted-foreground">
                        Aucun créneau disponible à cette date. Essayez un autre jour de service.
                      </div>
                    )}

                    {scheduledDeliveryLabel ? (
                      <div className="rounded-xl bg-primary/5 p-3 text-sm">
                        <span className="font-semibold">Livraison planifiée :</span> {scheduledDeliveryLabel}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {hasAntiGaspi ? (
                <div className="p-4 rounded-xl bg-miamz-green/10 border border-miamz-green/20 space-y-2">
                  <div className="flex items-center gap-2 text-miamz-green font-bold"><Leaf className="h-4 w-4" /><span>Retrait Anti-Gaspi</span></div>
                  <div className="text-sm space-y-1">
                    <p className="flex items-center gap-2"><Clock className="h-3.5 w-3.5 text-muted-foreground" /><span>Le <strong>{antiGaspiItem?.metadata?.available_date ? new Date(antiGaspiItem.metadata.available_date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : "aujourd'hui"}</strong></span></p>
                    <p className="flex items-center gap-2 pl-5"><span className="text-muted-foreground">Créneau :</span><strong>{antiGaspiItem?.metadata?.pickup_start} - {antiGaspiItem?.metadata?.pickup_end}</strong></p>
                  </div>
                </div>
              ) : hasTakeawayFlash ? (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-2">
                  <div className="flex items-center gap-2 text-amber-600 font-bold"><Zap className="h-4 w-4" /><span>Retrait Vente Flash</span></div>
                  <div className="text-sm space-y-1">
                    <p className="flex items-center gap-2"><Clock className="h-3.5 w-3.5 text-muted-foreground" /><span>Le <strong>{flashPickupDate ? new Date(flashPickupDate).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : "date définie par l'offre"}</strong></span></p>
                    <p className="flex items-center gap-2 pl-5"><span className="text-muted-foreground">Créneau fixe :</span><strong>{flashPickupStart || "--:--"} - {flashPickupEnd || "--:--"}</strong></p>
                    <p className="text-xs text-muted-foreground pl-5">Le créneau de retrait est imposé par la vente flash et ne peut pas être modifié.</p>
                  </div>
                </div>
              ) : needsTakeawaySlots ? (
                <div className="space-y-4 rounded-2xl border bg-card/60 p-4">
                  <div className="space-y-1">
                    <Label>Retrait à emporter</Label>
                    <p className="text-xs text-muted-foreground">
                      Les créneaux respectent les heures de service du restaurant.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Date de retrait</Label>
                    <Input
                      type="date"
                      value={pickupDate}
                      onChange={(e) => setPickupDate(e.target.value)}
                      min={getTodayDateValue()}
                      max={getMaxScheduledDateValue()}
                      className="w-full sm:w-56"
                    />
                  </div>
                  {takeawaySlotGroups.length > 0 ? (
                    <div className="space-y-3">
                      {takeawaySlotGroups.map((group) => (
                        <div key={group.service} className="space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Service {group.label}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {group.slots.map((slot) => (
                              <button
                                key={`${group.service}-${slot.time}`}
                                type="button"
                                onClick={() => {
                                  setPickupTime(slot.time);
                                  setPickupService(slot.service);
                                }}
                                className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${selectedPickupSlot?.time === slot.time && selectedPickupSlot?.service === slot.service
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "border-border bg-background hover:bg-muted/40"
                                  }`}
                              >
                                {slot.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl bg-muted/40 p-3 text-sm text-muted-foreground">
                      Aucun créneau disponible à cette date. Essayez un autre jour de service.
                    </div>
                  )}
                  {pickupTime && (
                    <div className="rounded-xl bg-primary/5 p-3 text-sm">
                      <span className="font-semibold">Retrait prevu :</span> {formatScheduledDeliveryLabel(pickupDate, pickupTime)}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>Date de retrait</Label>
                    <Input type="date" value={pickupDate} onChange={(e) => setPickupDate(e.target.value)} required min={new Date().toISOString().split('T')[0]} className="w-full sm:w-48" />
                  </div>
                  <div className="space-y-2">
                    <Label>Heure de retrait</Label>
                    <Input type="time" value={pickupTime} onChange={(e) => setPickupTime(e.target.value)} required className="w-full sm:w-48" />
                  </div>
                </>
              )}
            </div>
          )}
          {!isChefsTableCheckout ? (
            <div className="space-y-2">
              <Label>Notes (optionnel)</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Code d'entrée, étage..." />
            </div>
          ) : null}
          {!isChefsTableCheckout ? (
            <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-between">
              <Button type="button" variant="outline" onClick={() => setCheckoutStep("summary")}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Retour au resume
              </Button>
              <Button type="button" onClick={handleAddressContinue}>
                Voir les suggestions
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          ) : null}
        </div>
        ) : null}

        {!isChefsTableCheckout && checkoutStep === "suggestions" ? (
          <div className="space-y-4 border-t pt-4">
            <CartSuggestionsStep
              restaurantId={restaurantId}
              currentItems={items}
              missingForFreeDelivery={missingForFreeDelivery}
              onAdd={handleAddSuggestedItem}
            />
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <Button type="button" variant="outline" onClick={() => setCheckoutStep("address")}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Retour a l'adresse
              </Button>
              <Button type="button" onClick={handleSuggestionsContinue}>
                Continuer vers le paiement
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : null}

        {(isChefsTableCheckout || checkoutStep === "payment") ? (
          <>
        <div className="border-t pt-4 space-y-2">
          {!isChefsTableCheckout ? (
            <LoyaltySection loyaltyPoints={loyaltyPoints} maxPointsDiscount={maxPointsDiscount} useLoyaltyPoints={useLoyaltyPoints} setUseLoyaltyPoints={setUseLoyaltyPoints} pointsToRedeemInput={pointsToRedeemInput} setPointsToRedeemInput={setPointsToRedeemInput} maxPointsRedeemable={maxPointsRedeemable} earnedXp={earnedXp} donateEarnedXp={donateEarnedXp} setDonateEarnedXp={setDonateEarnedXp} />
          ) : null}

          <div className="flex justify-between text-sm"><span>Sous-total</span><span>{total.toFixed(2)} CHF</span></div>
          {effectiveFormulaDiscount > 0 && <div className="flex justify-between text-sm text-accent font-medium"><span>Réduction formule ({formulaName})</span><span>-{effectiveFormulaDiscount.toFixed(2)} CHF</span></div>}
          {effectivePromoDiscount > 0 && <div className="flex justify-between text-sm text-primary font-medium"><span>Promotion ({effectivePromoName})</span><span>-{effectivePromoDiscount.toFixed(2)} CHF</span></div>}
          {tokOneDiscount > 0 && (
            <div className="flex justify-between text-sm text-violet-600 font-medium">
              <span className="flex items-center gap-1.5"><Crown className="h-3.5 w-3.5" />Réduction Tok One ({tokOneDiscountPercent.toFixed(0)}%)</span>
              <span>-{tokOneDiscount.toFixed(2)} CHF</span>
            </div>
          )}
          {tokOneDeliverySaved > 0 ? (
            <div className="flex justify-between text-sm text-violet-600 font-medium">
              <span className="flex items-center gap-1.5"><Crown className="h-3.5 w-3.5" />Livraison offerte (Tok One)</span>
              <span><span className="mr-2 line-through text-muted-foreground">{quotedDeliveryFee.toFixed(2)} CHF</span>Gratuit</span>
            </div>
          ) : (
            <div className="flex justify-between text-sm"><span>{`Frais de livraison (${orderMode === "takeaway" ? "À l'emporter" : "Livraison"})`}</span><span>{deliveryFee.toFixed(2)} CHF</span></div>
          )}
          {orderMode === "delivery" && scheduledDeliveryLabel ? (
            <div className="flex justify-between text-sm text-muted-foreground"><span>Livraison planifiée</span><span>{scheduledDeliveryLabel}</span></div>
          ) : null}
          {pointsDiscount > 0 && <div className="flex justify-between text-sm font-medium text-pink-500"><span>Réduction Fidélité ({pointsToRedeem} pts)</span><span>-{pointsDiscount.toFixed(2)} CHF</span></div>}
          {flexDiscount > 0 && <div className="flex justify-between text-sm font-medium text-emerald-600"><span>Réduction Offres (10%)</span><span>-{flexDiscount.toFixed(2)} CHF</span></div>}
          <div className="flex justify-between font-bold text-lg border-t pt-2"><span>Total</span><span>{finalTotal.toFixed(2)} CHF</span></div>
          {earnedXp > 0 && (
            <div className="flex items-center justify-between text-sm pt-1 text-pink-500">
              <span className="flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" />{donateEarnedXp ? "Miamz reversés aux démunis" : "Miamz gagnés avec cette commande"}</span>
              <span className="font-semibold">+{earnedXp} Miamz</span>
            </div>
          )}
        </div>

        {!isChefsTableCheckout && !isTokOneMember && orderMode === "delivery" && quotedDeliveryFee > 0 && (
          <Link to="/tok-one" className="flex items-center gap-3 p-3 rounded-xl bg-violet-50 border border-violet-200 hover:bg-violet-100 transition-colors">
            <Crown className="h-5 w-5 text-violet-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-violet-900">Economisez jusqu’à {(quotedDeliveryFee + roundMoney((discountableSubtotal * TOK_ONE_DEFAULT_DISCOUNT_PERCENT) / 100)).toFixed(2)} CHF avec Tok One</p>
              <p className="text-xs text-violet-600">Livraison offerte et jusqu’à {TOK_ONE_DEFAULT_DISCOUNT_PERCENT}% de remise sur vos plats</p>
            </div>
            <span className="text-xs font-semibold text-violet-600 shrink-0">Decouvrir →</span>
          </Link>
        )}

        {!isChefsTableCheckout && orderMode === "delivery" && <FlexOptions flexOption={flexOption} setFlexOption={setFlexOption} />}
        {!hasJourneyAvailable ? (
          <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            Livraison et emporter sont actuellement indisponibles pour ce restaurant.
          </div>
        ) : null}
        <PaymentMethodSelector
          paymentMethod={paymentMethod}
          setPaymentMethod={setPaymentMethod}
          allowedMethods={allowedPaymentMethods}
          cashDescription={
            allowedPaymentMethods.includes("cash")
              ? "Le paiement sera effectué sur place lors du retrait ou de la livraison."
              : "Le paiement en espèces n'est pas disponible pour ce parcours."
          }
          variant={isChefsTableCheckout ? "chef-table" : "default"}
          secureDescription={isChefsTableCheckout
            ? "Paiement sécurisé requis pour confirmer votre réservation La Table du Chef"
            : "Paiement sécurisé via Stripe"}
        />

        {!isChefsTableCheckout ? (
          <Button type="button" variant="outline" className="w-full" onClick={() => setCheckoutStep("suggestions")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Retour aux suggestions
          </Button>
        ) : null}

        <Button
          className={isChefsTableCheckout
            ? "h-14 w-full rounded-2xl bg-amber-500 text-base font-semibold text-white shadow-[0_22px_55px_-28px_rgba(245,158,11,0.9)] hover:bg-amber-600"
            : "w-full"}
          size="lg"
          onClick={handleCheckout}
          disabled={loading || !hasJourneyAvailable || allowedPaymentMethods.length === 0}
        >
          {loading ? (
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              {requiresStripeCheckout ? "Traitement sécurisé..." : "Confirmation de la commande..."}
            </div>
          ) : isChefsTableCheckout
            ? `Payer et confirmer la réservation · ${finalTotal.toFixed(2)} CHF`
            : `${requiresStripeCheckout ? "Payer" : "Commander"} · ${finalTotal.toFixed(2)} CHF`}
        </Button>
          </>
        ) : null}
      </div>
    </main>
  );
}
