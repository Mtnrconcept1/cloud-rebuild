import type {
  CommercialDemoReservation,
  CommercialDemoSnapshot,
} from "@/lib/commercialDemoJourney";

type DemoStorageEnvelope<T> = {
  version: 1;
  value: T;
};

function storageKey(sessionId: string, tool: string) {
  return `tok-commercial-demo:${sessionId}:restaurant-tool:${tool}`;
}

export function readCommercialDemoToolState<T>(sessionId: string, tool: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(storageKey(sessionId, tool)) || "null") as DemoStorageEnvelope<T> | null;
    if (!parsed || parsed.version !== 1 || !("value" in parsed)) return fallback;

    // sessionStorage is user-controlled runtime input. At minimum, preserve the
    // top-level shape expected by callers so a stale/corrupted demo payload
    // cannot crash a complete dashboard with `.map`/`.filter` errors.
    if (Array.isArray(fallback) && !Array.isArray(parsed.value)) return fallback;
    if (fallback !== null && typeof fallback === "object" && !Array.isArray(fallback)) {
      if (parsed.value === null || typeof parsed.value !== "object" || Array.isArray(parsed.value)) return fallback;
    }
    if (fallback !== null && typeof fallback !== "object" && typeof parsed.value !== typeof fallback) return fallback;

    return parsed.value;
  } catch {
    return fallback;
  }
}

export function writeCommercialDemoToolState<T>(sessionId: string, tool: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    const payload: DemoStorageEnvelope<T> = { version: 1, value };
    window.sessionStorage.setItem(storageKey(sessionId, tool), JSON.stringify(payload));
  } catch {
    // Some embedded/privacy contexts disable sessionStorage. The caller still
    // keeps the isolated state in React memory for the lifetime of the frame.
  }
}

function toIso(value: string | null | undefined, fallback: string) {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

function reservationTimestamp(reservation: CommercialDemoReservation) {
  return `${reservation.reservation_date}T${String(reservation.reservation_time || "12:00").slice(0, 8)}`;
}

export function buildCommercialDemoPerformanceRows(snapshot: CommercialDemoSnapshot) {
  const order = snapshot.order;
  const orderCreatedAt = toIso(order?.created_at, snapshot.session.created_at || new Date().toISOString());
  const orders = order ? [{
    created_at: orderCreatedAt,
    total_amount: Number(order.total_amount_cents || 0) / 100,
    status: order.payment_status === "test_paid" ? order.status : "pending_payment",
    metadata: {
      commercial_demo: true,
      payment_mode: "stripe_test",
      order_number: order.order_number,
    },
  }] : [];

  const reservations = snapshot.reservations.map((reservation) => ({
    date: reservation.reservation_date,
    time: reservation.reservation_time,
    status: reservation.status,
    party_size: reservation.party_size,
    feature: "reservation",
    total_amount: 0,
    metadata: {
      commercial_demo: true,
      reference: reservation.reference,
    },
  }));

  const reviews = buildCommercialDemoReviewSeeds(snapshot).map((review) => ({
    created_at: review.created_at,
    rating: review.rating,
  }));

  return { orders, reservations, reviews };
}

export function buildCommercialDemoCrmRows(snapshot: CommercialDemoSnapshot) {
  const paidOrder = snapshot.order?.payment_status === "test_paid" ? snapshot.order : null;
  type CustomerActivity = {
    name: string;
    order: typeof paidOrder;
    reservations: CommercialDemoReservation[];
  };
  const activities = new Map<string, CustomerActivity>();
  const identityKey = (name: string | null | undefined) => String(name || "Client Démo")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("fr") || "client-demo";
  const ensureActivity = (name: string | null | undefined) => {
    const normalizedName = String(name || "Client Démo").trim() || "Client Démo";
    const key = identityKey(normalizedName);
    const existing = activities.get(key);
    if (existing) return existing;
    const created: CustomerActivity = { name: normalizedName, order: null, reservations: [] };
    activities.set(key, created);
    return created;
  };

  if (paidOrder) ensureActivity(paidOrder.customer_name).order = paidOrder;
  snapshot.reservations.forEach((reservation) => {
    ensureActivity(reservation.customer_name).reservations.push(reservation);
  });
  if (activities.size === 0) return [];

  const rows = Array.from(activities.entries()).map(([key, activity]) => {
    const lastReservation = [...activity.reservations]
      .sort((left, right) => reservationTimestamp(right).localeCompare(reservationTimestamp(left)))[0] || null;
    const orderAt = activity.order
      ? toIso(activity.order.created_at, snapshot.session.created_at || new Date().toISOString())
      : null;
    const reservationAt = lastReservation ? reservationTimestamp(lastReservation) : null;
    const lastActivityAt = [orderAt, reservationAt]
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) || null;
    const totalSpent = activity.order ? Number(activity.order.total_amount_cents || 0) / 100 : 0;
    const favoriteItems = (activity.order?.items || []).map((item) => ({
      label: item.name,
      category: null,
      quantity: Number(item.quantity || 0),
      orders: 1,
    }));
    const preferredChannel = activity.order && activity.reservations.length > 0
      ? "mixed"
      : activity.order
        ? "orders"
        : "reservations";
    const safeIdentity = key.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "client";

    return {
      user_id: `commercial-demo-client-${snapshot.session.id}-${safeIdentity}`,
      full_name: activity.name,
      email: `${safeIdentity}@demo.tok.local`,
      phone: lastReservation?.customer_phone || null,
      city: snapshot.demo_restaurant.city || "Genève",
      address: activity.order?.delivery_address || null,
      avatar_url: null,
      loyalty_points: activity.order ? 120 : 40,
      total_orders: activity.order ? 1 : 0,
      total_reservations: activity.reservations.length,
      restaurants_count: 1,
      total_spent: totalSpent,
      avg_order_value: activity.order ? totalSpent : 0,
      first_seen_at: snapshot.session.created_at || lastActivityAt,
      last_activity_at: lastActivityAt,
      last_order_at: orderAt,
      last_reservation_at: reservationAt,
      last_restaurant_name: snapshot.demo_restaurant.name,
      preferred_channel: preferredChannel,
      preferred_service: lastReservation
        ? Number(String(lastReservation.reservation_time).slice(0, 2)) < 15 ? "lunch" : "dinner"
        : null,
      preferred_weekday: lastReservation ? Math.max(1, new Date(`${lastReservation.reservation_date}T12:00:00`).getDay() || 7) : null,
      favorite_order_hour: orderAt ? new Date(orderAt).getHours() : null,
      favorite_reservation_hour: lastReservation ? Number(String(lastReservation.reservation_time).slice(0, 2)) : null,
      favorite_items: favoriteItems,
      favorite_cuisines: snapshot.demo_restaurant.cuisine_type ? [snapshot.demo_restaurant.cuisine_type] : [],
      crm_score: Math.min(100, 35 + (activity.order ? 25 : 0) + Math.min(30, activity.reservations.length * 10)),
      total_matching_count: 0,
    };
  });

  return rows.map((row) => ({ ...row, total_matching_count: rows.length }));
}

