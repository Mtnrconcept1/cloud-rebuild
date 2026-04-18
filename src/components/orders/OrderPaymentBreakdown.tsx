import {
  Banknote,
  CreditCard,
  Crown,
  Gift,
  Percent,
  Sparkles,
  TicketPercent,
  Truck,
} from "lucide-react";

type OrderLike = {
  total_amount?: number | string | null;
  delivery_fee?: number | string | null;
  metadata?: Record<string, unknown> | null;
  order_items?: Array<{ total_price?: number | string | null }> | null;
};

type OrderPaymentBreakdownProps = {
  order: OrderLike;
  className?: string;
  showPaymentMethod?: boolean;
  showDivider?: boolean;
  alwaysShowTotal?: boolean;
  totalLabel?: string;
  isRestaurantDashboard?: boolean;
};

const PAYMENT_LABELS: Record<string, { label: string; icon: typeof CreditCard }> = {
  card: { label: "Carte bancaire", icon: CreditCard },
  twint: { label: "TWINT", icon: CreditCard },
  cash: { label: "Especes", icon: Banknote },
};

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getMetadata(order: OrderLike) {
  if (!order.metadata || typeof order.metadata !== "object" || Array.isArray(order.metadata)) {
    return {} as Record<string, unknown>;
  }

  return order.metadata;
}

export function isTokCommissionApplicable(order: OrderLike) {
  const meta = getMetadata(order);
  const type = String(meta.type || "").toLowerCase();
  const feature = String(meta.feature || "").toLowerCase();
  const hasAntiGaspi = Boolean(meta.has_anti_gaspi);
  const hasFlashSale = Boolean(meta.has_flash_sale);

  if (type === "takeaway" || type === "pickup") return true;
  if (feature === "ventes-flash" || hasFlashSale) return true;
  if (feature === "anti-gaspi" || feature === "zero-gaspi" || hasAntiGaspi) return true;
  if (feature === "table-chef" || feature === "chefs-table") return true;
  
  // Detection fallback pour le takeaway
  if (meta.pickup_time || meta.pickup_date) return true;
  
  // Si ce n'est pas "zero-attente", et sans adresse de livraison dans les meta,
  // c'est generalement par defaut du click & collect / Takeaway
  if (feature !== "zero-attente" && (!meta.delivery_address || String(meta.delivery_address).trim() === "")) {
    return true;
  }

  return false;
}

export function getOrderPaymentBreakdown(order: OrderLike) {
  const meta = getMetadata(order);
  const formulaDiscount = toNumber(meta.formula_discount_amount);
  const promoDiscount = toNumber(meta.promotion_discount_amount);
  const tokOneDiscount = toNumber(meta.tok_one_discount_amount);
  const tokOneDiscountPercent = toNumber(meta.tok_one_discount_percent);
  const tokOneDeliverySaved = toNumber(meta.tok_one_delivery_saved);
  const tokOneTotalSaved = toNumber(meta.tok_one_total_saved || (tokOneDiscount + tokOneDeliverySaved));
  const flexDiscount = toNumber(meta.flex_discount_amount || meta.flex_discount);
  const pointsDiscount = toNumber(meta.points_discount_amount || meta.points_discount);
  const deliveryFee = toNumber(order.delivery_fee ?? meta.delivery_fee);
  const qualityFee = toNumber(meta.quality_fee_amount);
  const total = toNumber(order.total_amount);
  const subtotalFromMeta = toNumber(meta.pre_discount_subtotal);
  const subtotalFromItems = Array.isArray(order.order_items)
    ? order.order_items.reduce((sum, item) => sum + toNumber(item?.total_price), 0)
    : 0;
  const subtotalFromTotal = Math.max(
    0,
    total - deliveryFee - qualityFee + formulaDiscount + promoDiscount + tokOneDiscount + flexDiscount + pointsDiscount,
  );
  const subtotal = subtotalFromMeta > 0
    ? subtotalFromMeta
    : subtotalFromItems > 0
      ? subtotalFromItems
      : subtotalFromTotal;
  const tokOneMember = Boolean(meta.tok_one_member);
  const paymentMethodRaw = String(meta.payment_method || "card");
  const paymentMethodKey = paymentMethodRaw.toLowerCase();
  const paymentMethod = PAYMENT_LABELS[paymentMethodKey] || PAYMENT_LABELS.card;

  return {
    subtotal,
    formulaDiscount,
    formulaName: typeof meta.formula_applied === "string" ? meta.formula_applied : "",
    promoDiscount,
    promoName: typeof meta.promotion_applied === "string" ? meta.promotion_applied : "",
    tokOneDiscount,
    tokOneDiscountPercent,
    tokOneMember,
    tokOneDeliverySaved,
    tokOneTotalSaved,
    flexDiscount,
    flexOption: typeof meta.flex_option === "string" ? meta.flex_option : "",
    pointsDiscount,
    qualityFee,
    deliveryFee,
    total,
    paymentMethod,
    paymentMethodRaw,
    cardLast4: typeof meta.card_last4 === "string" ? meta.card_last4 : "",
  };
}

