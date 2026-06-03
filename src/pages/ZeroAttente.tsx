import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSupabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Timer, Utensils, Clock, CheckCircle2, ChevronLeft,
  Armchair, ChefHat, Zap, ArrowRight, Plus, Minus, Users, CreditCard, Sparkles, Percent, Crown,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FeatureWizard, WizardBackButton, WizardNextButton } from "@/components/FeatureWizard";
import ReservationDetailModal, { type ReservationDetail } from "@/components/ReservationDetailModal";
import PaymentMethodSelector from "@/components/cart/PaymentMethodSelector";
import LoyaltySection from "@/components/cart/LoyaltySection";
import { useActiveFeatures } from "@/lib/featureFlags";
import { buildCheckoutReturnUrl } from "@/lib/checkoutReturnUrl";
import { useMealFormulaDetection } from "@/hooks/useMealFormulaDetection";
import { formatMissingCoursesText, roundCurrency } from "@/lib/meal-formulas";
import { trackSponsoredConversion } from "@/lib/analytics";
import {
  resolveTokOneDiscountPercentageForContext,
  useIsTokOneMember,
  useTokOneBenefits,
} from "@/hooks/useTokOne";
import {
  getAllowedPaymentMethods,
  getFirstAvailablePaymentMethod,
  type PaymentMethodId,
} from "@/lib/paymentMethods";

const supabase = getSupabase();

type Step = "info" | "restaurant" | "menu" | "payment" | "confirm";
type PricingSummary = {
  count: number;
  subtotal: number;
  formulaDiscount: number;
  formulaDiscountPercent: number;
  formulaName: string | null;
  tokOneDiscount: number;
  tokOneDiscountPercent: number;
  pointsToRedeem: number;
  pointsDiscount: number;
  total: number;
};

const ZERO_ATTENTE_PENDING_SESSION_KEY = "tok-zero-attente-checkout-session-id";

function readPendingZeroAttenteSessionId() {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(ZERO_ATTENTE_PENDING_SESSION_KEY);
}

function writePendingZeroAttenteSessionId(sessionId: string | null) {
  if (typeof window === "undefined") return;
  if (sessionId) {
    sessionStorage.setItem(ZERO_ATTENTE_PENDING_SESSION_KEY, sessionId);
    return;
  }
  sessionStorage.removeItem(ZERO_ATTENTE_PENDING_SESSION_KEY);
}

async function getFreshAccessToken(forceRefresh = false) {
  const { data: sessionData } = await supabase.auth.getSession();
  let activeSession = sessionData.session;

  const expiresSoon = Boolean(
    activeSession?.expires_at && (activeSession.expires_at * 1000) <= (Date.now() + 60_000),
  );

  if (forceRefresh || !activeSession || expiresSoon) {
    const { data: refreshedData, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) {
      throw new Error("Session expirée. Reconnectez-vous pour finaliser votre réservation.");
    }
    activeSession = refreshedData.session;
  }

  if (!activeSession?.access_token) {
    throw new Error("Session expirée. Reconnectez-vous pour finaliser votre réservation.");
  }

  return activeSession.access_token;
}

