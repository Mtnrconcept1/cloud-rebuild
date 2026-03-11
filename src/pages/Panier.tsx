import { useState, useCallback, useRef, useEffect } from "react";
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
import { generateOrderReference, sendOrderConfirmationEmail } from "@/lib/email-service";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import { trackSponsoredConversion, trackEvent, trackCheckoutEvent } from "@/lib/analytics";

import CartItemList from "@/components/cart/CartItemList";
import LoyaltySection from "@/components/cart/LoyaltySection";
import FlexOptions from "@/components/cart/FlexOptions";
import PaymentMethodSelector, { type PaymentMethodId } from "@/components/cart/PaymentMethodSelector";

export default function Panier() {
  const { items, updateQuantity, removeItem, clearCart, total, restaurantId, cartMetadata, orderMode } = useCart();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [address, setAddress] = useState("");
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
  const lastDiscount = useRef({ amount: 0, name: null as string | null });

  const hasAntiGaspi = items.some(item => item.metadata?.is_anti_waste);
  const antiGaspiItem = items.find(item => item.metadata?.is_anti_waste);
  const flashItems = items.filter(item => item.metadata?.is_flash_sale);
  const hasTakeawayFlash = orderMode === "takeaway" && flashItems.length > 0;
  const flashTakeawayItem = flashItems[0];
  const flashPickupDate = flashTakeawayItem?.metadata?.sale_date || null;
  const flashPickupStart = flashTakeawayItem?.metadata?.sale_start || null;
  const flashPickupEnd = flashTakeawayItem?.metadata?.sale_end || null;

  const flexFees = { express: 2.50, standard: 1.00, flex: 0 };
  const deliveryFee = orderMode === "takeaway" ? 0 : flexFees[flexOption];

  const { data: profile } = useQuery({
    queryKey: ["profile-loyalty", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles" as any).select("loyalty_points").eq("user_id", user?.id).single();
      return data as any;
    },
    enabled: !!user,
  });

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

  const pointsToRedeem = useLoyaltyPoints ? Math.min(pointsToRedeemInput, maxPointsRedeemable) : 0;
  const pointsDiscount = pointsToRedeem / 100;
  const earnedXp = Math.floor(subFinalTotal * 10);
  const finalTotal = subFinalTotal - pointsDiscount - flexDiscount;

  const handleCheckout = async () => {
    if (!user) return navigate("/auth");

    trackEvent({ eventType: "checkout_initiated", eventData: { restaurant_id: restaurantId, total: finalTotal } });
    if (hasAntiGaspi && orderMode !== "takeaway") return toast({ title: "Mode incompatible", description: "Les offres anti-gaspi sont uniquement disponibles a l'emporter.", variant: "destructive" });

    const hasIncompatibleFlashMode = flashItems.some((item) => {
      const canDelivery = item.metadata?.delivery_available !== false;
      const canTakeaway = item.metadata?.takeaway_available !== false;
      return orderMode === "delivery" ? !canDelivery : !canTakeaway;
    });
    if (hasIncompatibleFlashMode) return toast({ title: "Mode incompatible", description: "Certaines ventes flash du panier ne sont pas disponibles dans ce mode.", variant: "destructive" });

    if (orderMode === "delivery") {
      if (!address.trim()) return toast({ title: "Adresse requise", variant: "destructive" });
    } else if (!hasAntiGaspi && !hasTakeawayFlash && (!pickupDate || !pickupTime)) {
      return toast({ title: "Date et heure requises", variant: "destructive", description: "Veuillez préciser quand vous passerez récupérer la commande." });
    }

    const itemsByRestaurant = items.reduce((acc, item) => {
      if (!acc[item.restaurantId]) acc[item.restaurantId] = [];
      acc[item.restaurantId].push(item);
      return acc;
    }, {} as Record<string, any[]>);

    const resCount = Object.keys(itemsByRestaurant).length;
    const checkoutId = crypto.randomUUID();
    let firstOrderId: string | null = null;
    const orderReference = generateOrderReference();
    setLoading(true);

    try {
      // For online payments (not cash), redirect to Stripe
      if (paymentMethod !== "cash") {
        const { data: checkoutData, error: checkoutError } = await supabase.functions.invoke("create-checkout", {
          body: {
            items: items.map(i => ({
              name: i.name,
              price: i.price,
              quantity: i.quantity,
              restaurant_name: i.restaurantName,
            })),
            payment_method: paymentMethod,
            return_url: `${window.location.origin}/commandes`,
            order_metadata: {
              order_reference: orderReference,
              restaurant_id: restaurantId,
              delivery_fee: deliveryFee,
              formula_discount: formulaDiscount,
              points_discount: pointsDiscount,
              flex_discount: flexDiscount,
              checkout_id: checkoutId,
            },
          },
        });

        if (checkoutError) throw new Error(checkoutError.message);
        if (checkoutData?.error) throw new Error(checkoutData.error);

        // Before redirecting, create orders in pending_payment status
        for (const [resId, resItems] of Object.entries(itemsByRestaurant)) {
          const qualityFeeItem = resItems.find(i => i.menuItemId === "garantie-qualite-fee");
          const realItems = resItems.filter(i => i.menuItemId !== "garantie-qualite-fee");
          if (realItems.length === 0) continue;

          const resSubtotal = realItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
          const resDiscount = restaurantId === resId ? formulaDiscount : 0;
          const qualityFeeAmount = qualityFeeItem?.price || 0;
          const deliveryFeePerRestaurant = deliveryFee / resCount;

          const finalMetadata = buildOrderMetadata(resId, resSubtotal, resDiscount, qualityFeeAmount, deliveryFeePerRestaurant, resCount);

          const orderItemsJson = realItems.map((item) => ({
            menu_item_id: item.menuItemId, restaurant_id: item.restaurantId,
            quantity: Math.floor(item.quantity), unit_price: Number(item.price),
            total_price: Number(item.price) * Math.floor(item.quantity), metadata: item.metadata || {},
          }));

          const { data: validateResult, error: validateError } = await supabase.functions.invoke("validate-order", {
            body: {
              restaurant_id: resId,
              delivery_address: address,
              delivery_fee: deliveryFeePerRestaurant,
              total_amount: resSubtotal - resDiscount + deliveryFeePerRestaurant + qualityFeeAmount,
              notes: notes || null,
              items: orderItemsJson,
              metadata: { ...finalMetadata, stripe_session_id: checkoutData.session_id },
              checkout_id: checkoutId
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

        // Redirect to Stripe
        if (checkoutData?.url) {
          window.location.href = checkoutData.url;
          return;
        }
      }

      // Cash payment flow — create orders directly as confirmed
      for (const [resId, resItems] of Object.entries(itemsByRestaurant)) {
        const qualityFeeItem = resItems.find(i => i.menuItemId === "garantie-qualite-fee");
        const realItems = resItems.filter(i => i.menuItemId !== "garantie-qualite-fee");
        if (realItems.length === 0) continue;

        const resSubtotal = realItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
        const resDiscount = restaurantId === resId ? formulaDiscount : 0;
        const qualityFeeAmount = qualityFeeItem?.price || 0;
        const deliveryFeePerRestaurant = deliveryFee / resCount;

        const finalMetadata = buildOrderMetadata(resId, resSubtotal, resDiscount, qualityFeeAmount, deliveryFeePerRestaurant, resCount);

        const orderItemsJson = realItems.map((item) => ({
          menu_item_id: item.menuItemId, restaurant_id: item.restaurantId,
          quantity: Math.floor(item.quantity), unit_price: Number(item.price),
          total_price: Number(item.price) * Math.floor(item.quantity), metadata: item.metadata || {},
        }));

        const { data: validateResult, error: validateError } = await supabase.functions.invoke("validate-order", {
          body: {
            restaurant_id: resId,
            delivery_address: address,
            delivery_fee: deliveryFeePerRestaurant,
            total_amount: resSubtotal - resDiscount + deliveryFeePerRestaurant + qualityFeeAmount,
            notes: notes || null,
            items: orderItemsJson,
            metadata: finalMetadata,
            checkout_id: checkoutId
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

      await sendOrderConfirmationEmail({
        orderReference, restaurantName: items[0]?.restaurantName || "Restaurant partenaire",
        items: items.map(i => ({ name: i.name, quantity: i.quantity, price: i.price })),
        subtotal: total, deliveryFee, formulaDiscount, formulaName, pointsDiscount, finalTotal,
        customerEmail: user.email || "client@miamz.ch",
        metadata: { feature: "standard", delivery_address: address || null, payment_method: paymentMethod },
      });

      toast({ title: "Commandes confirmées !", description: resCount > 1 ? `Vos ${resCount} commandes ont été synchronisées. Réf: ${orderReference}` : `Votre commande est en cours de préparation. Réf: ${orderReference}` });
      navigate(firstOrderId ? `/commande/${firstOrderId}` : "/commandes");
    } catch (error: any) {
      toast({ title: "Erreur lors du paiement", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const buildOrderMetadata = (resId: string, resSubtotal: number, resDiscount: number, qualityFeeAmount: number, deliveryFeePerRestaurant: number, resCount: number) => {
    const resFormulaDiscountPercent = resSubtotal > 0 && resDiscount > 0 ? (resDiscount / resSubtotal) * 100 : 0;
    return {
      ...cartMetadata,
      feature: hasAntiGaspi ? "anti-gaspi" : cartMetadata?.feature,
      has_anti_gaspi: hasAntiGaspi, has_flash_sale: flashItems.length > 0,
      quality_guarantee: !!qualityFeeAmount, quality_fee_amount: qualityFeeAmount,
      formula_applied: resDiscount > 0 ? formulaName : null,
      formula_discount_amount: resDiscount > 0 ? Number(resDiscount.toFixed(2)) : 0,
      formula_discount_percent: resFormulaDiscountPercent > 0 ? Number(resFormulaDiscountPercent.toFixed(2)) : 0,
      promotion_applied: promoDiscount > 0 ? promoName : null,
      promotion_discount_amount: promoDiscount > 0 ? Number(promoDiscount.toFixed(2)) : 0,
      pre_discount_subtotal: Number(resSubtotal.toFixed(2)),
      original_total: Number((resSubtotal + deliveryFeePerRestaurant + qualityFeeAmount).toFixed(2)),
      multi_restaurant: resCount > 1, total_restaurants: resCount,
      payment_method: paymentMethod, donate_earned_xp: donateEarnedXp,
      arrival_date: null, arrival_time: null,
      pickup_date: orderMode === "takeaway" && !hasAntiGaspi ? (hasTakeawayFlash ? flashPickupDate : pickupDate) : null,
      pickup_time: orderMode === "takeaway" && !hasAntiGaspi ? (hasTakeawayFlash ? flashPickupStart : pickupTime) : null,
      pickup_time_end: orderMode === "takeaway" && !hasAntiGaspi && hasTakeawayFlash ? flashPickupEnd : null,
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
            <div className="space-y-2">
              <Label>Adresse de livraison</Label>
              <AddressAutocomplete value={address} onAddressSelect={(addr) => setAddress(addr)} placeholder="12 rue de la Paix, 75002 Paris" />
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
                    <p className="flex items-center gap-2"><Clock className="h-3.5 w-3.5 text-muted-foreground" /><span>Le <strong>{flashPickupDate ? new Date(flashPickupDate).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : "date definie par l'offre"}</strong></span></p>
                    <p className="flex items-center gap-2 pl-5"><span className="text-muted-foreground">Creneau fixe :</span><strong>{flashPickupStart || "--:--"} - {flashPickupEnd || "--:--"}</strong></p>
                    <p className="text-xs text-muted-foreground pl-5">Le creneau de retrait est impose par la vente flash et ne peut pas etre modifie.</p>
                  </div>
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
        <PaymentMethodSelector paymentMethod={paymentMethod} setPaymentMethod={setPaymentMethod} />

        <Button className="w-full" size="lg" onClick={handleCheckout} disabled={loading}>
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