export default function OrderPaymentBreakdown({
  order,
  className = "",
  showPaymentMethod = true,
  showDivider = true,
  alwaysShowTotal = false,
  totalLabel = "Total",
  isRestaurantDashboard = false,
}: OrderPaymentBreakdownProps) {
  const breakdown = getOrderPaymentBreakdown(order);
  const {
    subtotal,
    formulaDiscount,
    formulaName,
    promoDiscount,
    promoName,
    tokOneDiscount,
    tokOneDiscountPercent,
    tokOneMember,
    tokOneDeliverySaved,
    flexDiscount,
    flexOption,
    pointsDiscount,
    qualityFee,
    deliveryFee,
    total,
    paymentMethod,
    cardLast4,
  } = breakdown;

  const hasBreakdown = alwaysShowTotal
    || subtotal > 0
    || formulaDiscount > 0
    || promoDiscount > 0
    || tokOneDiscount > 0
    || tokOneDeliverySaved > 0
    || flexDiscount > 0
    || pointsDiscount > 0
    || qualityFee > 0
    || deliveryFee > 0;

  if (!hasBreakdown) return null;

  const PaymentIcon = paymentMethod.icon;

  return (
    <div className={`${showDivider ? "border-t border-dashed pt-3" : ""} space-y-1.5 text-xs ${className}`.trim()}>
      {subtotal > 0 ? (
        <div className="flex justify-between text-muted-foreground">
          <span>Sous-total</span>
          <span>{subtotal.toFixed(2)} CHF</span>
        </div>
      ) : null}
      {formulaDiscount > 0 ? (
        <div className="flex justify-between text-emerald-600">
          <span className="flex items-center gap-1">
            <Percent className="h-3 w-3" />
            {formulaName || "Formule"}
          </span>
          <span>-{formulaDiscount.toFixed(2)} CHF</span>
        </div>
      ) : null}
      {promoDiscount > 0 ? (
        <div className="flex justify-between text-emerald-600">
          <span className="flex items-center gap-1">
            <TicketPercent className="h-3 w-3" />
            {promoName || "Promotion"}
          </span>
          <span>-{promoDiscount.toFixed(2)} CHF</span>
        </div>
      ) : null}
      {tokOneDiscount > 0 ? (
        <div className="flex justify-between text-violet-600">
          <span className="flex items-center gap-1">
            <Crown className="h-3 w-3" />
            Tok One{tokOneDiscountPercent > 0 ? ` (-${tokOneDiscountPercent.toFixed(0)}%)` : ""}
          </span>
          <span>-{tokOneDiscount.toFixed(2)} CHF</span>
        </div>
      ) : null}
      {flexDiscount > 0 ? (
        <div className="flex justify-between text-emerald-600">
          <span className="flex items-center gap-1">
            <Sparkles className="h-3 w-3" />
            Remise Flex
          </span>
          <span>-{flexDiscount.toFixed(2)} CHF</span>
        </div>
      ) : null}
      {pointsDiscount > 0 ? (
        <div className="flex justify-between text-emerald-600">
          <span className="flex items-center gap-1">
            <Gift className="h-3 w-3" />
            Points fidelite
          </span>
          <span>-{pointsDiscount.toFixed(2)} CHF</span>
        </div>
      ) : null}
      {tokOneMember && tokOneDeliverySaved > 0 ? (
        <div className="flex justify-between text-violet-600">
          <span className="flex items-center gap-1">
            <Truck className="h-3 w-3" />
            Livraison offerte (Tok One)
          </span>
          <span>-{tokOneDeliverySaved.toFixed(2)} CHF</span>
        </div>
      ) : deliveryFee > 0 ? (
        <div className="flex justify-between text-muted-foreground">
          <span className="flex items-center gap-1">
            <Truck className="h-3 w-3" />
            Livraison{flexOption ? ` (${flexOption})` : ""}
          </span>
          <span>+{deliveryFee.toFixed(2)} CHF</span>
        </div>
      ) : null}
      {qualityFee > 0 ? (
        <div className="flex justify-between text-muted-foreground">
          <span>Garantie qualite</span>
          <span>+{qualityFee.toFixed(2)} CHF</span>
        </div>
      ) : null}
      <div className="flex justify-between pt-1 font-bold text-foreground">
        <span>{totalLabel}</span>
        <span>{total.toFixed(2)} CHF</span>
      </div>
      {showPaymentMethod ? (
        <div className="flex items-center gap-1.5 pt-1 text-muted-foreground">
          <PaymentIcon className="h-3 w-3" />
          <span>Paye par {paymentMethod.label}</span>
          {cardLast4 ? (
            <span className="rounded bg-secondary px-1 py-0.5 font-mono text-[10px]">**** {cardLast4}</span>
          ) : null}
        </div>
      ) : null}

      {isRestaurantDashboard && isTokCommissionApplicable(order) ? (
        <div className="mt-4 space-y-2 rounded-lg border border-dashed border-primary/20 bg-primary/5 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Repartion (Commande specifique)</p>
          <div className="flex justify-between font-medium text-destructive">
            <span>Commission Tok (10%)</span>
            <span>-{(total * 0.10).toFixed(2)} CHF</span>
          </div>
          <div className="flex justify-between font-bold text-emerald-600">
            <span>Net Restaurateur (90%)</span>
            <span>+{(total * 0.90).toFixed(2)} CHF</span>
          </div>
        </div>
      ) : null}

      {isRestaurantDashboard && pointsDiscount > 0 ? (
        <div className="mt-2 rounded-lg border border-dashed border-violet-500/20 bg-violet-500/5 p-3">
          <div className="flex justify-between font-medium text-violet-700">
            <span className="flex items-center gap-1">
              <Gift className="h-3 w-3" />
              Miamz a rembourser par Tok
            </span>
            <span>+{pointsDiscount.toFixed(2)} CHF</span>
          </div>
          <p className="mt-1 text-[10px] text-violet-600">
            Ce montant sera ajoute au solde lors de la facturation periodique.
          </p>
        </div>
      ) : null}
    </div>
  );
}
