import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ShoppingCart, Sparkles, Zap, Clock, Leaf, Gift } from "lucide-react";
import { Link } from "react-router-dom";
import FormulaDetector from "@/components/FormulaDetector";
import PromotionDetector from "@/components/PromotionDetector";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { generateOrderReference } from "@/lib/email-service";
import AddressAutocomplete, { type AddressSelection } from "@/components/AddressAutocomplete";
import { trackSponsoredConversion, trackEvent, trackCheckoutEvent } from "@/lib/analytics";
import {
  buildDeliverySlotGroups,
  buildPickupSlotGroups,
  findFirstAvailableDeliveryDate,
  findFirstAvailablePickupDate,
  formatScheduledDeliveryLabel,
  getMaxScheduledDateValue,
  getTodayDateValue,
  type DeliveryScheduleMode,
  type PickupSlotGroup,
} from "@/lib/deliverySlots";
import { getServicePeriodLabel, type ServicePeriod } from "@/lib/serviceSettings";
import { invokeSupabaseFunction } from "@/lib/session";

import CartItemList from "@/components/cart/CartItemList";
import LoyaltySection from "@/components/cart/LoyaltySection";
import FlexOptions from "@/components/cart/FlexOptions";
import PaymentMethodSelector, { type PaymentMethodId } from "@/components/cart/PaymentMethodSelector";

type CheckoutResponse = {
  url?: string;
  session_id?: string;
  error?: string;
};

type ValidateOrderResponse = {
  order_id?: string;
  verified_total?: number;
  original_total?: number;
  discount_amount?: number;
  error?: string;
};

type PickupSchedulingRestaurant = {
  id: string;
  name: string | null;
  opening_hours: unknown;
  avg_prep_time_min: number | null;
  supports_pickup: boolean | null;
};

const DEFAULT_PICKUP_LEAD_MINUTES = 20;

const getPickupLeadMinutes = (restaurant: PickupSchedulingRestaurant) => {
  const parsed = Number(restaurant.avg_prep_time_min);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_PICKUP_LEAD_MINUTES;
  return Math.max(0, Math.round(parsed));
};

const intersectPickupSlotGroups = (groupsCollection: PickupSlotGroup[][]): PickupSlotGroup[] => {
  if (groupsCollection.length === 0) return [];

  const slotOccurrences = new Map<string, { time: string; service: ServicePeriod; count: number }>();

  groupsCollection.forEach((groups) => {
    const seenInRestaurant = new Set<string>();

    groups.forEach((group) => {
      group.slots.forEach((slot) => {
        const key = `${slot.service}-${slot.time}`;
        if (seenInRestaurant.has(key)) return;
        seenInRestaurant.add(key);

        const current = slotOccurrences.get(key);
        if (current) {
          current.count += 1;
          return;
        }

        slotOccurrences.set(key, {
          time: slot.time,
          service: slot.service,
          count: 1,
        });
      });
    });
  });

  return (["lunch", "dinner"] as ServicePeriod[]).flatMap((service) => {
    const slots = Array.from(slotOccurrences.values())
      .filter((slot) => slot.service === service && slot.count === groupsCollection.length)
      .sort((a, b) => a.time.localeCompare(b.time))
      .map((slot) => ({
        time: slot.time,
        label: slot.time,
        service: slot.service,
      }));

    if (!slots.length) return [];

    return [{
      service,
      label: getServicePeriodLabel(service),
      slots,
    }];
  });
};

const findFirstSharedPickupDate = ({
  restaurants,
  maxDaysAhead = 7,
  now = new Date(),
}: {
  restaurants: PickupSchedulingRestaurant[];
  maxDaysAhead?: number;
  now?: Date;
}) => {
  if (restaurants.length === 0) return getTodayDateValue(now);

  if (restaurants.length === 1) {
    return findFirstAvailablePickupDate({
      openingHours: restaurants[0].opening_hours as any,
      leadMinutes: getPickupLeadMinutes(restaurants[0]),
      maxDaysAhead,
      now,
    });
  }

  for (let offset = 0; offset <= maxDaysAhead; offset += 1) {
    const date = new Date(now);
    date.setDate(now.getDate() + offset);
    const dateValue = getTodayDateValue(date);

    const commonGroups = intersectPickupSlotGroups(
      restaurants.map((restaurant) => buildPickupSlotGroups({
        openingHours: restaurant.opening_hours as any,
        dateValue,
        leadMinutes: getPickupLeadMinutes(restaurant),
        now,
      })),
    );

    if (commonGroups.some((group) => group.slots.length > 0)) {
      return dateValue;
    }
  }

  return getTodayDateValue(now);
};