export function buildCommercialDemoReviewReply(input: {
  rating: number;
  comment: string | null;
  brandTone?: string | null;
}) {
  const rating = Math.max(0, Math.min(10, Number(input.rating) || 0));
  const normalizedComment = String(input.comment || "").toLocaleLowerCase("fr");
  const isWarmTone = /chaleureux|convivial|amical/.test(String(input.brandTone || "").toLocaleLowerCase("fr"));
  const opening = rating >= 9
    ? "Merci beaucoup pour ce très beau retour."
    : rating >= 7
      ? "Merci d’avoir pris le temps de partager votre expérience."
      : "Merci pour votre retour sincère. Nous sommes désolés que votre expérience n’ait pas été pleinement satisfaisante.";
  const topic = normalizedComment.includes("livraison")
    ? "Votre remarque concernant la livraison est bien prise en compte par notre équipe."
    : normalizedComment.includes("service") || normalizedComment.includes("accueil")
      ? "Votre retour sur l’accueil et le service nous aide à rester attentifs à chaque détail."
      : normalizedComment.includes("plat") || normalizedComment.includes("repas") || normalizedComment.includes("menu")
        ? "Votre commentaire sur les plats sera partagé avec l’équipe en cuisine."
        : "Votre commentaire sera partagé avec toute l’équipe.";
  const closing = rating >= 7
    ? isWarmTone ? "Au plaisir de vous accueillir à nouveau très bientôt !" : "Nous espérons avoir le plaisir de vous accueillir à nouveau."
    : "Nous espérons pouvoir vous offrir une meilleure expérience lors d’une prochaine visite.";

  return `${opening} ${topic} ${closing}`;
}

export type CommercialDemoReviewSeed = {
  id: string;
  comment: string;
  rating: number;
  quality_rating: number;
  service_rating: number;
  speed_rating: number;
  created_at: string;
  restaurant_id: string;
  status: string;
  restaurant_read_at: string | null;
  restaurant_read_by: string | null;
  reported_at: string | null;
  report_reason: string | null;
  review_replies: Array<{
    id: string;
    reply_text: string;
    author_type: string;
    created_at: string;
  }>;
};

export function buildCommercialDemoReviewSeeds(snapshot: CommercialDemoSnapshot): CommercialDemoReviewSeed[] {
  const anchor = toIso(snapshot.session.created_at, "2026-07-15T10:00:00.000Z");
  const anchorTime = new Date(anchor).getTime();
  const at = (hoursAgo: number) => new Date(anchorTime - hoursAgo * 60 * 60 * 1000).toISOString();
  const restaurantId = snapshot.demo_restaurant.id;

  return [
    {
      id: `demo-review-welcome-${snapshot.session.id}`,
      comment: "Accueil chaleureux, service rapide et plats très bien présentés.",
      rating: 9,
      quality_rating: 9,
      service_rating: 10,
      speed_rating: 9,
      created_at: at(4),
      restaurant_id: restaurantId,
      status: "published",
      restaurant_read_at: null,
      restaurant_read_by: null,
      reported_at: null,
      report_reason: null,
      review_replies: [],
    },
    {
      id: `demo-review-delivery-${snapshot.session.id}`,
      comment: "Très bon repas. La livraison pourrait être un peu plus précise sur l'heure d'arrivée.",
      rating: 8,
      quality_rating: 9,
      service_rating: 8,
      speed_rating: 7,
      created_at: at(26),
      restaurant_id: restaurantId,
      status: "published",
      restaurant_read_at: at(22),
      restaurant_read_by: null,
      reported_at: null,
      report_reason: null,
      review_replies: [],
    },
    {
      id: `demo-review-signature-${snapshot.session.id}`,
      comment: "Le menu signature est excellent et le personnel a bien pris en compte notre réservation.",
      rating: 10,
      quality_rating: 10,
      service_rating: 10,
      speed_rating: 9,
      created_at: at(52),
      restaurant_id: restaurantId,
      status: "published",
      restaurant_read_at: at(50),
      restaurant_read_by: null,
      reported_at: null,
      report_reason: null,
      review_replies: [],
    },
  ];
}
