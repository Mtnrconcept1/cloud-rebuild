/** Fictional, deterministic data used only by the isolated preview exporter. */
export const PREVIEW_DATE = "2026-10-21T11:00:00.000Z";
export const PREVIEW_RESTAURANT_ID = "00000000-0000-4000-8000-000000000042";
export const PREVIEW_USER_ID = "00000000-0000-4000-8000-000000000024";
export const previewRestaurant = {
  id: PREVIEW_RESTAURANT_ID, name: "La Table d’Octobre", city: "Genève",
  address: "Place de la Démonstration 12", postal_code: "1200", cuisine_type: "Cuisine de saison",
  description: "Un restaurant fictif pour découvrir le nouveau design des espaces TOK.",
  phone: "+41 00 000 00 00", email: "restaurant@example.invalid", website: "",
  image_url: "/images/dashboard/restaurant-ambience.webp", cover_image_url: "/images/dashboard/restaurant-ambience.webp",
  rating: 4.8, review_count: 84, status: "active", is_active: true, owner_id: PREVIEW_USER_ID,
  is_open: true, is_verified: true, is_partner: true, delivery_enabled: true, takeaway_enabled: true,
  reservation_enabled: true, opening_hours: {}, amenities: [], social_links: {},
  restaurant_subscription: { plan: "premium", status: "active", plan_record: { slug: "premium", name: "Premium" } },
};
export const previewProfile = {
  id: PREVIEW_USER_ID, user_id: PREVIEW_USER_ID, full_name: "Camille Martin",
  first_name: "Camille", last_name: "Martin", email: "camille@example.invalid", phone: "+41 00 000 00 00",
  city: "Genève", address: "Adresse de démonstration", avatar_url: null,
  loyalty_points: 1240, current_tier: "gourmet", created_at: "2026-01-01T12:00:00Z",
};
export const previewMenu = [
  { id: "menu-1", name: "Salade du marché", category: "Entrées", description: "Légumes de saison, herbes fraîches et vinaigrette maison", price: 16, image_url: "/images/salade-du-marche.jpg" },
  { id: "menu-2", name: "Calzone de la maison", category: "Plats", description: "Mozzarella, tomates confites et basilic", price: 26, image_url: "/images/calzone.webp" },
  { id: "menu-3", name: "Panna cotta", category: "Desserts", description: "Vanille et coulis de fruits de saison", price: 11, image_url: "/images/pannacotta.webp" },
].map(row => ({ ...row, restaurant_id: PREVIEW_RESTAURANT_ID, is_available: true, created_at: PREVIEW_DATE }));
export const previewReservations = [
  { id: "reservation-1", time: "12:30:00", party_size: 2, status: "confirmed", order_reference: "DEMO-101", notes: "Table en terrasse si possible", metadata: { service: "lunch" } },
  { id: "reservation-2", time: "13:00:00", party_size: 4, status: "pending", order_reference: "DEMO-102", notes: "", metadata: { service: "lunch" } },
  { id: "reservation-3", time: "19:30:00", party_size: 3, status: "confirmed", order_reference: "DEMO-103", notes: "", metadata: { service: "dinner" } },
].map(row => ({ ...row, date: "2026-10-21", created_at: PREVIEW_DATE, user_id: PREVIEW_USER_ID,
  restaurant_id: PREVIEW_RESTAURANT_ID, restaurants: previewRestaurant, restaurant: previewRestaurant,
  payment_status: "unpaid", total_amount: 0, feature: "reservation", profiles: previewProfile,
}));
export const previewOrders = [
  { id: "order-1", order_number: "DEMO-2048", status: "preparing", total_amount: 42 },
  { id: "order-2", order_number: "DEMO-2047", status: "ready", total_amount: 68 },
  { id: "order-3", order_number: "DEMO-2046", status: "delivered", total_amount: 53 },
].map(row => ({ ...row, created_at: PREVIEW_DATE, updated_at: PREVIEW_DATE,
  restaurant_id: PREVIEW_RESTAURANT_ID, user_id: PREVIEW_USER_ID, payment_status: "paid",
  delivery_fee: 0, delivery_address: null, restaurant: previewRestaurant, restaurants: previewRestaurant,
  customer: previewProfile, profiles: previewProfile, notes: "Données fictives de revue visuelle",
  metadata: { type: "pickup", stripe_session_id: "cs_test_visual_preview" },
  order_items: [{ id: `${row.id}-item`, name: "Calzone de la maison", quantity: 1, unit_price: 26, total_price: 26, menu_item_id: "menu-2" }],
}));
const previewReviews = [{ id: "review-1", user_id: PREVIEW_USER_ID, restaurant_id: PREVIEW_RESTAURANT_ID,
  rating: 5, comment: "Une belle expérience, du début à la fin.", created_at: "2026-10-18T18:00:00Z",
  restaurant_response: "Merci pour votre visite !", restaurants: previewRestaurant, profiles: previewProfile,
}];

