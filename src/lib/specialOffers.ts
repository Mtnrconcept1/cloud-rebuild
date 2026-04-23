type QuantityValue = number | string | null | undefined;

type AntiWasteLike = {
  available_date?: string | null;
  pickup_end?: string | null;
  quantity_available?: QuantityValue;
  is_active?: boolean | null;
};

type FlashSaleLike = {
  sale_date?: string | null;
  sale_start?: string | null;
  sale_end?: string | null;
  quantity_available?: QuantityValue;
  is_active?: boolean | null;
};

function parseQuantity(value: QuantityValue): number {
  const quantity = Number(value ?? 0);
  return Number.isFinite(quantity) ? quantity : 0;
}

function isFiniteDate(date: Date): boolean {
  return Number.isFinite(date.getTime());
}

function toIsoDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function hasRemainingSpecialOfferStock(quantity: QuantityValue): boolean {
  return parseQuantity(quantity) > 0;
}

export function isSpecialOfferSoldOut(offer: { quantity_available?: QuantityValue }): boolean {
  return !hasRemainingSpecialOfferStock(offer.quantity_available);
}

export function isSpecialOfferEffectivelyActive(offer: {
  is_active?: boolean | null;
  quantity_available?: QuantityValue;
}): boolean {
  return offer.is_active === true && hasRemainingSpecialOfferStock(offer.quantity_available);
}

export function isAntiWasteOfferPubliclyVisible(offer: AntiWasteLike, now = new Date()): boolean {
  if (offer.is_active !== true) return false;
  if (!hasRemainingSpecialOfferStock(offer.quantity_available)) return false;
  if (!offer.available_date) return false;

  const today = toIsoDateKey(now);
  if (offer.available_date < today) return false;

  if (offer.available_date === today && offer.pickup_end) {
    const pickupEnd = new Date(`${offer.available_date}T${offer.pickup_end}`);
    if (isFiniteDate(pickupEnd) && pickupEnd.getTime() <= now.getTime()) {
      return false;
    }
  }

  return true;
}

export function isFlashSalePubliclyVisible(offer: FlashSaleLike, now = new Date()): boolean {
  if (offer.is_active !== true) return false;
  if (!hasRemainingSpecialOfferStock(offer.quantity_available)) return false;
  if (!offer.sale_date || !offer.sale_start || !offer.sale_end) return false;

  const start = new Date(`${offer.sale_date}T${offer.sale_start}`);
  const end = new Date(`${offer.sale_date}T${offer.sale_end}`);

  if (!isFiniteDate(start) || !isFiniteDate(end)) return false;

  return start.getTime() <= now.getTime() && end.getTime() > now.getTime();
}