export default function Panier() {
  const { items, updateQuantity, removeItem, clearCart, total, restaurantId, cartMetadata, orderMode } = useCart();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [address, setAddress] = useState("");
  const [deliverySelection, setDeliverySelection] = useState<AddressSelection | null>(null);
  const [deliveryCity, setDeliveryCity] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [formulaDiscount, setFormulaDiscount] = useState(0);
  const [formulaName, setFormulaName] = useState<string | null>(null);
  const [promoDiscount, setPromoDiscount] = useState(0);
  const [promoName, setPromoName] = useState<string | null>(null);
  const [useLoyaltyPoints, setUseLoyaltyPoints] = useState(false);
  const [pointsToRedeemInput, setPointsToRedeemInput] = useState(0);
  const [donateEarnedXp, setDonateEarnedXp] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodId>("card");
  const [flexOption, setFlexOption] = useState<"express" | "standard" | "flex">("standard");
  const [pickupDate, setPickupDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [pickupTime, setPickupTime] = useState("");
  const [pickupService, setPickupService] = useState<ServicePeriod | null>(null);
  const [deliveryScheduleMode, setDeliveryScheduleMode] = useState<DeliveryScheduleMode>("asap");
  const [deliveryDate, setDeliveryDate] = useState(() => getTodayDateValue());
  const [deliveryTime, setDeliveryTime] = useState("");
  const [deliveryService, setDeliveryService] = useState<ServicePeriod | null>(null);
  const lastDiscount = useRef({ amount: 0, name: null as string | null });

  const hasAntiGaspi = items.some(item => item.metadata?.is_anti_waste);
  const antiGaspiItem = items.find(item => item.metadata?.is_anti_waste);
  const flashItems = items.filter(item => item.metadata?.is_flash_sale);
  const hasFlashSale = flashItems.length > 0;
  const flashTakeawayItem = flashItems[0];
  const antiGaspiPickupDate = antiGaspiItem?.metadata?.available_date || antiGaspiItem?.metadata?.pickup_date || null;
  const antiGaspiPickupStart = antiGaspiItem?.metadata?.pickup_start || antiGaspiItem?.metadata?.pickup_time || null;
  const antiGaspiPickupEnd = antiGaspiItem?.metadata?.pickup_end || antiGaspiItem?.metadata?.pickup_time_end || null;
  const flashPickupDate = flashTakeawayItem?.metadata?.sale_date || flashTakeawayItem?.metadata?.pickup_date || null;
  const flashPickupStart = flashTakeawayItem?.metadata?.sale_start || flashTakeawayItem?.metadata?.pickup_time || null;
  const flashPickupEnd = flashTakeawayItem?.metadata?.sale_end || flashTakeawayItem?.metadata?.pickup_time_end || null;
  const hasOfferManagedPickup = hasAntiGaspi || hasFlashSale;
  const fixedPickupDate = hasAntiGaspi ? antiGaspiPickupDate : hasFlashSale ? flashPickupDate : null;
  const fixedPickupStart = hasAntiGaspi ? antiGaspiPickupStart : hasFlashSale ? flashPickupStart : null;
  const fixedPickupEnd = hasAntiGaspi ? antiGaspiPickupEnd : hasFlashSale ? flashPickupEnd : null;

  const flexFees = { express: 2.50, standard: 1.00, flex: 0 };
  const deliveryFee = orderMode === "takeaway" ? 0 : flexFees[flexOption];
  const deliveryLeadMinutes = flexOption === "express" ? 30 : flexOption === "flex" ? 90 : 45;
  const uniqueRestaurantIds = useMemo(() => Array.from(new Set(items.map((item) => item.restaurantId))), [items]);
  const canScheduleDelivery = orderMode === "delivery" && uniqueRestaurantIds.length === 1 && !cartMetadata.multi_restaurant;
  const canSchedulePickup = orderMode === "takeaway" && !hasOfferManagedPickup && uniqueRestaurantIds.length > 0;

  const { data: profile } = useQuery({
    queryKey: ["profile-loyalty", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles" as any).select("loyalty_points").eq("user_id", user?.id).single();
      return data as any;
    },
    enabled: !!user,
  });

  const { data: deliveryRestaurant } = useQuery({
    queryKey: ["cart-delivery-restaurant", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurants")
        .select("id, name, opening_hours, delivery_available")
        .eq("id", restaurantId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: canScheduleDelivery && !!restaurantId,
  });

  const { data: pickupRestaurants = [], isLoading: pickupRestaurantsLoading } = useQuery({
    queryKey: ["cart-pickup-restaurants", [...uniqueRestaurantIds].sort()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurants")
        .select("id, name, opening_hours, avg_prep_time_min, supports_pickup")
        .in("id", uniqueRestaurantIds);
      if (error) throw error;
      return (data || []) as PickupSchedulingRestaurant[];
    },
    enabled: canSchedulePickup,
  });

  const { data: restaurantPaymentConfig } = useQuery({
    queryKey: ["restaurant-payment-config", restaurantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("restaurants")
        .select("disabled_payment_methods")
        .eq("id", restaurantId!)
        .single();
      return data;
    },
    enabled: !!restaurantId,
  });

  const allowedPaymentMethods = useMemo(() => {
    const allMethods: PaymentMethodId[] = ["card", "twint", "postfinance_card", "postfinance_efinance", "cash"];
    const disabled = (restaurantPaymentConfig as Record<string, unknown>)?.disabled_payment_methods as string[] || [];
    if (disabled.length === 0) return undefined; // show all
    return allMethods.filter((m) => !disabled.includes(m));
  }, [restaurantPaymentConfig]);

  useEffect(() => {
    if (!allowedPaymentMethods?.length) return;
    if (allowedPaymentMethods.includes(paymentMethod)) return;
    setPaymentMethod(allowedPaymentMethods[0]);
  }, [allowedPaymentMethods, paymentMethod]);

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

  const subFinalTotal = total - formulaDiscount - promoDiscount + deliveryFee;
  const flexDiscount = flexOption === "flex" ? total * 0.1 : 0;
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
    if (deliveryScheduleMode !== "scheduled" || !deliveryDate || !deliveryTime) return null;
    return formatScheduledDeliveryLabel(deliveryDate, deliveryTime);
  }, [deliveryDate, deliveryScheduleMode, deliveryTime]);

  const firstAvailablePickupDate = useMemo(() => {
    if (!canSchedulePickup || pickupRestaurants.length === 0) {
      return getTodayDateValue();
    }

    return findFirstSharedPickupDate({
      restaurants: pickupRestaurants,
    });
  }, [canSchedulePickup, pickupRestaurants]);

  const pickupSlotGroups = useMemo(() => {
    if (!canSchedulePickup || pickupRestaurants.length === 0) return [];

    return intersectPickupSlotGroups(
      pickupRestaurants.map((restaurant) => buildPickupSlotGroups({
        openingHours: restaurant.opening_hours as any,
        dateValue: pickupDate,
        leadMinutes: getPickupLeadMinutes(restaurant),
      })),
    );
  }, [canSchedulePickup, pickupDate, pickupRestaurants]);

  const availablePickupSlots = useMemo(
    () => pickupSlotGroups.flatMap((group) => group.slots),
    [pickupSlotGroups],
  );

  const selectedPickupSlot = useMemo(
    () => availablePickupSlots.find((slot) => slot.time === pickupTime && slot.service === pickupService) || null,
    [availablePickupSlots, pickupService, pickupTime],
  );

  const scheduledPickupLabel = useMemo(() => {
    if (!pickupDate || !selectedPickupSlot) return null;
    return formatScheduledDeliveryLabel(pickupDate, selectedPickupSlot.time);
  }, [pickupDate, selectedPickupSlot]);

  useEffect(() => {
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
    selectedDeliverySlot,
  ]);

  useEffect(() => {
    if (!canSchedulePickup) {
      if (!hasOfferManagedPickup) {
        setPickupDate(getTodayDateValue());
        setPickupTime("");
        setPickupService(null);
      }
      return;
    }

    if (pickupRestaurantsLoading) return;

    if (availablePickupSlots.length === 0 && pickupDate !== firstAvailablePickupDate) {
      setPickupDate(firstAvailablePickupDate);
      return;
    }

    if (!selectedPickupSlot) {
      const firstSlot = availablePickupSlots[0];
      setPickupTime(firstSlot?.time || "");
      setPickupService(firstSlot?.service || null);
    }
  }, [
    availablePickupSlots,
    canSchedulePickup,
    firstAvailablePickupDate,
    hasOfferManagedPickup,
    pickupDate,
    pickupRestaurantsLoading,
    selectedPickupSlot,
  ]);

  const pointsToRedeem = useLoyaltyPoints ? Math.min(pointsToRedeemInput, maxPointsRedeemable) : 0;
  const pointsDiscount = pointsToRedeem / 100;
  const earnedXp = Math.floor(subFinalTotal * 10);
  const finalTotal = subFinalTotal - pointsDiscount - flexDiscount;

  const handleCheckout = async () => {
    if (!user) {
      toast({
        title: "Connexion requise",
        description: "Connectez-vous pour finaliser et payer votre commande.",
        variant: "destructive",
      });
      navigate("/auth");
      return;
    }

    // Session checks handled by invokeSupabaseFunction
    const sessionData = await Promise.resolve<{ session?: string | null } | null>(null);
    if (sessionData?.session === "__force_relogin__") {
      // No session at all — force re-login
      await supabase.auth.signOut();
      toast({ title: "Session expirée", description: "Veuillez vous reconnecter.", variant: "destructive" });
      return navigate("/auth");
    }

    // Proactively refresh the token to avoid 401 on edge function call
    const refreshError = await Promise.resolve<string | null>(null);
    if (refreshError) {
      await supabase.auth.signOut();
      toast({ title: "Session expirée", description: "Veuillez vous reconnecter.", variant: "destructive" });
      return navigate("/auth");
    }

    trackEvent({ eventType: "checkout_initiated", eventData: { restaurant_id: restaurantId, total: finalTotal } });
    if (hasOfferManagedPickup && orderMode !== "takeaway") {
      return toast({
        title: "Mode incompatible",
        description: hasAntiGaspi
          ? "Les offres anti-gaspi et vente flash sont uniquement disponibles a l'emporter."
          : "Les ventes flash sont uniquement disponibles a l'emporter.",
        variant: "destructive",
      });
    }

    if (orderMode === "delivery") {
      if (!address.trim()) return toast({ title: "Adresse requise", variant: "destructive" });
      if (deliverySelection?.latitude == null || deliverySelection?.longitude == null) {
        return toast({
          title: "Adresse invalide",
          description: "Selectionnez une adresse dans la liste pour calculer correctement le trajet de livraison.",
          variant: "destructive",
        });
      }
      if (deliveryScheduleMode === "scheduled") {
        if (!canScheduleDelivery) {
          return toast({
            title: "Planification indisponible",
            description: "La livraison planifiee est disponible pour une commande sur un seul restaurant.",
            variant: "destructive",
          });
        }
        if (!deliveryDate || !selectedDeliverySlot) {
          return toast({
            title: "Horaire requis",
            description: "Choisissez une date et une heure de livraison valides.",
            variant: "destructive",
          });
        }
      }
    } else if (!hasOfferManagedPickup && (!pickupDate || !selectedPickupSlot)) {
      return toast({
        title: "Créneau requis",
        variant: "destructive",
        description: "Choisissez un créneau de retrait encore disponible pour ce restaurant.",
      });
    }

    const itemsByRestaurant = items.reduce((acc, item) => {
      if (!acc[item.restaurantId]) acc[item.restaurantId] = [];
      acc[item.restaurantId].push(item);
      return acc;
    }, {} as Record<string, any[]>);

    const orderGroups = Object.entries(itemsByRestaurant).map(([resId, resItems]) => {
      const qualityFeeItem = resItems.find(i => i.menuItemId === "garantie-qualite-fee");
      const realItems = resItems.filter(i => i.menuItemId !== "garantie-qualite-fee");
      const resSubtotal = realItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
      return { resId, resItems, realItems, qualityFeeItem, resSubtotal };
    }).filter((group) => group.realItems.length > 0);
    const resCount = orderGroups.length;
    const checkoutGroupId = crypto.randomUUID();
    let firstOrderId: string | null = null;
    const orderReference = generateOrderReference();
    setLoading(true);

    const allocateAcrossGroups = (totalDiscount: number) => {
      const baseTotal = orderGroups.reduce((sum, group) => sum + group.resSubtotal, 0);
      let remaining = Math.round(totalDiscount * 100) / 100;

      return new Map(orderGroups.map((group, index) => {
        const share = baseTotal > 0 ? group.resSubtotal / baseTotal : (resCount > 0 ? 1 / resCount : 0);
        const allocated = index === orderGroups.length - 1
          ? Math.max(0, remaining)
          : Math.round((totalDiscount * share) * 100) / 100;
        remaining = Math.max(0, Math.round((remaining - allocated) * 100) / 100);
        return [group.resId, allocated];
      }));
    };

    const pointsDiscountByRestaurant = allocateAcrossGroups(pointsDiscount);
    const flexDiscountByRestaurant = allocateAcrossGroups(flexDiscount);

    try {
      // For online payments (not cash), redirect to Stripe
      if (paymentMethod !== "cash") {
        const { data: checkoutData, error: checkoutError } = await invokeSupabaseFunction<CheckoutResponse>("create-checkout", {
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
            return_url: `${window.location.origin}/commandes`,
            order_metadata: {
              order_reference: orderReference,
              restaurant_id: restaurantId,
              delivery_fee: deliveryFee,
              checkout_group_id: checkoutGroupId,
              delivery_address: orderMode === "delivery" ? address : "",
              delivery_city: deliveryCity || null,
              delivery_lat: deliverySelection?.latitude ?? null,
              delivery_lng: deliverySelection?.longitude ?? null,
              formula_discount: formulaDiscount,
              points_discount: pointsDiscount,
              points_discount_amount: pointsDiscount,
              flex_discount: flexDiscount,
              flex_discount_amount: flexDiscount,
              flex_option: flexOption,
            },
          },
        });

        if (checkoutError) throw new Error(checkoutError.message);
        if (checkoutData?.error) throw new Error(checkoutData.error);
        if (!checkoutData?.url || !checkoutData?.session_id) {
          throw new Error("La session de paiement n'a pas pu etre initialisee.");
        }

        // Before redirecting, create orders in pending_payment status
        for (const [index, group] of orderGroups.entries()) {
          const { resId, realItems, qualityFeeItem, resSubtotal } = group;
          const resDiscount = restaurantId === resId ? formulaDiscount : 0;
          const resPromoDiscount = restaurantId === resId ? promoDiscount : 0;
          const qualityFeeAmount = qualityFeeItem?.price || 0;
          const deliveryFeePerRestaurant = deliveryFee / resCount;
          const resPointsDiscount = pointsDiscountByRestaurant.get(resId) || 0;
          const resFlexDiscount = flexDiscountByRestaurant.get(resId) || 0;
          const orderCheckoutId = crypto.randomUUID();
          const orderRefForRestaurant = resCount > 1 ? `${orderReference}-${index + 1}` : orderReference;

          const finalMetadata = buildOrderMetadata(
            resId,
            resSubtotal,
            resDiscount,
            resPromoDiscount,
            qualityFeeAmount,
            deliveryFeePerRestaurant,
            resCount,
            orderRefForRestaurant,
            checkoutGroupId,
            resPointsDiscount,
            resFlexDiscount,
          );

          const orderItemsJson = realItems.map((item) => ({
            menu_item_id: item.menuItemId, restaurant_id: item.restaurantId,
            quantity: Math.floor(item.quantity), unit_price: Number(item.price),
            total_price: Number(item.price) * Math.floor(item.quantity), metadata: item.metadata || {},
          }));

          const { data: validateResult, error: validateError } = await invokeSupabaseFunction<ValidateOrderResponse>("validate-order", {
            body: {
              restaurant_id: resId,
              delivery_address: orderMode === "delivery" ? address : "",
              delivery_fee: deliveryFeePerRestaurant,
              total_amount: resSubtotal - resDiscount - resPromoDiscount - resPointsDiscount - resFlexDiscount + deliveryFeePerRestaurant + qualityFeeAmount,
              notes: notes || null,
              items: orderItemsJson,
              metadata: { ...finalMetadata, stripe_session_id: checkoutData.session_id },
              checkout_id: orderCheckoutId
            },
          });

          if (validateError) throw new Error(validateError.message);
          if (validateResult?.error) throw new Error(validateResult.error);
          if (!firstOrderId) firstOrderId = validateResult?.order_id;

          if (validateResult?.order_id) {
            await trackCheckoutEvent(validateResult.order_id, "checkout_online_pending", { stripe_session_id: checkoutData.session_id });
          }
          await trackSponsoredConversion(resId, {
            conversionType: "order",
            entityId: validateResult?.order_id || null,
            paymentMethod,
          });
        }

        // Handle loyalty points
        if (useLoyaltyPoints && pointsToRedeem > 0) {
          const { error: rpcError } = await (supabase.rpc as any)("redeem_loyalty_points", { user_id_param: user.id, points_to_redeem: pointsToRedeem, description_param: `Paiement pour commande du ${new Date().toLocaleDateString()}` });
          if (rpcError) throw rpcError;
        }

        clearCart();
        queryClient.invalidateQueries({ queryKey: ["profile-loyalty"] });

        // Redirect to Stripe — save order ID for post-payment redirect
        if (firstOrderId) {
          localStorage.setItem("stripe_pending_order_id", firstOrderId);
        }
        window.location.href = checkoutData.url;
        return;
      }

      // Cash payment flow — create orders directly as confirmed
        for (const [index, group] of orderGroups.entries()) {
          const { resId, realItems, qualityFeeItem, resSubtotal } = group;
          const resDiscount = restaurantId === resId ? formulaDiscount : 0;
          const resPromoDiscount = restaurantId === resId ? promoDiscount : 0;
          const qualityFeeAmount = qualityFeeItem?.price || 0;
          const deliveryFeePerRestaurant = deliveryFee / resCount;
          const resPointsDiscount = pointsDiscountByRestaurant.get(resId) || 0;
          const resFlexDiscount = flexDiscountByRestaurant.get(resId) || 0;
          const orderCheckoutId = crypto.randomUUID();
          const orderRefForRestaurant = resCount > 1 ? `${orderReference}-${index + 1}` : orderReference;

          const finalMetadata = buildOrderMetadata(
            resId,
            resSubtotal,
            resDiscount,
            resPromoDiscount,
            qualityFeeAmount,
            deliveryFeePerRestaurant,
            resCount,
            orderRefForRestaurant,
            checkoutGroupId,
            resPointsDiscount,
            resFlexDiscount,
          );

          const orderItemsJson = realItems.map((item) => ({
            menu_item_id: item.menuItemId, restaurant_id: item.restaurantId,
            quantity: Math.floor(item.quantity), unit_price: Number(item.price),
          total_price: Number(item.price) * Math.floor(item.quantity), metadata: item.metadata || {},
        }));

        const { data: validateResult, error: validateError } = await invokeSupabaseFunction<ValidateOrderResponse>("validate-order", {
          body: {
              restaurant_id: resId,
              delivery_address: orderMode === "delivery" ? address : "",
              delivery_fee: deliveryFeePerRestaurant,
              total_amount: resSubtotal - resDiscount - resPromoDiscount - resPointsDiscount - resFlexDiscount + deliveryFeePerRestaurant + qualityFeeAmount,
              notes: notes || null,
              items: orderItemsJson,
              metadata: finalMetadata,
              checkout_id: orderCheckoutId
            },
          });

        if (validateError) throw new Error(validateError.message);
        if (validateResult?.error) throw new Error(validateResult.error);
        const orderId = validateResult?.order_id;
        if (!firstOrderId) firstOrderId = orderId;

        if (orderId) {
          await trackCheckoutEvent(orderId, "checkout_cash_confirmed", { total: resSubtotal - resDiscount + deliveryFeePerRestaurant + qualityFeeAmount });
        }

        if (cartMetadata.groupId) {
          await supabase.from("group_members" as any).update({ order_id: orderId }).eq("group_id", cartMetadata.groupId).eq("user_id", user.id);
        }
        await trackSponsoredConversion(resId, {
          conversionType: "order",
          entityId: orderId || null,
          paymentMethod,
        });
      }

      if (useLoyaltyPoints && pointsToRedeem > 0) {
        const { error: rpcError } = await (supabase.rpc as any)("redeem_loyalty_points", { user_id_param: user.id, points_to_redeem: pointsToRedeem, description_param: `Paiement pour commande du ${new Date().toLocaleDateString()}` });
        if (rpcError) throw rpcError;
      }

      await new Promise(resolve => setTimeout(resolve, 1500));
      clearCart();
      queryClient.invalidateQueries({ queryKey: ["profile-loyalty"] });
      queryClient.invalidateQueries({ queryKey: ["loyalty-transactions"] });
      if (donateEarnedXp) {
        queryClient.invalidateQueries({ queryKey: ["donated-meals-total"] });
        queryClient.invalidateQueries({ queryKey: ["donated-points-total"] });
      }

      toast({ title: "Commandes confirmées !", description: resCount > 1 ? `Vos ${resCount} commandes ont été synchronisées. Réf: ${orderReference}` : `Votre commande est en cours de préparation. Réf: ${orderReference}` });
      navigate(firstOrderId ? `/commande/${firstOrderId}` : "/commandes");
    } catch (error: any) {
      console.error("Panier checkout failed:", error);
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
    qualityFeeAmount: number,
    deliveryFeePerRestaurant: number,
    resCount: number,
    orderReference: string,
    checkoutGroupId: string,
    pointsDiscountAmount: number,
    flexDiscountAmount: number,
  ) => {
    const resFormulaDiscountPercent = resSubtotal > 0 && resDiscount > 0 ? (resDiscount / resSubtotal) * 100 : 0;
    return {
      ...cartMetadata,
      order_reference: orderReference,
      checkout_group_id: checkoutGroupId,
      type: orderMode === "takeaway" ? "pickup" : "delivery",
      feature: hasAntiGaspi ? "anti-gaspi" : hasFlashSale ? "vente-flash" : cartMetadata?.feature,
      has_anti_gaspi: hasAntiGaspi, has_flash_sale: hasFlashSale,
      quality_guarantee: !!qualityFeeAmount, quality_fee_amount: qualityFeeAmount,
      formula_applied: resDiscount > 0 ? formulaName : null,
      formula_discount_amount: resDiscount > 0 ? Number(resDiscount.toFixed(2)) : 0,
      formula_discount_percent: resFormulaDiscountPercent > 0 ? Number(resFormulaDiscountPercent.toFixed(2)) : 0,
      promotion_applied: resPromoDiscount > 0 ? promoName : null,
      promotion_discount_amount: resPromoDiscount > 0 ? Number(resPromoDiscount.toFixed(2)) : 0,
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
      pickup_date: orderMode === "takeaway" ? (fixedPickupDate || pickupDate) : null,
      pickup_time: orderMode === "takeaway" ? (fixedPickupStart || selectedPickupSlot?.time || pickupTime) : null,
      pickup_time_end: orderMode === "takeaway" ? (fixedPickupEnd || null) : null,
      pickup_service: orderMode === "takeaway" ? (selectedPickupSlot?.service || null) : null,
      scheduled_pickup_label: orderMode === "takeaway" && !hasOfferManagedPickup ? scheduledPickupLabel : null,
      flex_option: flexOption,
      flex_guarantee: flexOption === "express" ? "1% discount per minute delay" : flexOption === "standard" ? "1% discount per 2 minute delay" : "10% subtotal discount applied",
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

  return (
    <main className="min-h-screen bg-background">
      <div className="container py-8 max-w-2xl space-y-6">
        <h1 className="font-display text-3xl font-bold">Votre panier</h1>
        <p className="text-sm text-muted-foreground">Restaurant : {items[0]?.restaurantName}</p>

        <CartItemList items={items} updateQuantity={updateQuantity} removeItem={removeItem} />

        <FormulaDetector items={items} restaurantId={restaurantId} onDiscountCalculated={handleDiscountCalculated} />
        <PromotionDetector restaurantId={restaurantId} subtotal={total} onDiscountCalculated={handlePromoCalculated} />

        <div className="space-y-4 pt-4 border-t">
          {orderMode === "delivery" ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Adresse de livraison</Label>
                <AddressAutocomplete
                  value={address}
                  onAddressSelect={(addr, city, selection) => {
                    setAddress(selection?.fullAddress || addr);
                    setDeliveryCity(city || "");
                    setDeliverySelection(selection || null);
                  }}
                  placeholder="12 rue de la Paix, 75002 Paris"
                />
              </div>

              <div className="space-y-3 rounded-2xl border bg-card/60 p-4">
                <div className="space-y-1">
                  <Label>Heure de livraison</Label>
                  <p className="text-xs text-muted-foreground">
                    Les creneaux respectent les services midi et soir du restaurant.
                  </p>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setDeliveryScheduleMode("asap")}
                    className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                      deliveryScheduleMode === "asap"
                        ? "border-primary bg-primary/5 text-foreground"
                        : "border-border bg-background hover:bg-muted/40"
                    }`}
                  >
                    <p className="font-semibold">Des que possible</p>
                    <p className="text-xs text-muted-foreground">Lancement immediat apres validation.</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDeliveryScheduleMode("scheduled")}
                    disabled={!canScheduleDelivery}
                    className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                      deliveryScheduleMode === "scheduled"
                        ? "border-primary bg-primary/5 text-foreground"
                        : "border-border bg-background hover:bg-muted/40"
                    } ${!canScheduleDelivery ? "cursor-not-allowed opacity-60" : ""}`}
                  >
                    <p className="font-semibold">Programmer une heure</p>
                    <p className="text-xs text-muted-foreground">
                      {canScheduleDelivery
                        ? "Choisissez une heure d'arrivee par service."
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
                                  className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                                    selectedDeliverySlot?.time === slot.time && selectedDeliverySlot?.service === slot.service
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
                        Aucun creneau disponible a cette date. Essayez un autre jour de service.
                      </div>
                    )}

                    {scheduledDeliveryLabel ? (
                      <div className="rounded-xl bg-primary/5 p-3 text-sm">
                        <span className="font-semibold">Livraison planifiee :</span> {scheduledDeliveryLabel}
                      </div>
                    ) : null}
                  </div>
                ) : null}
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
              ) : hasFlashSale ? (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-2">
                  <div className="flex items-center gap-2 text-amber-600 font-bold"><Zap className="h-4 w-4" /><span>Retrait Vente Flash</span></div>
                  <div className="text-sm space-y-1">
                    <p className="flex items-center gap-2"><Clock className="h-3.5 w-3.5 text-muted-foreground" /><span>Le <strong>{flashPickupDate ? new Date(flashPickupDate).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : "date definie par l'offre"}</strong></span></p>
                    <p className="flex items-center gap-2 pl-5"><span className="text-muted-foreground">Creneau fixe :</span><strong>{flashPickupStart || "--:--"} - {flashPickupEnd || "--:--"}</strong></p>
                    <p className="text-xs text-muted-foreground pl-5">Le creneau de retrait est impose par la vente flash et ne peut pas etre modifie.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 rounded-2xl border bg-card/60 p-4">
                  <div className="space-y-1">
                    <Label>Retrait de la commande</Label>
                    <p className="text-xs text-muted-foreground">
                      {uniqueRestaurantIds.length > 1
                        ? "Affichage des creneaux communs a tous les restaurants du panier."
                        : "Les creneaux suivent les services actifs definis par le restaurateur."}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Date souhaitee</Label>
                    <Input
                      type="date"
                      value={pickupDate}
                      onChange={(e) => setPickupDate(e.target.value)}
                      required
                      min={getTodayDateValue()}
                      max={getMaxScheduledDateValue()}
                      className="w-full sm:w-56"
                    />
                  </div>

                  {pickupRestaurantsLoading ? (
                    <div className="rounded-xl bg-muted/40 p-3 text-sm text-muted-foreground">
                      Recherche des creneaux de retrait disponibles...
                    </div>
                  ) : pickupSlotGroups.length > 0 ? (
                    <div className="space-y-3">
                      {pickupSlotGroups.map((group) => (
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
                                className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                                  selectedPickupSlot?.time === slot.time && selectedPickupSlot?.service === slot.service
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
                      Aucun creneau de retrait disponible a cette date. Essayez un autre jour de service.
                    </div>
                  )}

                  {scheduledPickupLabel ? (
                    <div className="rounded-xl bg-primary/5 p-3 text-sm">
                      <span className="font-semibold">Retrait prevu :</span> {scheduledPickupLabel}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          )}
          <div className="space-y-2">
            <Label>Notes (optionnel)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Code d'entrée, étage..." />
          </div>
        </div>

        <div className="border-t pt-4 space-y-2">
          <LoyaltySection loyaltyPoints={loyaltyPoints} maxPointsDiscount={maxPointsDiscount} useLoyaltyPoints={useLoyaltyPoints} setUseLoyaltyPoints={setUseLoyaltyPoints} pointsToRedeemInput={pointsToRedeemInput} setPointsToRedeemInput={setPointsToRedeemInput} maxPointsRedeemable={maxPointsRedeemable} earnedXp={earnedXp} donateEarnedXp={donateEarnedXp} setDonateEarnedXp={setDonateEarnedXp} />

          <div className="flex justify-between text-sm"><span>Sous-total</span><span>{total.toFixed(2)} CHF</span></div>
          {formulaDiscount > 0 && <div className="flex justify-between text-sm text-accent font-medium"><span>Réduction formule ({formulaName})</span><span>-{formulaDiscount.toFixed(2)} CHF</span></div>}
          {promoDiscount > 0 && <div className="flex justify-between text-sm text-primary font-medium"><span>Promotion ({promoName})</span><span>-{promoDiscount.toFixed(2)} CHF</span></div>}
          <div className="flex justify-between text-sm"><span>{`Frais de livraison (${orderMode === "takeaway" ? "À l'emporter" : "Livraison"})`}</span><span>{deliveryFee.toFixed(2)} CHF</span></div>
          {orderMode === "delivery" && scheduledDeliveryLabel ? (
            <div className="flex justify-between text-sm text-muted-foreground"><span>Livraison planifiee</span><span>{scheduledDeliveryLabel}</span></div>
          ) : null}
          {orderMode === "takeaway" && !hasOfferManagedPickup && scheduledPickupLabel ? (
            <div className="flex justify-between text-sm text-muted-foreground"><span>Retrait prevu</span><span>{scheduledPickupLabel}</span></div>
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

        {orderMode === "delivery" && <FlexOptions flexOption={flexOption} setFlexOption={setFlexOption} />}
        <PaymentMethodSelector paymentMethod={paymentMethod} setPaymentMethod={setPaymentMethod} allowedMethods={allowedPaymentMethods} />

        <Button className="w-full" size="lg" onClick={handleCheckout} disabled={loading || (canSchedulePickup && (pickupRestaurantsLoading || !selectedPickupSlot))}>
          {loading ? (
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Traitement sécurisé...
            </div>
          ) : `Commander · ${finalTotal.toFixed(2)} CHF`}
        </Button>
      </div>
    </main>
  );
}
