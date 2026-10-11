// Shared by the checkout and its preview. Amounts are allocated in cents so
// neither food nor delivery can subsidise a discount belonging to the other.
export type DiscountOffer = { amount: number; delivery?: boolean };
export type DiscountInput = {
  subtotal: number;
  deliveryFee: number;
  qualityFee?: number;
  formula: number;
  promotion: DiscountOffer;
  code: DiscountOffer & { stackable: boolean };
  tokOne: number;
  tokOneDelivery: number;
  miamzDelivery: number;
  points: number;
  flex: number;
};

const cents = (value: number) => Number.isFinite(value) ? Math.max(0, Math.round(value * 100)) : 0;

export function allocateCheckoutDiscounts(input: DiscountInput) {
  const subtotal = cents(input.subtotal);
  const delivery = cents(input.deliveryFee);
  const quality = cents(input.qualityFee ?? 0);
  const allocate = (source: "promo_code" | "restaurant_promotion" | null, exclusive = false) => {
    let foodLeft = subtotal;
    let deliveryLeft = delivery;
    const takeFood = (amount: number) => {
      const used = Math.min(foodLeft, cents(amount)); foodLeft -= used; return used / 100;
    };
    const takeDelivery = (amount: number) => {
      const used = Math.min(deliveryLeft, cents(amount)); deliveryLeft -= used; return used / 100;
    };
    const offer = source === "promo_code" ? input.code : input.promotion;
    const promo = source ? (offer.delivery ? takeDelivery(offer.amount) : takeFood(offer.amount)) : 0;
    const formula = exclusive ? 0 : takeFood(input.formula);
    const tokOne = exclusive ? 0 : takeFood(input.tokOne);
    const flex = exclusive ? 0 : takeFood(input.flex);
    const tokOneDelivery = exclusive ? 0 : takeDelivery(input.tokOneDelivery);
    const miamzDelivery = exclusive ? 0 : takeDelivery(input.miamzDelivery);
    const points = exclusive ? 0 : Math.min(cents(input.points), foodLeft + deliveryLeft + quality) / 100;
    const totalCents = foodLeft + deliveryLeft + quality - cents(points);
    return {
      source: promo > 0 ? source : null, promo, formula, tokOne, flex,
      tokOneDelivery, miamzDelivery, points,
      discount: (subtotal + delivery + quality - totalCents) / 100,
      total: totalCents / 100,
    };
  };
  const automatic = allocate(input.promotion.amount > 0 ? "restaurant_promotion" : null);
  if (input.code.amount <= 0) return automatic;
  const withCode = allocate("promo_code", !input.code.stackable);
  // Never replace a customer's larger automatic saving with a worse code.
  return withCode.discount >= automatic.discount ? withCode : automatic;
}
