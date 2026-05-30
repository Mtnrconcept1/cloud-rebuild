export type CustomerOrderGroup = {
  groupKey: string;
  orders: any[];
  mainOrder: any;
  totalAmount: number;
  orderCount: number;
  restaurantsLabel: string;
  isMealSubscription: boolean;
  subscriptionDaysLabel: string;
  title: string;
};

function getOrderGroupKey(order: any) {
  return order?.metadata?.checkout_group_id || order?.checkout_id || order?.id;
}

function uniqueLabels(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export function buildCustomerOrderGroups(orders: any[]): CustomerOrderGroup[] {
  const grouped = orders.reduce((acc, order) => {
    const groupKey = getOrderGroupKey(order);
    if (!acc[groupKey]) acc[groupKey] = [];
    acc[groupKey].push(order);
    return acc;
  }, {} as Record<string, any[]>);

  return Object.entries(grouped).map(([groupKey, groupOrders]) => {
    const mainOrder = groupOrders[0];
    const isMealSubscription = groupOrders.some((order) => order?.metadata?.feature === "abonnement");
    const restaurants = uniqueLabels(groupOrders.map((order) => order?.restaurant?.name || "Restaurant"));
    const subscriptionDays = uniqueLabels(groupOrders.map((order) => String(order?.metadata?.subscription_day || "")));

    return {
      groupKey,
      orders: groupOrders,
      mainOrder,
      totalAmount: groupOrders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0),
      orderCount: groupOrders.length,
      restaurantsLabel: restaurants.join(", "),
      isMealSubscription,
      subscriptionDaysLabel: subscriptionDays.join(", "),
      title: isMealSubscription ? "Abonnement repas global" : (mainOrder?.order_number || `#${String(groupKey).slice(0, 8)}`),
    };
  });
}
