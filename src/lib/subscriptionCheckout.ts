type CartLikeItem = {
  restaurantId: string;
  metadata?: Record<string, any>;
};

export function getCartItemOrderGroupKey(item: CartLikeItem) {
  if (item.metadata?.is_meal_subscription) {
    const deliveryDate = item.metadata.delivery_date || item.metadata.subscription_day || "jour";
    const deliveryTime = item.metadata.delivery_time || item.metadata.preferred_time || "12:00";
    return `${item.restaurantId}|abonnement|${deliveryDate}|${deliveryTime}`;
  }

  return item.restaurantId;
}

export function getMealSubscriptionOrderMetadata(items: CartLikeItem[]) {
  const subscriptionItem = items.find((item) => item.metadata?.is_meal_subscription);
  if (!subscriptionItem) return {};

  const metadata = subscriptionItem.metadata || {};
  const deliveryDate = metadata.delivery_date || null;
  const deliveryTime = metadata.delivery_time || metadata.preferred_time || null;

  return {
    subscription_day: metadata.subscription_day || null,
    subscription_delivery_key: metadata.subscription_delivery_key || null,
    delivery_schedule_mode: deliveryDate && deliveryTime ? "scheduled" : undefined,
    delivery_date: deliveryDate,
    delivery_time: deliveryTime,
    notification_timing: "same_day",
  };
}
