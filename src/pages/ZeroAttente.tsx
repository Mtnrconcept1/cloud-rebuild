import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Timer, Utensils, Clock, CheckCircle2, ChevronLeft,
  Armchair, ChefHat, Zap, ArrowRight, Plus, Minus, Users, CreditCard, Sparkles, Percent,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FeatureWizard, WizardBackButton, WizardNextButton } from "@/components/FeatureWizard";
import ReservationDetailModal from "@/components/ReservationDetailModal";
import PaymentMethodSelector, { type PaymentMethodId } from "@/components/cart/PaymentMethodSelector";
import { useMealFormulaDetection } from "@/hooks/useMealFormulaDetection";
import { formatMissingCoursesText, roundCurrency } from "@/lib/meal-formulas";
import { trackSponsoredConversion } from "@/lib/analytics";

type Step = "info" | "restaurant" | "menu" | "payment" | "confirm";
type PricingSummary = {
  count: number;
  subtotal: number;
  formulaDiscount: number;
  formulaDiscountPercent: number;
  formulaName: string | null;
  total: number;
};

const ZERO_ATTENTE_PENDING_SESSION_KEY = "zero-attente-pending-session-id";

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
      throw new Error("Session expiree. Reconnectez-vous pour finaliser votre reservation.");
    }
    activeSession = refreshedData.session;
  }

  if (!activeSession?.access_token) {
    throw new Error("Session expiree. Reconnectez-vous pour finaliser votre reservation.");
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
  const [confirmedPricing, setConfirmedPricing] = useState<PricingSummary | null>(null);
  const [pendingCheckoutSessionId, setPendingCheckoutSessionId] = useState<string | null>(() => readPendingZeroAttenteSessionId());
  const attemptedProcessingKeyRef = useRef<string | null>(null);
  const authPromptKeyRef = useRef<string | null>(null);

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
      if (preSelectedRestaurantId) {
        const { data: specific } = await supabase.from("restaurants").select("*").eq("id", preSelectedRestaurantId).single();
        const { data: others } = await supabase.from("restaurants").select("*").eq("is_active", true).neq("id", preSelectedRestaurantId).order("rating", { ascending: false }).limit(8);
        return specific ? [specific, ...(others || [])] : (others || []);
      }
      const { data } = await supabase.from("restaurants").select("*").eq("is_active", true).order("rating", { ascending: false }).limit(9);
      return data || [];
    },
  });

  useEffect(() => {
    if (preSelectedRestaurantId && restaurants && !selectedRestaurant) {
      const found = restaurants.find((r: any) => r.id === preSelectedRestaurantId);
      if (found) setSelectedRestaurant(found);
    }
  }, [preSelectedRestaurantId, restaurants, selectedRestaurant]);

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
    finalTotal: totalAfterDiscountRaw,
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
  const totalAfterDiscount = roundCurrency(totalAfterDiscountRaw);
  const currentPricing: PricingSummary = useMemo(
    () => ({
      count,
      subtotal: roundCurrency(subtotal),
      formulaDiscount,
      formulaDiscountPercent: roundCurrency(formulaDiscountPercent),
      formulaName,
      total: totalAfterDiscount,
    }),
    [count, subtotal, formulaDiscount, formulaDiscountPercent, formulaName, totalAfterDiscount]
  );

  const handlePayAndReserve = async () => {
    if (!user) {
      toast({ title: "Connectez-vous", description: "Vous devez être connecté pour réserver.", variant: "destructive" });
      return;
    }
    if (!selectedRestaurant || !menuItems) return;

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
          return_url: `${window.location.origin}/zero-attente`,
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
            pre_discount_subtotal: pricingForCheckout.subtotal,
            authoritative_total: pricingForCheckout.total,
            discount_amount: pricingForCheckout.formulaDiscount,
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
      description: "Zero Attente n'accepte que les paiements securises a l'avance.",
      variant: "destructive",
    });
  };

  const completePaidReservation = useCallback(async (checkoutSessionId: string) => {
    setLoading(true);

    try {
      if (!user?.id) {
        throw new Error("Reconnectez-vous pour recuperer votre reservation Zero Attente.");
      }

      let reservationRecord: any = null;
      const maxAttempts = 12;

      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
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
          throw new Error(error.message || "Impossible de recuperer la reservation Zero Attente.");
        }

        if (data) {
          reservationRecord = data;
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 1500));
      }

      if (!reservationRecord) {
        throw new Error("Paiement valide, reservation en cours de finalisation. Rechargez la page dans quelques secondes.");
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
      setConfirmedPricing({
        count: preorderItems.reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0),
        subtotal: roundCurrency(Number(metadata.pre_discount_subtotal || 0)),
        formulaDiscount: roundCurrency(Number(metadata.formula_discount_amount || 0)),
        formulaDiscountPercent: roundCurrency(Number(metadata.formula_discount_percent || 0)),
        formulaName: metadata.formula_applied || null,
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
          console.error("Zero-attente conversion tracking failed:", trackingError);
        }
      }
    } catch (error) {
      attemptedProcessingKeyRef.current = null;
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Creation de reservation impossible.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }

    /*
    const { data, error } = await (supabase.rpc as any)("validate_and_create_reservation", {
      p_restaurant_id: selectedRestaurant.id,
      p_date: arrivalDate,
      p_time: arrivalTime,
      p_party_size: partySize,
      p_feature: "zero-attente",
      p_metadata: {
        feature: "zero-attente",
        preorder_items: preorderItems,
        pre_discount_subtotal: pricing.subtotal,
        formula_applied: pricing.formulaName,
        formula_discount_amount: pricing.formulaDiscount,
        formula_discount_percent: pricing.formulaDiscountPercent,
        total_amount: pricing.total,
        arrival_date: arrivalDate,
        arrival_time: arrivalTime,
        payment_method: paymentMethod,
        checkout_session_id: checkoutSessionId || null,
        paid,
        card_brand: cardMeta?.card_brand || null,
        card_last4: cardMeta?.card_last4 || null,
      },
      p_notes: `[Zéro Attente] ${pricing.count} plat(s) précommandé(s) - Sous-total: ${pricing.subtotal.toFixed(2)} CHF - Réduction: ${pricing.formulaDiscount.toFixed(2)} CHF - Total: ${pricing.total.toFixed(2)} CHF - Paiement: ${paymentMethod}${paid ? " (payé)" : ""}`,
    });

    setLoading(false);

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      await trackSponsoredConversion(selectedRestaurant.id, {
        conversionType: "zero-attente",
        entityId: data || null,
        paymentMethod,
      });
      try {
        await dispatchQueuedNotifications("zero-attente-reservation");
      } catch (dispatchError) {
        console.error("Zero-attente notification dispatch failed:", dispatchError);
      }
      setConfirmedPricing(pricing);
      setReservationId(data);
      setStep("confirm");
    }
    */
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

    /*
    if (status === "success" && sessionId) {
      const pending = sessionStorage.getItem("zero-attente-pending");
      if (pending) {
        const data = JSON.parse(pending);
        sessionStorage.removeItem("zero-attente-pending");
        const restoredPricing: PricingSummary = data.pricing || {
          count: Number(data.count || 0),
          subtotal: roundCurrency(Number(data.subtotal || 0)),
          formulaDiscount: roundCurrency(Number(data.formulaDiscount || 0)),
          formulaDiscountPercent: roundCurrency(Number(data.formulaDiscountPercent || 0)),
          formulaName: data.formulaName || null,
          total: roundCurrency(Number(data.total || data.subtotal || 0)),
        };

        // Restore state
        setSelectedRestaurant({ id: data.restaurantId, name: data.restaurantName });
        setArrivalDate(data.arrivalDate);
        setArrivalTime(data.arrivalTime);
        setPartySize(data.partySize);
        setPaymentMethod(data.paymentMethod);
        const restoredQuantities = (data.preorderItems || []).reduce((acc: Record<string, number>, item: any) => {
          if (item?.menu_item_id) acc[item.menu_item_id] = Number(item.quantity || 0);
          return acc;
        }, {});
        setQuantities(restoredQuantities);

        // Create reservation after successful payment
        const doCreate = async () => {
          setLoading(true);

          // Try to fetch card info from payment_transactions (in case webhook already ran)
          const { data: txn } = await supabase
            .from("payment_transactions")
            .select("metadata")
            .eq("stripe_checkout_session_id", sessionId)
            .maybeSingle();

          const txnMeta = (txn?.metadata as any) || {};

          const { data: resData, error } = await (supabase.rpc as any)("validate_and_create_reservation", {
            p_restaurant_id: data.restaurantId,
            p_date: data.arrivalDate,
            p_time: data.arrivalTime,
            p_party_size: data.partySize,
            p_feature: "zero-attente",
            p_metadata: {
              feature: "zero-attente",
              preorder_items: data.preorderItems,
              pre_discount_subtotal: restoredPricing.subtotal,
              formula_applied: restoredPricing.formulaName,
              formula_discount_amount: restoredPricing.formulaDiscount,
              formula_discount_percent: restoredPricing.formulaDiscountPercent,
              total_amount: restoredPricing.total,
              arrival_date: data.arrivalDate,
              arrival_time: data.arrivalTime,
              payment_method: data.paymentMethod,
              checkout_session_id: sessionId,
              paid: true,
              card_brand: txnMeta.card_brand || null,
              card_last4: txnMeta.card_last4 || null,
            },
            p_notes: `[Zéro Attente] ${restoredPricing.count} plat(s) précommandé(s) - Sous-total: ${restoredPricing.subtotal.toFixed(2)} CHF - Réduction: ${restoredPricing.formulaDiscount.toFixed(2)} CHF - Total: ${restoredPricing.total.toFixed(2)} CHF - Paiement: ${data.paymentMethod} (payé)`,
          });
          setLoading(false);
          if (error) {
            toast({ title: "Erreur", description: error.message, variant: "destructive" });
          } else {
            await trackSponsoredConversion(data.restaurantId, {
              conversionType: "zero-attente",
              entityId: resData || null,
              paymentMethod: data.paymentMethod,
            });
            try {
              await dispatchQueuedNotifications("zero-attente-reservation");
            } catch (dispatchError) {
              console.error("Zero-attente notification dispatch failed:", dispatchError);
            }
            setConfirmedPricing(restoredPricing);
            setReservationId(resData);
            setStep("confirm");
          }
        };
        doCreate();
      }

      // Clean URL params
      window.history.replaceState({}, "", window.location.pathname);
    } else if (status === "cancelled") {
      sessionStorage.removeItem("zero-attente-pending");
      toast({ title: "Paiement annulé", description: "Vous pouvez réessayer.", variant: "destructive" });
      window.history.replaceState({}, "", window.location.pathname);
    }
    */
  }, [syncPendingCheckoutSessionId, toast]);

  useEffect(() => {
    if (!pendingCheckoutSessionId || reservationId || authLoading) return;

    const processingKey = `${user?.id || "guest"}:${pendingCheckoutSessionId}`;

    if (!user || !session?.access_token) {
      if (authPromptKeyRef.current !== processingKey) {
        authPromptKeyRef.current = processingKey;
        toast({
          title: "Reconnectez-vous",
          description: "Le paiement a ete valide. Reconnectez-vous pour finaliser la reservation Zero Attente.",
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

  const detailForModal = reservationId ? {
    id: reservationId,
    date: arrivalDate,
    time: arrivalTime,
    party_size: partySize,
    status: "pending",
    feature: "zero-attente",
    notes: `[Zéro Attente] ${displayPricing.count} plat(s) précommandé(s) - Sous-total: ${displayPricing.subtotal.toFixed(2)} CHF - Réduction: ${displayPricing.formulaDiscount.toFixed(2)} CHF - Total: ${displayPricing.total.toFixed(2)} CHF`,
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
      total_amount: displayPricing.total,
    } as any,
    preorder_items: preorderItemsForModal as any,
    restaurant_name: selectedRestaurant?.name || "",
  } : null;

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
              <p className="text-sm text-muted-foreground">Le chef démarrera la préparation automatiquement selon votre ETA</p>
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
                  <Sparkles className="h-5 w-5 text-emerald-600 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-emerald-700">Formule détectée : {matchedFormula.name}</p>
                    <p className="text-xs text-emerald-700/80">-{matchedFormula.discountPercent}% appliqué, soit -{formulaDiscount.toFixed(2)} CHF</p>
                  </div>
                  <Badge className="bg-emerald-600 text-white">
                    <Percent className="h-3 w-3 mr-1" />-{formulaDiscount.toFixed(2)} CHF
                  </Badge>
                </div>
              )}
              {count > 0 && !matchedFormula && suggestion && (
                <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-3 flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-indigo-600 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-indigo-700">Formule possible : {suggestion.name}</p>
                    <p className="text-xs text-indigo-700/80">
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
                    <div className="flex justify-between text-sm text-emerald-600 font-medium">
                      <span>Réduction formule{formulaName ? ` (${formulaName})` : ""}</span>
                      <span>-{formulaDiscount.toFixed(2)} CHF</span>
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
                  <div className="flex justify-between text-sm text-emerald-600 font-medium">
                    <span>Réduction formule{formulaName ? ` (${formulaName})` : ""}</span>
                    <span>-{formulaDiscount.toFixed(2)} CHF</span>
                  </div>
                )}
                <div className="flex justify-between font-bold border-t pt-2 mt-2">
                  <span>Total à payer</span>
                  <span>{totalAfterDiscount.toFixed(2)} CHF</span>
                </div>
              </div>

              {/* Payment method selector */}
              <PaymentMethodSelector
                paymentMethod={paymentMethod}
                setPaymentMethod={setPaymentMethod}
                allowedMethods={["card", "twint", "postfinance_card", "postfinance_efinance"]}
              />

              <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-sm text-amber-700">
                <strong>Paiement à l'avance requis</strong> — Le Zéro Attente nécessite un prépaiement pour garantir la synchronisation avec le chef.
              </div>

              <Button
                onClick={handlePayAndReserve}
                disabled={loading}
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
                    <span className="font-medium text-emerald-600">-{displayPricing.formulaDiscount.toFixed(2)} CHF</span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-2">
                  <span className="font-semibold">Total payé</span>
                  <span className="font-bold">{displayPricing.total.toFixed(2)} CHF</span>
                </div>
              </div>
              <div className="rounded-lg bg-indigo-500/5 p-3 flex items-center gap-2 text-sm text-indigo-600">
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
