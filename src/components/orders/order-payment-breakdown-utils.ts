import { Banknote, CreditCard } from "lucide-react";

export type OrderLike = {
  total_amount?: number | string | null;
  delivery_fee?: number | string | null;
  metadata?: Record<string, unknown> | null;
  order_items?: Array<{ total_price?: number | string | null }> | null;
};

const PAYMENT_LABELS: Record<string, { label: string; icon: typeof CreditCard }> = {
  card: { label: "Carte bancaire", icon: CreditCard },
  twint: { label: "TWINT", icon: CreditCard },
  cash: { label: "Espèces", icon: Banknote },
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