const tables: Record<string, unknown[]> = {
  restaurants: [previewRestaurant], profiles: [previewProfile], user_profiles: [previewProfile],
  menu_items: previewMenu, reservations: previewReservations, orders: previewOrders, reviews: previewReviews,
  favorites: [{ id: "favorite-1", user_id: PREVIEW_USER_ID, restaurant_id: PREVIEW_RESTAURANT_ID, restaurants: previewRestaurant }],
  restaurant_media: [{ id: "media-1", restaurant_id: PREVIEW_RESTAURANT_ID, media_url: previewRestaurant.image_url, media_type: "image", is_cover: true, position: 0, created_at: PREVIEW_DATE, alt_text: "Décor fictif de démonstration" }],
  tok_workforce_settings: [{ restaurant_id: PREVIEW_RESTAURANT_ID, enabled: true, canton: "GE", max_weekly_hours: 42, min_vacation_days: 20 }],
  notification_preferences: [{ user_id: PREVIEW_USER_ID, email_enabled: true, push_enabled: true, in_app_enabled: true }],
  loyalty_transactions: [{ id: "loyalty-1", user_id: PREVIEW_USER_ID, points: 120, type: "earned", description: "Repas de démonstration", created_at: PREVIEW_DATE }],
};

export const previewReadLog: string[] = [];
export const previewMutationLog: string[] = [];

function query(table: string, fixtureRows?: unknown[]) {
  let single = false;
  let from = 0;
  let to = Infinity;
  const source = fixtureRows || tables[table] || [];
  const result = () => ({ data: single ? source[0] ?? null : source.slice(from, to + 1), error: null, count: source.length });
  const chain: Record<string, unknown> = {};
  const proxy: unknown = new Proxy(chain, { get: (_, key) => {
    if (key === "then") return (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject);
    if (["insert", "update", "delete", "upsert"].includes(String(key))) return () => {
      previewMutationLog.push(`${table}.${String(key)}`);
      throw new Error(`Mutation forbidden in visual export: ${table}.${String(key)}`);
    };
    if (key === "single" || key === "maybeSingle") return () => { single = true; return proxy; };
    if (key === "range") return (start: number, end: number) => { from = start; to = end; return proxy; };
    if (key === "limit") return (limit: number) => { to = limit - 1; return proxy; };
    return () => proxy;
  } });
  return proxy;
}

const authUser = { id: PREVIEW_USER_ID, email: previewProfile.email, user_metadata: { full_name: previewProfile.full_name } };
export const previewSupabase = {
  from: (table: string) => { previewReadLog.push(table); return query(table); },
  rpc: (name: string) => {
    previewReadLog.push(`rpc:${name}`);
    if (name === "get_restaurant_comparison") return Promise.resolve({ data: { my_revenue: 8260, my_orders: 186, my_avg_rating: 4.8, avg_revenue: 7100, avg_orders: 162, avg_rating: 4.3 }, error: null });
    if (name === "get_customer_orders_dashboard") return query(`rpc:${name}`, previewOrders);
    if (/customer.*contact|reservation.*contact/.test(name)) return query(`rpc:${name}`, [previewProfile]);
    return query(`rpc:${name}`, []);
  },
  auth: {
    getSession: async () => ({ data: { session: { user: authUser, access_token: "visual-preview-fixture" } }, error: null }),
    getUser: async () => ({ data: { user: authUser }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    oauth: { listGrants: async () => ({ data: [], error: null }) },
  },
  channel: () => { const channel = { on: () => channel, subscribe: () => channel, unsubscribe() {} }; return channel; },
  removeChannel() {},
  functions: { invoke: async (name: string, options?: { body?: { action?: string } }) => {
    previewReadLog.push(`function:${name}`);
    if (name === "manage-restaurant-subscription" && options?.body?.action === "commission_mandate_status") {
      return { data: { ok: true, eligible: false, accepted: false, accepted_at: null, subscription_status: "active", payment_method_ready: false, auto_debit_enabled: false }, error: null };
    }
    if (name === "daily-dish-ai" && options?.body?.action === "status") {
      return { data: { access: { enabled: true, plan: "premium", reason: null }, settings: { is_enabled: false, timezone: "Europe/Zurich", target_food_cost_bps: 3000 }, run: null, variants: [], demo: false }, error: null };
    }
    // No request is sent. Data-loading functions see an explicit empty response.
    return { data: { items: [], entries: [], campaigns: [], results: [], memories: [], preferences: [], suggestions: [], total: 0 }, error: null };
  } },
  storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: previewRestaurant.image_url } }), createSignedUrl: async () => ({ data: null, error: null }) }) },
};