function getFunctionsErrorStatus(error: unknown) {
  if (!error || typeof error !== "object" || !("status" in error)) return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

export default function ZeroAttente() {
  const { user, session, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const activeFeatures = useActiveFeatures();
  const [searchParams] = useSearchParams();
  const preSelectedRestaurantId = searchParams.get("restaurant");
  const [step, setStep] = useState<Step>("info");
  const [arrivalDate, setArrivalDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [arrivalTime, setArrivalTime] = useState("19:30");
  const [partySize, setPartySize] = useState(2);
  const [selectedRestaurant, setSelectedRestaurant] = useState<any>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [reservationId, setReservationId] = useState<string | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodId>("card");
  const [useLoyaltyPoints, setUseLoyaltyPoints] = useState(false);
  const [pointsToRedeemInput, setPointsToRedeemInput] = useState(0);
  const [donateEarnedXp, setDonateEarnedXp] = useState(false);
  const [confirmedPricing, setConfirmedPricing] = useState<PricingSummary | null>(null);
  const [confirmedReservationDetail, setConfirmedReservationDetail] = useState<ReservationDetail | null>(null);
  const [pendingCheckoutSessionId, setPendingCheckoutSessionId] = useState<string | null>(() => readPendingZeroAttenteSessionId());
  const attemptedProcessingKeyRef = useRef<string | null>(null);
  const authPromptKeyRef = useRef<string | null>(null);
  const { isMember: isTokOneMember, subscription: tokOneSubscription } = useIsTokOneMember();
  const { data: tokOneBenefits } = useTokOneBenefits(tokOneSubscription?.plan_id);
  const { data: profile } = useQuery({
    queryKey: ["profile-loyalty", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles" as any).select("loyalty_points").eq("user_id", user?.id).single();
      return data as any;
    },
    enabled: !!user,
  });
  const allowedPaymentMethods = useMemo(() => {
    const disabled = (selectedRestaurant as Record<string, unknown>)?.disabled_payment_methods as string[] || [];
    return getAllowedPaymentMethods(activeFeatures, disabled).filter((method) => method !== "cash");
  }, [activeFeatures, selectedRestaurant]);

  const syncPendingCheckoutSessionId = useCallback((sessionId: string | null) => {
    writePendingZeroAttenteSessionId(sessionId);
    setPendingCheckoutSessionId(sessionId);

    if (!sessionId) {
      attemptedProcessingKeyRef.current = null;
      authPromptKeyRef.current = null;
    }
  }, []);

  const { data: restaurants } = useQuery({
    queryKey: ["restaurants-zero-wait", preSelectedRestaurantId],
    queryFn: async () => {
      const filterEligible = (rows: any[] | null | undefined) =>
        (rows || []).filter((restaurant) => restaurant.supports_reservation && restaurant.supports_dinein);

      if (preSelectedRestaurantId) {
        const { data: specific } = await supabase.from("restaurants").select("*").eq("id", preSelectedRestaurantId).single();
        const { data: others } = await supabase.from("restaurants").select("*").eq("is_active", true).neq("id", preSelectedRestaurantId).order("rating", { ascending: false }).limit(8);
        const eligibleOthers = filterEligible(others);
        return (specific && specific.supports_reservation && specific.supports_dinein)
          ? [specific, ...eligibleOthers]
          : eligibleOthers;
      }
      const { data } = await supabase.from("restaurants").select("*").eq("is_active", true).order("rating", { ascending: false }).limit(9);
      return filterEligible(data);
    },
  });

  useEffect(() => {
    if (preSelectedRestaurantId && restaurants && !selectedRestaurant) {
      const found = restaurants.find((r: any) => r.id === preSelectedRestaurantId);
      if (found) setSelectedRestaurant(found);
    }
  }, [preSelectedRestaurantId, restaurants, selectedRestaurant]);

  useEffect(() => {
    if (!allowedPaymentMethods.includes(paymentMethod)) {
      const nextMethod = getFirstAvailablePaymentMethod(
        activeFeatures,
        (selectedRestaurant as Record<string, unknown>)?.disabled_payment_methods as string[] || [],
        "card",
      );
      if (nextMethod && nextMethod !== "cash") {
        setPaymentMethod(nextMethod);
      }
    }
  }, [activeFeatures, allowedPaymentMethods, paymentMethod, selectedRestaurant]);

  const { data: menuItems } = useQuery({
    queryKey: ["menu-zero-wait", selectedRestaurant?.id],
    queryFn: async () => {
      const { data } = await supabase.from("menu_items").select("*").eq("restaurant_id", selectedRestaurant.id).eq("is_available", true).order("category");
      return data || [];
    },
    enabled: !!selectedRestaurant,
  });

  const updateQty = (id: string, d: number) => setQuantities((p) => {
    const n = Math.max(0, (p[id] || 0) + d);
    if (n === 0) { const { [id]: _, ...r } = p; return r; }
    return { ...p, [id]: n };
  });

  const count = Object.values(quantities).reduce((a, b) => a + b, 0);
  const subtotal = menuItems ? Object.entries(quantities).reduce((s, [id, q]) => {
    const it = menuItems.find((m: any) => m.id === id);
    return s + (it ? Number(it.price) * q : 0);
  }, 0) : 0;

  const categories = menuItems ? [...new Set(menuItems.map((i: any) => i.category || "Autres"))] as string[] : [];
  const selectedFormulaItems = useMemo(
    () =>
      Object.entries(quantities)
        .filter(([, qty]) => qty > 0)
        .map(([id, qty]) => {
          const item = menuItems?.find((m: any) => m.id === id);
          return {
            category: item?.category || null,
            quantity: qty,
            unitPrice: Number(item?.price || 0),
          };
        }),
    [quantities, menuItems]
  );

  const {
    matchedFormula,
    suggestion,
    discountAmount: formulaDiscountRaw,
  } = useMealFormulaDetection({
    restaurantId: selectedRestaurant?.id || null,
    items: selectedFormulaItems,
    subtotal,
    reservationDate: arrivalDate,
    reservationTime: arrivalTime,
    context: "zero-attente",
    enabled: !!selectedRestaurant,
  });

  const formulaDiscount = roundCurrency(formulaDiscountRaw);
  const formulaName = matchedFormula?.name || null;
  const formulaDiscountPercent = matchedFormula?.discountPercent || 0;
  const tokOneDiscountPercent = useMemo(() => {
    if (!isTokOneMember) return 0;
    return resolveTokOneDiscountPercentageForContext(
      tokOneBenefits,
      { restaurantId: selectedRestaurant?.id || null, journey: "zero-attente" },
    );
  }, [isTokOneMember, selectedRestaurant?.id, tokOneBenefits]);
  const tokOneDiscount = useMemo(
    () => (isTokOneMember ? roundCurrency((subtotal * tokOneDiscountPercent) / 100) : 0),
    [isTokOneMember, subtotal, tokOneDiscountPercent],
  );
  const totalBeforeMiamz = useMemo(
    () => roundCurrency(Math.max(0, subtotal - formulaDiscount - tokOneDiscount)),
    [formulaDiscount, subtotal, tokOneDiscount],
  );
  const loyaltyPoints = Math.max(0, Number(profile?.loyalty_points || 0));
  const maxPointsDiscount = loyaltyPoints / 100;
  const maxPointsRedeemable = Math.min(loyaltyPoints, Math.floor(totalBeforeMiamz * 100));

  useEffect(() => {
    if (!useLoyaltyPoints && pointsToRedeemInput !== 0) {
      setPointsToRedeemInput(0);
      return;
    }
    if (useLoyaltyPoints && pointsToRedeemInput > maxPointsRedeemable) {
      setPointsToRedeemInput(maxPointsRedeemable);
    }
  }, [useLoyaltyPoints, pointsToRedeemInput, maxPointsRedeemable]);

  const pointsToRedeem = useLoyaltyPoints ? Math.min(pointsToRedeemInput, maxPointsRedeemable) : 0;
  const pointsDiscount = roundCurrency(pointsToRedeem / 100);
  const totalAfterDiscount = useMemo(
    () => roundCurrency(Math.max(0, totalBeforeMiamz - pointsDiscount)),
    [pointsDiscount, totalBeforeMiamz],
  );
  const currentPricing: PricingSummary = useMemo(
    () => ({
      count,
      subtotal: roundCurrency(subtotal),
      formulaDiscount,
      formulaDiscountPercent: roundCurrency(formulaDiscountPercent),
      formulaName,
      tokOneDiscount,
      tokOneDiscountPercent: roundCurrency(tokOneDiscountPercent),
      pointsToRedeem,
      pointsDiscount,
      total: totalAfterDiscount,
    }),
    [count, subtotal, formulaDiscount, formulaDiscountPercent, formulaName, tokOneDiscount, tokOneDiscountPercent, pointsToRedeem, pointsDiscount, totalAfterDiscount]
  );

  const handlePayAndReserve = async () => {
    if (!user) {
      toast({ title: "Connectez-vous", description: "Vous devez être connecté pour réserver.", variant: "destructive" });
      return;
    }
    if (!selectedRestaurant || !menuItems) return;
    if (!selectedRestaurant.supports_reservation || !selectedRestaurant.supports_dinein) {
      toast({
        title: "Restaurant indisponible",
        description: "Ce restaurant ne propose plus Zéro Attente actuellement.",
        variant: "destructive",
      });
      return;
    }
    if (allowedPaymentMethods.length === 0) {
      toast({
        title: "Paiement indisponible",
        description: "Aucun moyen de paiement sécurisé n'est actuellement disponible.",
        variant: "destructive",
      });
      return;
    }
    if (!allowedPaymentMethods.includes(paymentMethod)) {
      const nextMethod = getFirstAvailablePaymentMethod(
        activeFeatures,
        (selectedRestaurant as Record<string, unknown>)?.disabled_payment_methods as string[] || [],
        "card",
      );
      if (nextMethod && nextMethod !== "cash") {
        setPaymentMethod(nextMethod);
      }
      toast({
        title: "Moyen de paiement indisponible",
        description: "Sélectionnez un moyen de paiement sécurisé encore actif.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    const pricingForCheckout: PricingSummary = { ...currentPricing };

    const preorderItems = Object.entries(quantities)
      .filter(([, qty]) => qty > 0)
      .map(([id, qty]) => {
        const item = menuItems.find((m: any) => m.id === id);
        return {
          menu_item_id: id,
          name: item?.name || "",
          quantity: qty,
          unit_price: Number(item?.price || 0),
          total_price: Number(item?.price || 0) * qty,
        };
      });

    // For online payment methods, redirect to Stripe first
    if (paymentMethod !== "cash") {
      const stripeItems = preorderItems.map((pi) => ({
        name: pi.name,
        price: pi.unit_price,
        quantity: pi.quantity,
        restaurant_name: selectedRestaurant.name,
        restaurant_id: selectedRestaurant.id,
        menu_item_id: pi.menu_item_id,
        metadata: {},
      }));

      const { data: checkoutData, error: checkoutError } = await supabase.functions.invoke("create-checkout", {
        body: {
          checkout_kind: "zero-attente",
          items: stripeItems,
          payment_method: paymentMethod,
          return_url: buildCheckoutReturnUrl("/zero-attente"),
          order_metadata: {
            checkout_kind: "zero-attente",
            restaurant_id: selectedRestaurant.id,
            order_reference: `ZA-${Date.now()}`,
            delivery_fee: 0,
            arrival_date: arrivalDate,
            arrival_time: arrivalTime,
            party_size: partySize,
            formula_applied: pricingForCheckout.formulaName,
            formula_discount: pricingForCheckout.formulaDiscount,
            formula_discount_amount: pricingForCheckout.formulaDiscount,
            formula_discount_percent: pricingForCheckout.formulaDiscountPercent,
            tok_one_member: isTokOneMember,
            tok_one_discount_amount: pricingForCheckout.tokOneDiscount,
            tok_one_discount_percent: pricingForCheckout.tokOneDiscountPercent,
            points_to_redeem: pricingForCheckout.pointsToRedeem,
            points_discount: pricingForCheckout.pointsDiscount,
            points_discount_amount: pricingForCheckout.pointsDiscount,
            pre_discount_subtotal: pricingForCheckout.subtotal,
            authoritative_total: pricingForCheckout.total,
            discount_amount: pricingForCheckout.formulaDiscount + pricingForCheckout.tokOneDiscount + pricingForCheckout.pointsDiscount,
          },
        },
      });

      if (checkoutError || !checkoutData?.url) {
        setLoading(false);
        toast({ title: "Erreur paiement", description: checkoutError?.message || "Impossible de créer la session de paiement.", variant: "destructive" });
        return;
      }
      // Redirect to Stripe
      window.location.href = checkoutData.url;
      return;
    }

    setLoading(false);
    toast({
      title: "Paiement requis",
      description: "Zéro Attente n'accepté que les paiements sécurisés à l'avance.",
      variant: "destructive",
    });
  };

  const completePaidReservation = useCallback(async (checkoutSessionId: string) => {
    setLoading(true);

    try {
      if (!user?.id) {
        throw new Error("Reconnectez-vous pour récupérer votre réservation Zéro Attente.");
      }

      const fetchReservation = async () => {
        const { data, error } = await supabase
          .from("reservations")
          .select("*, restaurants(name)")
          .eq("user_id", user.id)
          .eq("feature", "zero-attente")
          .filter("metadata->>checkout_session_id", "eq", checkoutSessionId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          throw new Error(error.message || "Impossible de récupérer la réservation Zéro Attente.");
        }
        return data;
      };

      let reservationRecord: any = await fetchReservation();

      if (!reservationRecord) {
        await getFreshAccessToken();
        const { error: finalizeError } = await supabase.functions.invoke("create-zero-attente-reservation", {
          body: { session_id: checkoutSessionId },
        });

        if (finalizeError) {
          const status = getFunctionsErrorStatus(finalizeError);
          if (status === 401 || status === 403) {
            throw new Error("Reconnectez-vous pour finaliser la réservation Zéro Attente.");
          }
          throw new Error(finalizeError.message || "Impossible de finaliser la réservation Zéro Attente.");
        }
      }

      const maxAttempts = reservationRecord ? 12 : 6;

      for (let attempt = 0; attempt < maxAttempts && !reservationRecord; attempt += 1) {
        reservationRecord = await fetchReservation();
        if (reservationRecord) break;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      if (!reservationRecord) {
        throw new Error("Paiement valide, réservation en cours de finalisation. Rechargez la page dans quelques secondes.");
      }

      const metadata = reservationRecord.metadata && typeof reservationRecord.metadata === "object" && !Array.isArray(reservationRecord.metadata)
        ? reservationRecord.metadata as Record<string, any>
        : {};
      const preorderItems = Array.isArray(reservationRecord.preorder_items) ? reservationRecord.preorder_items : [];
      const restaurantRelation = Array.isArray(reservationRecord.restaurants)
        ? reservationRecord.restaurants[0]
        : reservationRecord.restaurants;
      const restaurantName = typeof restaurantRelation?.name === "string" ? restaurantRelation.name : "";
      const reservationIdValue = String(reservationRecord.id || "");
      const restaurantIdValue = String(reservationRecord.restaurant_id || selectedRestaurant?.id || "");
      const restoredQuantities = preorderItems.reduce((acc: Record<string, number>, item: any) => {
        if (item?.menu_item_id) acc[item.menu_item_id] = Number(item.quantity || 0);
        return acc;
      }, {});

      setSelectedRestaurant((current) => current || {
        id: restaurantIdValue,
        name: restaurantName,
      });
      setArrivalDate(String(metadata.arrival_date || reservationRecord.date || arrivalDate));
      setArrivalTime(String(metadata.arrival_time || reservationRecord.time || arrivalTime));
      setPartySize(Number(reservationRecord.party_size || partySize));
      setPaymentMethod((metadata.payment_method as PaymentMethodId) || "card");
      setQuantities(restoredQuantities);
      setConfirmedReservationDetail({
        id: reservationIdValue,
        date: String(reservationRecord.date || metadata.arrival_date || arrivalDate),
        time: String(metadata.arrival_time || reservationRecord.time || arrivalTime),
        party_size: Number(reservationRecord.party_size || partySize),
        status: String(reservationRecord.status || "confirmed"),
        feature: "zero-attente",
        notes: typeof reservationRecord.notes === "string" ? reservationRecord.notes : null,
        total_amount: Number(reservationRecord.total_amount || metadata.total_amount || 0),
        created_at: String(reservationRecord.created_at || new Date().toISOString()),
        metadata: (reservationRecord.metadata || {}) as any,
        preorder_items: preorderItems as any,
        restaurant_name: restaurantName,
      });
      setConfirmedPricing({
        count: preorderItems.reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0),
        subtotal: roundCurrency(Number(metadata.pre_discount_subtotal || 0)),
        formulaDiscount: roundCurrency(Number(metadata.formula_discount_amount || 0)),
        formulaDiscountPercent: roundCurrency(Number(metadata.formula_discount_percent || 0)),
        formulaName: metadata.formula_applied || null,
        tokOneDiscount: roundCurrency(Number(metadata.tok_one_discount_amount || metadata.tok_one_total_saved || 0)),
        tokOneDiscountPercent: roundCurrency(Number(metadata.tok_one_discount_percent || 0)),
        pointsToRedeem: Math.max(0, Number(metadata.points_redeemed || metadata.points_to_redeem || 0)),
        pointsDiscount: roundCurrency(Number(metadata.points_discount_amount || metadata.points_discount || 0)),
        total: roundCurrency(Number(reservationRecord.total_amount || metadata.total_amount || 0)),
      });
      setReservationId(reservationIdValue);
      setStep("confirm");
      syncPendingCheckoutSessionId(null);

      if (restaurantIdValue) {
        try {
          await trackSponsoredConversion(restaurantIdValue, {
            conversionType: "zero-attente",
            entityId: reservationIdValue || null,
            paymentMethod: (metadata.payment_method as PaymentMethodId) || paymentMethod,
          });
        } catch (trackingError) {
          console.error("Zéro-attente conversion tracking failed:", trackingError);
        }
      }
    } catch (error) {
      attemptedProcessingKeyRef.current = null;
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Création de réservation impossible.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }

  }, [arrivalDate, arrivalTime, partySize, paymentMethod, selectedRestaurant?.id, syncPendingCheckoutSessionId, toast, user?.id]);

  // Handle return from Stripe
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    const sessionId = params.get("session_id");

    if (status === "success" && sessionId) {
      syncPendingCheckoutSessionId(sessionId);
      window.history.replaceState({}, "", window.location.pathname);
    } else if (status === "cancelled") {
      syncPendingCheckoutSessionId(null);
      toast({ title: "Paiement annulé", description: "Vous pouvez réessayer.", variant: "destructive" });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [syncPendingCheckoutSessionId, toast]);

  useEffect(() => {
    if (!pendingCheckoutSessionId || reservationId || authLoading) return;

    const processingKey = `${user?.id || "guest"}:${pendingCheckoutSessionId}`;

    if (!user || !session?.access_token) {
      if (authPromptKeyRef.current !== processingKey) {
        authPromptKeyRef.current = processingKey;
        toast({
          title: "Reconnectez-vous",
          description: "Le paiement a été validé. Reconnectez-vous pour finaliser la réservation Zéro Attente.",
          variant: "destructive",
        });
      }
      return;
    }

    if (attemptedProcessingKeyRef.current === processingKey) return;
    attemptedProcessingKeyRef.current = processingKey;
    void completePaidReservation(pendingCheckoutSessionId);
  }, [authLoading, completePaidReservation, pendingCheckoutSessionId, reservationId, session?.access_token, toast, user]);

  const handleGoToReservations = () => {
    setShowDetailModal(true);
  };

  const preorderItemsForModal = menuItems ? Object.entries(quantities)
    .filter(([, qty]) => qty > 0)
    .map(([id, qty]) => {
      const item = menuItems.find((m: any) => m.id === id);
      return {
        name: item?.name || "",
        quantity: qty,
        unit_price: Number(item?.price || 0),
        total_price: Number(item?.price || 0) * qty,
      };
    }) : [];

  const displayPricing = confirmedPricing || currentPricing;

  const detailForModal = confirmedReservationDetail || (reservationId ? {
    id: reservationId,
    date: arrivalDate,
    time: arrivalTime,
    party_size: partySize,
    status: "pending",
    feature: "zero-attente",
    notes: `[Zéro Attente] ${displayPricing.count} plat(s) précommandé(s) - Sous-total: ${displayPricing.subtotal.toFixed(2)} CHF - Réduction formule: ${displayPricing.formulaDiscount.toFixed(2)} CHF${displayPricing.tokOneDiscount > 0 ? ` - Réduction Tok One${displayPricing.tokOneDiscountPercent > 0 ? ` (${displayPricing.tokOneDiscountPercent.toFixed(0)}%)` : ""}: ${displayPricing.tokOneDiscount.toFixed(2)} CHF` : ""} - Total: ${displayPricing.total.toFixed(2)} CHF`,
    total_amount: displayPricing.total,
    created_at: new Date().toISOString(),
    metadata: {
      feature: "zero-attente",
      payment_method: paymentMethod,
      paid: true,
      pre_discount_subtotal: displayPricing.subtotal,
      formula_applied: displayPricing.formulaName,
      formula_discount_amount: displayPricing.formulaDiscount,
      formula_discount_percent: displayPricing.formulaDiscountPercent,
      tok_one_member: isTokOneMember,
      tok_one_discount_amount: displayPricing.tokOneDiscount,
      tok_one_discount_percent: displayPricing.tokOneDiscountPercent,
      points_to_redeem: displayPricing.pointsToRedeem,
      points_discount: displayPricing.pointsDiscount,
      points_discount_amount: displayPricing.pointsDiscount,
      total_amount: displayPricing.total,
    } as any,
    preorder_items: preorderItemsForModal as any,
    restaurant_name: selectedRestaurant?.name || "",
  } : null);

  return (
    <>
      <FeatureWizard
        title="Zéro attente"
        subtitle="Réservez, précommandez, payez et c'est servi"
        icon={Timer}
        colorClass="indigo-500"
        steps={([
          { id: "info", label: "Heure" },
          { id: "restaurant", label: "Restaurant" },
          { id: "menu", label: "Menu" },
          { id: "payment", label: "Paiement" },
          { id: "confirm", label: "Confirmer" },
        ] as const).filter(s => s.id !== "restaurant" || !preSelectedRestaurantId)}
        currentStepId={step}
        onStepChange={(id) => setStep(id as Step)}
      >
        <div className="space-y-8">
          {/* How it works */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {[
              { icon: Armchair, title: "Réservez", desc: "Choisissez votre heure", color: "indigo" },
              { icon: Utensils, title: "Précommandez", desc: "Sélectionnez vos plats", color: "indigo" },
              { icon: CreditCard, title: "Payez", desc: "Paiement sécurisé à l'avance", color: "indigo" },
              { icon: Zap, title: "0 attente", desc: "Arrivez, asseyez-vous, dégustez", color: "indigo" },
            ].map((item, i) => (
              <div key={i} className="rounded-xl border bg-card p-4 text-center space-y-2 relative">
                <item.icon className="h-6 w-6 text-indigo-500 mx-auto" />
                <h3 className="font-semibold text-sm">{item.title}</h3>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
                {i < 3 && <ArrowRight className="hidden md:block absolute -right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />}
              </div>
            ))}
          </div>

          {step === "info" && (
            <div className="rounded-xl border bg-card p-5 space-y-4 animate-in fade-in-50">
              <h2 className="font-semibold flex items-center gap-2">
                <Clock className="h-5 w-5 text-indigo-500" />
                Date, heure et convives
              </h2>
              <div className="grid gap-3 sm:grid-cols-[160px_120px_100px] items-center">
                <Input type="date" value={arrivalDate} onChange={(e) => setArrivalDate(e.target.value)} min={new Date().toISOString().split("T")[0]} />
                <Input type="time" value={arrivalTime} onChange={(e) => setArrivalTime(e.target.value)} className="w-32" />
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <Input type="number" min={1} max={20} value={partySize} onChange={(e) => setPartySize(Number(e.target.value))} className="w-20" />
                </div>
              </div>
              <p className="text-sm text-muted-foreground">Le chef démarrerà la préparation automatiquement selon votre ETA</p>
              <WizardNextButton
                onClick={() => {
                  if (preSelectedRestaurantId && selectedRestaurant) setStep("menu");
                  else setStep("restaurant");
                }}
                label={preSelectedRestaurantId && selectedRestaurant ? `Réserver chez ${selectedRestaurant.name}` : "Choisir un restaurant"}
                colorClass="indigo-500"
              />
            </div>
          )}

          {step === "restaurant" && (
            <div className="space-y-4 animate-in fade-in-50 slide-in-from-right-4">
              <WizardBackButton onClick={() => setStep("info")} label="Heure" />
              <div className="rounded-lg bg-indigo-500/5 p-3 flex items-center gap-2 text-sm">
                <Timer className="h-4 w-4 text-indigo-500" />
                <span>Arrivée le <strong>{arrivalDate}</strong> à <strong>{arrivalTime}</strong> · <strong>{partySize}</strong> convive(s)</span>
              </div>
              <h2 className="font-display text-xl font-semibold">Restaurants compatibles Zéro Attente</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {restaurants?.map((r: any) => (
                  <button
                    key={r.id}
                    onClick={() => { setSelectedRestaurant(r); setQuantities({}); setStep("menu"); }}
                    className="text-left rounded-xl border-2 overflow-hidden hover:border-indigo-500/30 border-border transition-all"
                  >
                    <img src={r.image_url || "/images/kebab-box-spread.jpeg"} alt={r.name} className="w-full h-32 object-cover" />
                    <div className="p-3">
                      <p className="font-bold text-sm">{r.name}</p>
                      <p className="text-xs text-muted-foreground">{r.cuisine_type} · {r.city}</p>
                      <Badge variant="outline" className="mt-1 text-[10px] gap-1"><Timer className="h-2.5 w-2.5" />Zéro attente</Badge>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === "menu" && (
            <div className="space-y-4 animate-in fade-in-50 slide-in-from-right-4">
              <WizardBackButton
                onClick={() => setStep(preSelectedRestaurantId && selectedRestaurant ? "info" : "restaurant")}
                label={preSelectedRestaurantId && selectedRestaurant ? "Heure" : "Restaurant"}
              />
              <div className="rounded-lg bg-indigo-500/5 p-3 text-sm flex items-center gap-2">
                <Timer className="h-4 w-4 text-indigo-500" />
                Arrivée {arrivalDate} {arrivalTime} · {partySize} convive(s) · {selectedRestaurant?.name}
              </div>
              {count > 0 && matchedFormula && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Formule détectée : {matchedFormula.name}</p>
                    <p className="text-xs text-emerald-700 dark:text-emerald-300/80">-{matchedFormula.discountPercent}% appliqué, soit -{formulaDiscount.toFixed(2)} CHF</p>
                  </div>
                  <Badge className="bg-emerald-600 text-white">
                    <Percent className="h-3 w-3 mr-1" />-{formulaDiscount.toFixed(2)} CHF
                  </Badge>
                </div>
              )}
              {count > 0 && !matchedFormula && suggestion && (
                <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-3 flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">Formule possible : {suggestion.name}</p>
                    <p className="text-xs text-indigo-700 dark:text-indigo-300/80">
                      Ajoutez {formatMissingCoursesText(suggestion.missingCourses)} pour obtenir -{suggestion.discountPercent}%.
                    </p>
                  </div>
                </div>
              )}
              {categories.map((cat) => (
                <div key={cat} className="space-y-2">
                  <h3 className="font-semibold text-xs text-muted-foreground uppercase tracking-wide">{cat}</h3>
                  {menuItems?.filter((i: any) => (i.category || "Autres") === cat).map((item: any) => {
                    const q = quantities[item.id] || 0;
                    return (
                      <div key={item.id} className="flex items-center gap-3 p-3 border rounded-xl bg-card">
                        {item.image_url && <img src={item.image_url} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm">{item.name}</p>
                          {item.description && <p className="text-xs text-muted-foreground line-clamp-1">{item.description}</p>}
                          <p className="text-sm font-bold text-primary">{Number(item.price).toFixed(2)} CHF</p>
                        </div>
                        <div className="flex items-center gap-1">
                          {q > 0 && <>
                            <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQty(item.id, -1)}>
                              <Minus className="h-3 w-3" />
                            </Button>
                            <span className="w-5 text-center text-sm font-semibold">{q}</span>
                          </>}
                          <Button size="icon" variant={q > 0 ? "outline" : "default"} className="h-7 w-7" onClick={() => updateQty(item.id, 1)}>
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}

              {count > 0 && (
                <div className="sticky bottom-4 rounded-xl border bg-card/90 backdrop-blur-xl p-4 shadow-lg space-y-2 mt-8 animate-in slide-in-from-bottom-4">
                  <div className="flex justify-between text-sm">
                    <span>{count} article{count > 1 ? "s" : ""} · {partySize} convive(s)</span>
                    <span className="font-bold">{subtotal.toFixed(2)} CHF</span>
                  </div>
                  {formulaDiscount > 0 && (
                    <div className="flex justify-between text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                      <span>Réduction formule{formulaName ? ` (${formulaName})` : ""}</span>
                      <span>-{formulaDiscount.toFixed(2)} CHF</span>
                    </div>
                  )}
                  {tokOneDiscount > 0 && (
                    <div className="flex justify-between text-sm text-violet-600 font-medium">
                      <span className="flex items-center gap-1.5">
                        <Crown className="h-3.5 w-3.5" />
                        Réduction Tok One{tokOneDiscountPercent > 0 ? ` (${tokOneDiscountPercent.toFixed(0)}%)` : ""}
                      </span>
                      <span>-{tokOneDiscount.toFixed(2)} CHF</span>
                    </div>
                  )}
                  {pointsDiscount > 0 && (
                    <div className="flex justify-between text-sm font-medium text-pink-500">
                      <span>Miamz ({pointsToRedeem} pts)</span>
                      <span>-{pointsDiscount.toFixed(2)} CHF</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-semibold border-t pt-2">
                    <span>Total</span>
                    <span>{totalAfterDiscount.toFixed(2)} CHF</span>
                  </div>
                  <Button onClick={() => setStep("payment")} className="w-full bg-indigo-500 hover:opacity-90 gap-2 mt-2">
                    <CreditCard className="h-4 w-4" />
                    Passer au paiement · {totalAfterDiscount.toFixed(2)} CHF
                  </Button>
                </div>
              )}
            </div>
          )}

          {step === "payment" && (
            <div className="space-y-4 animate-in fade-in-50 slide-in-from-right-4">
              <WizardBackButton onClick={() => setStep("menu")} label="Menu" />

              <div className="rounded-lg bg-indigo-500/5 p-3 text-sm flex items-center gap-2">
                <Timer className="h-4 w-4 text-indigo-500" />
                {selectedRestaurant?.name} · {arrivalDate} {arrivalTime} · {partySize} convive(s)
              </div>

              {/* Order summary */}
              <div className="rounded-xl border bg-card p-4 space-y-2">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <Utensils className="h-4 w-4 text-muted-foreground" />
                  Récapitulatif
                </h3>
                {menuItems && Object.entries(quantities).filter(([, q]) => q > 0).map(([id, qty]) => {
                  const item = menuItems.find((m: any) => m.id === id);
                  if (!item) return null;
                  return (
                    <div key={id} className="flex justify-between text-sm">
                      <span>{qty}× {item.name}</span>
                      <span className="font-medium">{(Number(item.price) * qty).toFixed(2)} CHF</span>
                    </div>
                  );
                })}
                <div className="flex justify-between text-sm pt-2 border-t mt-2">
                  <span className="text-muted-foreground">Sous-total</span>
                  <span className="font-medium">{subtotal.toFixed(2)} CHF</span>
                </div>
                {formulaDiscount > 0 && (
                  <div className="flex justify-between text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                    <span>Réduction formule{formulaName ? ` (${formulaName})` : ""}</span>
                    <span>-{formulaDiscount.toFixed(2)} CHF</span>
                  </div>
                )}
                {tokOneDiscount > 0 && (
                  <div className="flex justify-between text-sm text-violet-600 font-medium">
                    <span className="flex items-center gap-1.5">
                      <Crown className="h-3.5 w-3.5" />
                      Réduction Tok One{tokOneDiscountPercent > 0 ? ` (${tokOneDiscountPercent.toFixed(0)}%)` : ""}
                    </span>
                    <span>-{tokOneDiscount.toFixed(2)} CHF</span>
                  </div>
                )}
                {pointsDiscount > 0 && (
                  <div className="flex justify-between text-sm font-medium text-pink-500">
                    <span>Miamz ({pointsToRedeem} pts)</span>
                    <span>-{pointsDiscount.toFixed(2)} CHF</span>
                  </div>
                )}
                <div className="flex justify-between font-bold border-t pt-2 mt-2">
                  <span>Total à payer</span>
                  <span>{totalAfterDiscount.toFixed(2)} CHF</span>
                </div>
              </div>

              <LoyaltySection
                loyaltyPoints={loyaltyPoints}
                maxPointsDiscount={maxPointsDiscount}
                useLoyaltyPoints={useLoyaltyPoints}
                setUseLoyaltyPoints={setUseLoyaltyPoints}
                pointsToRedeemInput={pointsToRedeemInput}
                setPointsToRedeemInput={setPointsToRedeemInput}
                maxPointsRedeemable={maxPointsRedeemable}
                earnedXp={0}
                donateEarnedXp={donateEarnedXp}
                setDonateEarnedXp={setDonateEarnedXp}
              />

              {/* Payment method selector */}
              <PaymentMethodSelector
                paymentMethod={paymentMethod}
                setPaymentMethod={setPaymentMethod}
                allowedMethods={allowedPaymentMethods}
              />

              <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-sm text-amber-700 dark:text-amber-300">
                <strong>Paiement à l'avance requis</strong> — Le Zéro Attente nécessite un prépaiement pour garantir la synchronisation avec le chef.
              </div>

              <Button
                onClick={handlePayAndReserve}
                disabled={loading || allowedPaymentMethods.length === 0}
                className="w-full bg-indigo-500 hover:opacity-90 gap-2 text-base py-6"
              >
                {loading ? "Traitement en cours..." : `Payer ${totalAfterDiscount.toFixed(2)} CHF et réserver`}
              </Button>
            </div>
          )}

          {step === "confirm" && (
            <div className="space-y-6 animate-in slide-in-from-bottom-8">
              <div className="rounded-2xl bg-indigo-500/5 border border-indigo-500/20 p-6 text-center space-y-2">
                <CheckCircle2 className="h-12 w-12 text-indigo-500 mx-auto" />
                <h2 className="font-display text-xl font-bold">Réservation confirmée et payée !</h2>
                <p className="text-sm text-muted-foreground">Votre table et vos plats précommandés sont réservés. Le paiement a été effectué.</p>
              </div>
              <div className="rounded-xl bg-secondary/50 p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Restaurant</span>
                  <span className="font-medium">{selectedRestaurant?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Arrivée prévue</span>
                  <span className="font-medium">{arrivalDate} {arrivalTime}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Convives</span>
                  <span className="font-medium">{partySize}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Articles précommandés</span>
                  <span className="font-medium">{displayPricing.count} plat{displayPricing.count > 1 ? "s" : ""}</span>
                </div>
                {displayPricing.formulaDiscount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Réduction formule</span>
                    <span className="font-medium text-emerald-600 dark:text-emerald-400">-{displayPricing.formulaDiscount.toFixed(2)} CHF</span>
                  </div>
                )}
                {displayPricing.tokOneDiscount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <Crown className="h-3.5 w-3.5 text-violet-600" />
                      Tok One{displayPricing.tokOneDiscountPercent > 0 ? ` (${displayPricing.tokOneDiscountPercent.toFixed(0)}%)` : ""}
                    </span>
                    <span className="font-medium text-violet-600">-{displayPricing.tokOneDiscount.toFixed(2)} CHF</span>
                  </div>
                )}
                {displayPricing.pointsDiscount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Miamz utilisés</span>
                    <span className="font-medium text-pink-500">-{displayPricing.pointsDiscount.toFixed(2)} CHF</span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-2">
                  <span className="font-semibold">Total payé</span>
                  <span className="font-bold">{displayPricing.total.toFixed(2)} CHF</span>
                </div>
              </div>
              <div className="rounded-lg bg-indigo-500/5 p-3 flex items-center gap-2 text-sm text-indigo-600 dark:text-indigo-400">
                <ChefHat className="h-4 w-4" />
                <span>Le chef sera synchronisé avec votre arrivée</span>
              </div>
              <WizardNextButton
                onClick={handleGoToReservations}
                label="Voir mes réservations"
                colorClass="indigo-500"
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
          if (!open) navigate("/reservations");
        }}
      />
    </>
  );
}
