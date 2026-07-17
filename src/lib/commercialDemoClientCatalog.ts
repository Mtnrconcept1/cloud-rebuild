import type { CommercialDemoSnapshot } from "@/lib/commercialDemoJourney";
import { slugifyRestaurantSegment } from "@/lib/restaurantSlugs";

export function getCommercialDemoClientRestaurants(snapshot: CommercialDemoSnapshot) {
  const restaurant = snapshot.demo_restaurant;
  return [{
    ...restaurant,
    slug: slugifyRestaurantSegment(restaurant.name),
    is_active: true,
    is_demo: true,
    delivery_available: restaurant.delivery_available ?? true,
    takeaway_available: restaurant.supports_pickup ?? true,
    dine_in_available: restaurant.supports_dinein ?? true,
    reservation_enabled: restaurant.supports_reservation ?? true,
    latitude: null,
    longitude: null,
  }];
}

export function getCommercialDemoClientMenuItems(
  snapshot: CommercialDemoSnapshot,
  restaurantId?: string | null,
) {
  if (restaurantId && restaurantId !== snapshot.demo_restaurant.id) return [];

  return snapshot.catalog_items
    .filter((item) => item.is_available)
    .map((item) => ({
      ...item,
      restaurant_id: snapshot.demo_restaurant.id,
      dietary_tags: [],
      allergens: [],
    }));
}

export function getCommercialDemoAntiWasteOffers(snapshot: CommercialDemoSnapshot) {
  const today = new Date().toISOString().slice(0, 10);
  const restaurant = getCommercialDemoClientRestaurants(snapshot)[0];

  return snapshot.catalog_items
    .filter((item) => item.is_available)
    .slice(0, 3)
    .map((item, index) => ({
      id: item.id,
      title: item.name,
      original_price: Number(item.price),
      // Demo checkout pricing remains server-authoritative and comes from the
      // real menu item. No client-only discount is sent to Stripe Test.
      discounted_price: Number(item.price),
      pickup_start: "18:00",
      pickup_end: "20:00",
      available_date: today,
      image_url: item.image_url,
      quantity_available: 4 - index,
      offer_type: index === 0 ? "surprise_bag" : "regular",
      is_active: true,
      restaurants: restaurant,
    }));
}

export function getCommercialDemoFlashSales(snapshot: CommercialDemoSnapshot) {
  const today = new Date().toISOString().slice(0, 10);
  const restaurant = getCommercialDemoClientRestaurants(snapshot)[0];

  return snapshot.catalog_items
    .filter((item) => item.is_available)
    .slice(0, 4)
    .map((item) => ({
      id: item.id,
      restaurant_id: restaurant.id,
      title: item.name,
      description: item.description,
      original_price: Number(item.price),
      discounted_price: Number(item.price),
      quantity_available: 6,
      sale_date: today,
      sale_start: "00:00",
      sale_end: "23:59",
      delivery_available: restaurant.delivery_available,
      takeaway_available: restaurant.takeaway_available,
      is_active: true,
      image_url: item.image_url,
      restaurants: restaurant,
    }));
}
