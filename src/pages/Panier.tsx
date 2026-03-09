import { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Minus, Plus, Trash2, ShoppingCart, Trophy, CreditCard, Wallet, Heart, Sparkles, Zap, Timer, Clock, TrendingDown, Leaf, Gift } from "lucide-react";
import { Link } from "react-router-dom";
import FormulaDetector from "@/components/FormulaDetector";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { generateOrderReference, sendOrderConfirmationEmail } from "@/lib/email-service";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import { trackSponsoredConversion } from "@/lib/analytics";

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
  const [useLoyaltyPoints, setUseLoyaltyPoints] = useState(false);
  const [pointsToRedeemInput, setPointsToRedeemInput] = useState(0);
  const [donateEarnedXp, setDonateEarnedXp] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"card" | "paypal" | "apple" | "google">("card");
  const [flexOption, setFlexOption] = useState<"express" | "standard" | "flex">("standard");

  const [arrivalDate, setArrivalDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [arrivalTime, setArrivalTime] = useState("");
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

  const flexFees = {
    express: 2.50,
    standard: 1.00,
    flex: 0
  };

  const deliveryFee = orderMode === "takeaway" ? 0 : flexFees[flexOption];

  // Récupérer les points de l'utilisateur
  const { data: profile } = useQuery({
    queryKey: ["profile-loyalty", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles" as any).select("loyalty_points").eq("user_id", user?.id).single();
      return data as any;
    },
    enabled: !!user,
  });

  const loyaltyPoints = profile?.loyalty_points || 0;
  // Conversion: 100 points = 1 CHF
  const maxPointsDiscount = loyaltyPoints / 100;

  const handleDiscountCalculated = useCallback((discount: number, name: string | null) => {
    if (discount !== lastDiscount.current.amount || name !== lastDiscount.current.name) {
      lastDiscount.current = { amount: discount, name };
      setFormulaDiscount(discount);
      setFormulaName(name);
    }
  }, []);

  const subFinalTotal = total - formulaDiscount + deliveryFee;
  // Reduction Flex (10% si option flex choisie)
  const flexDiscount = flexOption === "flex" ? total * 0.1 : 0;

  // Points max utilisables (ne peut pas depasser le montant restant apres reduction)
  const maxPointsRedeemable = Math.min(
    loyaltyPoints,
    Math.floor(Math.max(subFinalTotal - flexDiscount, 0) * 100)
  );

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
  const pointsDiscount = pointsToRedeem / 100;

  // XP que l'utilisateur va gagner avec cette commande (10 XP par CHF)
  const earnedXp = Math.floor(subFinalTotal * 10);

  const finalTotal = subFinalTotal - pointsDiscount - flexDiscount;

  const handleCheckout = async () => {
    if (!user) return navigate("/auth");

    if (hasAntiGaspi && orderMode !== "takeaway") {
      return toast({
        title: "Mode incompatible",
        description: "Les offres anti-gaspi sont uniquement disponibles a l'emporter.",
        variant: "destructive",
      });
    }

    const hasIncompatibleFlashMode = flashItems.some((item) => {
      const canDelivery = item.metadata?.delivery_available !== false;
      const canTakeaway = item.metadata?.takeaway_available !== false;
      return orderMode === "delivery" ? !canDelivery : !canTakeaway;
    });

    if (hasIncompatibleFlashMode) {
      return toast({
        title: "Mode incompatible",
        description: "Certaines ventes flash du panier ne sont pas disponibles dans ce mode.",
        variant: "destructive",
      });
    }

    // Validation based on feature
    if (orderMode === "delivery") {
      if (!address.trim()) return toast({ title: "Adresse requise", variant: "destructive" });
    } else {
      // For takeaway
      if (!hasAntiGaspi && !hasTakeawayFlash && (!pickupDate || !pickupTime)) {
        return toast({ title: "Date et heure requises", variant: "destructive", description: "Veuillez préciser quand vous passerez récupérer la commande." });
      }
    }

    // Group items by restaurant
    const itemsByRestaurant = items.reduce((acc, item) => {
      if (!acc[item.restaurantId]) acc[item.restaurantId] = [];
      acc[item.restaurantId].push(item);
      return acc;
    }, {} as Record<string, any[]>);

    const resCount = Object.keys(itemsByRestaurant).length;
    const checkoutId = crypto.randomUUID();
    let firstOrderId: string | null = null;
    let firstReservationId: string | null = null;
    const orderReference = generateOrderReference();
    setLoading(true);

    try {
      for (const [resId, resItems] of Object.entries(itemsByRestaurant)) {
        const qualityFeeItem = resItems.find(i => i.menuItemId === "garantie-qualite-fee");
        const realItems = resItems.filter(i => i.menuItemId !== "garantie-qualite-fee");

        if (realItems.length === 0) continue;

        const resSubtotal = realItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
        const resDiscount = restaurantId === resId ? formulaDiscount : 0;
        const resFormulaDiscountPercent = resSubtotal > 0 && resDiscount > 0 ? (resDiscount / resSubtotal) * 100 : 0;
        const qualityFeeAmount = qualityFeeItem?.price || 0;
        const deliveryFeePerRestaurant = deliveryFee / resCount;

        // Merge global cart metadata with specific restaurant context if needed
        const finalMetadata = {
          ...cartMetadata,
          feature: hasAntiGaspi ? "anti-gaspi" : cartMetadata?.feature,
          has_anti_gaspi: hasAntiGaspi,
          has_flash_sale: flashItems.length > 0,
          quality_guarantee: !!qualityFeeItem,
          quality_fee_amount: qualityFeeAmount,
          formula_applied: resDiscount > 0 ? formulaName : null,
          formula_discount_amount: resDiscount > 0 ? Number(resDiscount.toFixed(2)) : 0,
          formula_discount_percent: resFormulaDiscountPercent > 0 ? Number(resFormulaDiscountPercent.toFixed(2)) : 0,
          pre_discount_subtotal: Number(resSubtotal.toFixed(2)),
          original_total: Number((resSubtotal + deliveryFeePerRestaurant + qualityFeeAmount).toFixed(2)),
          multi_restaurant: resCount > 1,
          total_restaurants: resCount,
          payment_method: paymentMethod,
          donate_earned_xp: donateEarnedXp,
          order_reference: orderReference,
          arrival_date: null,
          arrival_time: null,
          pickup_date: orderMode === "takeaway" && !hasAntiGaspi
            ? (hasTakeawayFlash ? flashPickupDate : pickupDate)
            : null,
          pickup_time: orderMode === "takeaway" && !hasAntiGaspi
            ? (hasTakeawayFlash ? flashPickupStart : pickupTime)
            : null,
          pickup_time_end: orderMode === "takeaway" && !hasAntiGaspi && hasTakeawayFlash
            ? flashPickupEnd
            : null,
          flex_option: flexOption,
          flex_guarantee: flexOption === "express"
            ? "1% discount per minute delay"
            : flexOption === "standard"
              ? "1% discount per 2 minute delay"
              : "10% subtotal discount applied"
        };

        const orderItemsJson = realItems.map((item) => ({
          menu_item_id: item.menuItemId,
          restaurant_id: item.restaurantId,
          quantity: Math.floor(item.quantity),
          unit_price: Number(item.price),
          total_price: Number(item.price) * Math.floor(item.quantity),
          metadata: item.metadata || {},
        }));

        // Use validate-order edge function for server-side validation
        const { data: validateResult, error: validateError } = await supabase.functions.invoke("validate-order", {
          body: {
            restaurant_id: resId,
            delivery_address: address,
            delivery_fee: deliveryFeePerRestaurant,
            total_amount: resSubtotal - resDiscount + deliveryFeePerRestaurant + qualityFeeAmount,
            notes: notes || null,
            items: orderItemsJson,
            metadata: finalMetadata,
            checkout_id: checkoutId,
          },
        });

        if (validateError) throw new Error(validateError.message);
        if (validateResult?.error) throw new Error(validateResult.error);
        const orderId = validateResult?.order_id;
        if (isZeroAttente) {
          if (!firstReservationId) firstReservationId = orderId;
        } else if (!firstOrderId) {
          firstOrderId = orderId;
        }

        // If this was a group order, link it
        if (cartMetadata.groupId) {
          await supabase
            .from("group_members" as any)
            .update({ order_id: orderId })
            .eq("group_id", cartMetadata.groupId)
            .eq("user_id", user.id);
        }

        // Count conversion for sponsored campaigns when checkout is completed.
        await trackSponsoredConversion(resId);
      }
      // Déduire les points si utilisés
      if (useLoyaltyPoints && pointsToRedeem > 0) {
        const { error: rpcError } = await (supabase.rpc as any)("redeem_loyalty_points", {
          user_id_param: user.id,
          points_to_redeem: pointsToRedeem,
          description_param: `Paiement pour commande du ${new Date().toLocaleDateString()}`
        });
        if (rpcError) throw rpcError;
      }

      // Simulation d'un délai de traitement sécurisé
      await new Promise(resolve => setTimeout(resolve, 1500));

      clearCart();

      // Invalidate loyalty & donation queries so counters update
      queryClient.invalidateQueries({ queryKey: ["profile-loyalty"] });
      queryClient.invalidateQueries({ queryKey: ["loyalty-transactions"] });
      if (donateEarnedXp) {
        queryClient.invalidateQueries({ queryKey: ["donated-meals-total"] });
        queryClient.invalidateQueries({ queryKey: ["donated-points-total"] });
      }

      // Send confirmation email
      await sendOrderConfirmationEmail({
        orderReference,
        restaurantName: items[0]?.restaurantName || "Restaurant partenaire",
        items: items.map(i => ({ name: i.name, quantity: i.quantity, price: i.price })),
        subtotal: total,
        deliveryFee,
        formulaDiscount,
        formulaName,
        pointsDiscount,
        finalTotal,
        customerEmail: user.email || "client@miamz.ch",
        metadata: {
          feature: isZeroAttente ? "zero-attente" : "standard",
          arrival_date: isZeroAttente ? arrivalDate : null,
          arrival_time: isZeroAttente ? arrivalTime : null,
          delivery_address: address || null,
          payment_method: paymentMethod
        }
      });

      toast({
        title: "Commandes confirmées !",
        description: resCount > 1
          ? `Vos ${resCount} commandes ont été synchronisées. Réf: ${orderReference}`
          : `Votre commande est en cours de préparation. Réf: ${orderReference}`
      });

      if (isZeroAttente) {
        navigate("/reservations");
      } else if (firstOrderId) {
        navigate(`/commande/${firstOrderId}`);
      } else {
        navigate("/commandes");
      }
    } catch (error: any) {
      toast({ title: "Erreur lors du paiement", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
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

        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.menuItemId} className="flex items-center gap-4 p-4 border rounded-xl bg-card">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{item.name}</p>
                <p className="text-sm text-primary font-bold">{(item.price * item.quantity).toFixed(2)} CHF</p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQuantity(item.menuItemId, item.quantity - 1)}>
                  <Minus className="h-3 w-3" />
                </Button>
                <span className="text-sm font-medium w-6 text-center">{item.quantity}</span>
                <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQuantity(item.menuItemId, item.quantity + 1)}>
                  <Plus className="h-3 w-3" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeItem(item.menuItemId)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        {/* Formula detection */}
        <FormulaDetector
          items={items}
          restaurantId={restaurantId}
          onDiscountCalculated={handleDiscountCalculated}
        />

        <div className="space-y-4 pt-4 border-t">
          {orderMode === "delivery" ? (
            <div className="space-y-2">
              <Label>Adresse de livraison</Label>
              <AddressAutocomplete
                value={address}
                onAddressSelect={(addr) => setAddress(addr)}
                placeholder="12 rue de la Paix, 75002 Paris"
              />
            </div>
          ) : (
            <div className="space-y-4">
              {isZeroAttente ? (
                <div className="space-y-2">
                  <Label>Date et heure d'arrivee desirees</Label>
                  <div className="flex flex-wrap gap-3">
                    <Input
                      type="date"
                      value={arrivalDate}
                      onChange={(e) => setArrivalDate(e.target.value)}
                      required
                      min={new Date().toISOString().split('T')[0]}
                      className="w-full sm:w-48"
                    />
                    <Input
                      type="time"
                      value={arrivalTime}
                      onChange={(e) => setArrivalTime(e.target.value)}
                      required
                      className="w-full sm:w-48"
                    />
                  </div>
                </div>
              ) : hasAntiGaspi ? (
                <div className="p-4 rounded-xl bg-miamz-green/10 border border-miamz-green/20 space-y-2">
                  <div className="flex items-center gap-2 text-miamz-green font-bold">
                    <Leaf className="h-4 w-4" />
                    <span>Retrait Anti-Gaspi</span>
                  </div>
                  <div className="text-sm space-y-1">
                    <p className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>
                        Le <strong>{antiGaspiItem?.metadata?.available_date ? new Date(antiGaspiItem.metadata.available_date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : 'aujourd\'hui'}</strong>
                      </span>
                    </p>
                    <p className="flex items-center gap-2 pl-5">
                      <span className="text-muted-foreground">Créneau :</span>
                      <strong>{antiGaspiItem?.metadata?.pickup_start} - {antiGaspiItem?.metadata?.pickup_end}</strong>
                    </p>
                  </div>
                </div>
              ) : hasTakeawayFlash ? (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-2">
                  <div className="flex items-center gap-2 text-amber-600 font-bold">
                    <Zap className="h-4 w-4" />
                    <span>Retrait Vente Flash</span>
                  </div>
                  <div className="text-sm space-y-1">
                    <p className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>
                        Le <strong>{flashPickupDate ? new Date(flashPickupDate).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : 'date definie par l\'offre'}</strong>
                      </span>
                    </p>
                    <p className="flex items-center gap-2 pl-5">
                      <span className="text-muted-foreground">Creneau fixe :</span>
                      <strong>{flashPickupStart || "--:--"} - {flashPickupEnd || "--:--"}</strong>
                    </p>
                    <p className="text-xs text-muted-foreground pl-5">
                      Le creneau de retrait est impose par la vente flash et ne peut pas etre modifie.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>Date de retrait</Label>
                    <Input
                      type="date"
                      value={pickupDate}
                      onChange={(e) => setPickupDate(e.target.value)}
                      required
                      min={new Date().toISOString().split('T')[0]}
                      className="w-full sm:w-48"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Heure de retrait</Label>
                    <Input
                      type="time"
                      value={pickupTime}
                      onChange={(e) => setPickupTime(e.target.value)}
                      required
                      className="w-full sm:w-48"
                    />
                  </div>
                </>
              )}
            </div>
          )}
          <div className="space-y-2">
            <Label>Notes (optionnel)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={isZeroAttente ? "Préférences de table, allergies..." : "Code d'entrée, étage..."} />
          </div>
        </div>

        <div className="border-t pt-4 space-y-2">
          {loyaltyPoints > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg bg-pink-500/5 border border-pink-500/20">
                <div className="flex items-center gap-3">
                  <Trophy className="h-5 w-5 text-pink-500" />
                  <div className="space-y-0.5">
                    <Label className="font-semibold cursor-pointer">Utiliser mes Miamz</Label>
                    <p className="text-xs text-muted-foreground">
                      Solde: {loyaltyPoints} pts ({maxPointsDiscount.toFixed(2)} CHF max)
                    </p>
                  </div>
                </div>
                <Switch
                  checked={useLoyaltyPoints}
                  onCheckedChange={(checked) => {
                    setUseLoyaltyPoints(checked);
                    setPointsToRedeemInput(checked ? maxPointsRedeemable : 0);
                  }}
                />
              </div>

              {useLoyaltyPoints && (
                <div className="p-3 rounded-lg border bg-card space-y-2">
                  <Label className="text-xs">Nombre de Miamz à utiliser</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      max={maxPointsRedeemable}
                      step={1}
                      value={pointsToRedeemInput}
                      onChange={(e) => {
                        const parsed = Math.floor(Number(e.target.value));
                        if (Number.isNaN(parsed)) {
                          setPointsToRedeemInput(0);
                          return;
                        }
                        setPointsToRedeemInput(Math.max(0, Math.min(parsed, maxPointsRedeemable)));
                      }}
                    />
                    <Button type="button" variant="outline" onClick={() => setPointsToRedeemInput(maxPointsRedeemable)}>
                      Max
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Équivalent à {(pointsToRedeemInput / 100).toFixed(2)} CHF
                  </p>
                </div>
              )}

              {earnedXp > 0 && (
                <div className="flex items-center justify-between p-3 rounded-lg bg-pink-500/5 border border-pink-500/20">
                  <div className="flex items-center gap-3">
                    <Heart className="h-5 w-5 text-pink-500 fill-pink-500" />
                    <div className="space-y-0.5">
                      <Label className="font-semibold cursor-pointer">Reverser mes Miamz aux démunis</Label>
                      <p className="text-xs text-muted-foreground text-pink-500">
                        Vous allez gagner <strong>{earnedXp} Miamz</strong> · Reversez-les à la cagnotte solidaire
                      </p>
                    </div>
                  </div>
                  <Switch checked={donateEarnedXp} onCheckedChange={setDonateEarnedXp} />
                </div>
              )}
            </div>
          )}

          <div className="flex justify-between text-sm"><span>Sous-total</span><span>{total.toFixed(2)} CHF</span></div>
          {formulaDiscount > 0 && (
            <div className="flex justify-between text-sm text-accent font-medium">
              <span>Réduction formule ({formulaName})</span>
              <span>-{formulaDiscount.toFixed(2)} CHF</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span>{isZeroAttente ? "Service (Sur place)" : `Frais de livraison (${orderMode === "takeaway" ? "À l'emporter" : "Livraison"})`}</span>
            <span>{isZeroAttente ? "0.00 CHF" : `${deliveryFee.toFixed(2)} CHF`}</span>
          </div>
          {pointsDiscount > 0 && (
            <div className="flex justify-between text-sm font-medium text-pink-500">
              <span>Réduction Fidélité ({pointsToRedeem} pts)</span>
              <span>-{pointsDiscount.toFixed(2)} CHF</span>
            </div>
          )}
          {flexDiscount > 0 && (
            <div className="flex justify-between text-sm font-medium text-emerald-600">
              <span>Réduction Offres (10%)</span>
              <span>-{flexDiscount.toFixed(2)} CHF</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-lg border-t pt-2"><span>Total</span><span>{finalTotal.toFixed(2)} CHF</span></div>
          {earnedXp > 0 && (
            <div className={`flex items-center justify-between text-sm pt-1 text-pink-500`}>
              <span className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" />
                {donateEarnedXp ? "Miamz reversés aux démunis" : "Miamz gagnés avec cette commande"}
              </span>
              <span className="font-semibold">+{earnedXp} Miamz</span>
            </div>
          )}
        </div>

        {/* Flex Prix Bas Selection */}
        {orderMode === "delivery" && (
          <div className="space-y-3 pt-4 border-t">
            <Label className="font-bold flex items-center gap-2">
              <Gift className="h-4 w-4" /> Options de livraison Offres
            </Label>
            <div className="grid grid-cols-1 gap-3">
              <button
                type="button"
                onClick={() => setFlexOption("express")}
                className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all ${flexOption === "express" ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-muted bg-card hover:border-primary/20"}`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                    <Zap className="h-5 w-5 text-amber-500" />
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-sm">Express (30 min)</p>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight">Garantie : 1% rabais / minute de retard</p>
                  </div>
                </div>
                <span className="font-bold text-sm text-primary">+2.50 CHF</span>
              </button>

              <button
                type="button"
                onClick={() => setFlexOption("standard")}
                className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all ${flexOption === "standard" ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-muted bg-card hover:border-primary/20"}`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                    <Clock className="h-5 w-5 text-blue-500" />
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-sm">Standard (45 min)</p>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight">Garantie : 1% rabais / 2 minute de retard</p>
                  </div>
                </div>
                <span className="font-bold text-sm text-primary">+1.00 CHF</span>
              </button>

              <button
                type="button"
                onClick={() => setFlexOption("flex")}
                className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all ${flexOption === "flex" ? "border-emerald-500 bg-emerald-500/5 ring-1 ring-emerald-500 text-emerald-900" : "border-muted bg-card hover:border-emerald-500/20"}`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                    <Gift className="h-5 w-5 text-emerald-500" />
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-sm">Offres (1h - 1h30)</p>
                    <p className="text-[10px] text-emerald-600 uppercase font-bold tracking-tight">Fenêtre flexible : Rabais fixe de 10%</p>
                  </div>
                </div>
                <span className="font-bold text-sm text-emerald-600">-10%</span>
              </button>
            </div>
          </div>
        )}

        {/* Payment Method Selection */}
        <div className="space-y-3 pt-4 border-t">
          <Label className="font-bold flex items-center gap-2">
            <CreditCard className="h-4 w-4" /> Mode de paiement
          </Label>
          <div className="grid grid-cols-2 gap-3">
            {[
              { id: "card", label: "Carte", icon: CreditCard },
              { id: "paypal", label: "PayPal", icon: Wallet },
              { id: "apple", label: "Apple Pay", icon: Wallet },
              { id: "google", label: "Google Pay", icon: Wallet },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPaymentMethod(p.id as any)}
                className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-sm font-medium
                  ${paymentMethod === p.id
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-muted bg-card hover:border-primary/20"}`}
              >
                <p.icon className={`h-4 w-4 ${paymentMethod === p.id ? "text-primary" : "text-muted-foreground"}`} />
                {p.label}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground text-center italic">
            Paiement sécurisé et crypté par Miamz Pay
          </p>
        </div>

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
