import Stripe from "npm:stripe@18.5.0";

import {
  enqueueNotification,
  triggerNotificationDispatch,
} from "./notifications.ts";
import { recordReservationChargeIfMissing } from "./payment-transactions.ts";

type LoggerLike = {
  error?: (event: string, data?: Record<string, unknown>) => void;
  warn?: (event: string, data?: Record<string, unknown>) => void;
};

type ChefTableReservationRow = {
  id: string;
  restaurant_id: string;
  restaurant_name: string;
  date: string;
  time: string;
  party_size: number;
  status: string;
  total_amount: number;
  created_at: string;
  notes: string | null;
  metadata: Record<string, unknown>;
  preorder_items: Array<Record<string, unknown>>;
};

type ChefTableDropRow = {
  id: string;
  restaurant_id: string;
  chef_name: string | null;
  dish_name: string;
  description: string | null;
  price: number;
  original_price: number | null;
  drop_time: string;
  remaining_portions: number;
  restaurants?: {
    owner_id?: string | null;
    name?: string | null;
  } | null;
};

type ExistingChefReservationRow = {
  id: string;
  restaurant_id: string;
  date: string;
  time: string;
  party_size: number;
  status: string;
  total_amount: number;
  created_at: string;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  preorder_items: Array<Record<string, unknown>> | null;
};

function parseMoney(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildReservationNote(input: {
  count: number;
  subtotal: number;
  total: number;
  paymentMethod: string;
  cardBrand?: string | null;
  cardLast4?: string | null;
}) {
  const parts = [
    `[La Table du Chef] ${input.count} experience(s) reservee(s)`,
    `Sous-total: ${input.subtotal.toFixed(2)} CHF`,
    `Total: ${input.total.toFixed(2)} CHF`,
    `Paiement: ${input.paymentMethod} (paye)`,
  ];

  if (input.cardBrand || input.cardLast4) {
    parts.push(
      `Carte: ${[input.cardBrand, input.cardLast4 ? `**** ${input.cardLast4}` : ""].filter(Boolean).join(" ")}`,
    );
  }

  return parts.join(" - ");
}

function buildReservationKey(input: { restaurantId: string; date: string; time: string }) {
  return `${input.restaurantId}:${input.date}:${input.time}`;
}

function normalizeExistingReservation(
  reservation: ExistingChefReservationRow,
  restaurantName: string,
): ChefTableReservationRow {
  return {
    id: reservation.id,
    restaurant_id: reservation.restaurant_id,
    restaurant_name: restaurantName,
    date: reservation.date,
    time: reservation.time,
    party_size: reservation.party_size,
    status: reservation.status,
    total_amount: Number(reservation.total_amount || 0),
    created_at: reservation.created_at,
    notes: reservation.notes,
    metadata: (reservation.metadata || {}) as Record<string, unknown>,
    preorder_items: (reservation.preorder_items || []) as Array<Record<string, unknown>>,
  };
}

async function findExistingChefReservation(input: {
  adminClient: any;
  userId: string;
  group: {
    restaurantId: string;
    restaurantName: string;
    date: string;
    time: string;
  };
  sessionId: string;
}) {
  const { adminClient, userId, group, sessionId } = input;
  const { data, error } = await adminClient
    .from("reservations")
    .select("id, restaurant_id, date, time, party_size, status, total_amount, created_at, notes, metadata, preorder_items")
    .eq("user_id", userId)
    .eq("restaurant_id", group.restaurantId)
    .eq("feature", "chefs_table")
    .eq("date", group.date)
    .eq("time", group.time)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) return null;

  const metadata = (data.metadata || {}) as Record<string, unknown>;
  const isPaid = Boolean(metadata.paid) || Number(data.total_amount || 0) > 0;
  const sessionMatches = String(metadata.checkout_session_id || "") === sessionId;

  if (!isPaid && !sessionMatches) return null;
  return normalizeExistingReservation(data as ExistingChefReservationRow, group.restaurantName);
}

function buildChefTableLineItems(lineItems: Stripe.ApiList<Stripe.LineItem>) {
  return lineItems.data
    .map((lineItem) => {
      const product = lineItem.price?.product && typeof lineItem.price.product === "object"
        ? lineItem.price.product
        : null;
      const productMetadata = product?.metadata || {};
      const quantity = Math.max(1, Number(lineItem.quantity || 1));
      const unitAmount = parseMoney(lineItem.price?.unit_amount, 0) / 100;
      const dropId = String(productMetadata.chef_table_drop_id || "");
      const dropTime = String(productMetadata.drop_time || "");
      const restaurantId = String(productMetadata.restaurant_id || "");
      const serviceDate = dropTime ? dropTime.slice(0, 10) : "";
      const serviceTime = dropTime ? dropTime.slice(11, 16) : "";

      return {
        dropId,
        dropTime,
        restaurantId,
        serviceDate,
        serviceTime,
        quantity,
        unitPrice: unitAmount,
        name: lineItem.description || product?.name || "Experience La Table du Chef",
      };
    })
    .filter((item) => item.dropId && item.restaurantId && item.serviceDate && item.serviceTime);
}

async function decrementDropPortions(input: {
  adminClient: any;
  dropId: string;
  quantity: number;
}) {
  const { data: dropRow, error: fetchError } = await input.adminClient
    .from("chef_table_drops")
    .select("remaining_portions")
    .eq("id", input.dropId)
    .maybeSingle();

  if (fetchError) throw fetchError;

  const remaining = Number(dropRow?.remaining_portions || 0);
  if (remaining < input.quantity) {
    throw new Error("Certaines experiences La Table du Chef ne sont plus disponibles.");
  }

  const { error: updateError } = await input.adminClient
    .from("chef_table_drops")
    .update({
      remaining_portions: remaining - input.quantity,
    })
    .eq("id", input.dropId)
    .eq("remaining_portions", remaining);

  if (updateError) throw updateError;
}

async function incrementDropPortions(input: {
  adminClient: any;
  dropId: string;
  quantity: number;
}) {
  const { data: dropRow, error: fetchError } = await input.adminClient
    .from("chef_table_drops")
    .select("remaining_portions")
    .eq("id", input.dropId)
    .maybeSingle();

  if (fetchError) throw fetchError;

  const remaining = Number(dropRow?.remaining_portions || 0);
  const { error: updateError } = await input.adminClient
    .from("chef_table_drops")
    .update({
      remaining_portions: remaining + input.quantity,
    })
    .eq("id", input.dropId);

  if (updateError) throw updateError;
}

async function hasHeldDropPortion(input: {
  adminClient: any;
  sessionId: string;
  dropId: string;
  quantity: number;
}) {
  const { data, error } = await input.adminClient
    .from("chef_table_checkout_holds")
    .select("id")
    .eq("checkout_session_id", input.sessionId)
    .eq("drop_id", input.dropId)
    .eq("status", "held")
    .gte("quantity", input.quantity)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data?.id);
}

async function consumeHeldDropPortions(input: {
  adminClient: any;
  sessionId: string;
  drops: Array<{ dropId: string; quantity: number }>;
  log?: LoggerLike;
}) {
  for (const drop of input.drops) {
    const hasHold = await hasHeldDropPortion({
      adminClient: input.adminClient,
      sessionId: input.sessionId,
      dropId: drop.dropId,
      quantity: drop.quantity,
    });

    if (!hasHold) continue;

    const { data, error } = await input.adminClient.rpc("consume_chef_table_checkout_hold", {
      p_session_id: input.sessionId,
      p_drop_id: drop.dropId,
      p_quantity: drop.quantity,
    });

    if (error) throw error;
    if (data !== true) {
      input.log?.warn?.("chef_table_hold_missing_on_consume", {
        session_id: input.sessionId,
        drop_id: drop.dropId,
      });
    }
  }
}

export async function finalizeChefsTableCheckout(input: {
  adminClient: any;
  session: Stripe.Checkout.Session;
  userId: string;
  cardBrand?: string | null;
  cardLast4?: string | null;
  log?: LoggerLike;
  shouldDispatchNotifications?: boolean;
  fetchLineItems: () => Promise<Stripe.ApiList<Stripe.LineItem>>;
}) {
  const {
    adminClient,
    session,
    userId,
    cardBrand,
    cardLast4,
    log,
    shouldDispatchNotifications = true,
    fetchLineItems,
  } = input;

  const paymentMethod = String(session.metadata?.payment_method_label || "card");
  const lineItems = await fetchLineItems();
  const reservationItems = buildChefTableLineItems(lineItems);
  if (reservationItems.length === 0) {
    return { reservations: [] as ChefTableReservationRow[], newlyFinalized: false };
  }

  const { data: existingReservationsRaw } = await adminClient
    .from("reservations")
    .select("id, restaurant_id, date, time, party_size, status, total_amount, created_at, notes, metadata, preorder_items")
    .eq("user_id", userId)
    .eq("feature", "chefs_table")
    .filter("metadata->>checkout_session_id", "eq", session.id)
    .order("created_at", { ascending: true });

  const existingReservations = (existingReservationsRaw || []) as ExistingChefReservationRow[];

  const existingReservationMap = new Map(
    existingReservations.map((reservation) => [
      buildReservationKey({
        restaurantId: reservation.restaurant_id,
        date: reservation.date,
        time: reservation.time,
      }),
      reservation,
    ]),
  );

  const dropIds = Array.from(new Set(reservationItems.map((item) => item.dropId)));
  const { data: dropsRaw, error: dropsError } = await adminClient
    .from("chef_table_drops")
    .select("id, restaurant_id, chef_name, dish_name, description, price, original_price, drop_time, remaining_portions, restaurants(owner_id, name)")
    .in("id", dropIds);

  if (dropsError) throw dropsError;

  const dropMap = new Map<string, ChefTableDropRow>(
    ((dropsRaw || []) as ChefTableDropRow[]).map((drop) => [drop.id, drop]),
  );

  const groupedReservations = new Map<string, {
    reservationKey: string;
    restaurantId: string;
    restaurantName: string;
    date: string;
    time: string;
    partySize: number;
    total: number;
    drops: Array<{ dropId: string; quantity: number }>;
    preorderItems: Array<Record<string, unknown>>;
  }>();

  for (const item of reservationItems) {
    const drop = dropMap.get(item.dropId);
    if (!drop) {
      throw new Error("Drop La Table du Chef introuvable.");
    }

    const reservationKey = buildReservationKey({
      restaurantId: item.restaurantId,
      date: item.serviceDate,
      time: item.serviceTime,
    });
    const existingGroup = groupedReservations.get(reservationKey);
    const preorderItem = {
      chef_table_drop_id: item.dropId,
      name: drop.dish_name || item.name,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      total_price: item.unitPrice * item.quantity,
      source: "chef_table_drop",
      metadata: {
        chef_name: drop.chef_name,
        drop_time: drop.drop_time,
        restaurant_id: drop.restaurant_id,
      },
    };

    if (existingGroup) {
      existingGroup.partySize += item.quantity;
      existingGroup.total += item.unitPrice * item.quantity;
      existingGroup.drops.push({ dropId: item.dropId, quantity: item.quantity });
      existingGroup.preorderItems.push(preorderItem);
      continue;
    }

    groupedReservations.set(reservationKey, {
      reservationKey,
      restaurantId: item.restaurantId,
      restaurantName: String(drop.restaurants?.name || "Restaurant partenaire"),
      date: item.serviceDate,
      time: item.serviceTime,
      partySize: item.quantity,
      total: item.unitPrice * item.quantity,
      drops: [{ dropId: item.dropId, quantity: item.quantity }],
      preorderItems: [preorderItem],
    });
  }

  const finalizedReservations: ChefTableReservationRow[] = [];
  let newlyFinalized = false;

  for (const group of groupedReservations.values()) {
    const existingReservation = existingReservationMap.get(group.reservationKey);

    if (existingReservation) {
      finalizedReservations.push(normalizeExistingReservation(existingReservation, group.restaurantName));
      await consumeHeldDropPortions({
        adminClient,
        sessionId: session.id,
        drops: group.drops,
        log,
      });

      await recordReservationChargeIfMissing({
        adminClient,
        userId,
        sessionId: session.id,
        paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null,
        amount: group.total,
        currency: (session.currency || "chf").toLowerCase(),
        reservationId: existingReservation.id,
        feature: "chefs_table",
        metadata: {
          restaurant_id: group.restaurantId,
          payment_method: paymentMethod,
          card_brand: cardBrand || null,
          card_last4: cardLast4 || null,
        },
        log,
      });
      continue;
    }

    const existingReservationByKey = await findExistingChefReservation({
      adminClient,
      userId,
      group,
      sessionId: session.id,
    });

    if (existingReservationByKey) {
      finalizedReservations.push(existingReservationByKey);
      await consumeHeldDropPortions({
        adminClient,
        sessionId: session.id,
        drops: group.drops,
        log,
      });
      await recordReservationChargeIfMissing({
        adminClient,
        userId,
        sessionId: session.id,
        paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null,
        amount: group.total,
        currency: (session.currency || "chf").toLowerCase(),
        reservationId: existingReservationByKey.id,
        feature: "chefs_table",
        metadata: {
          restaurant_id: group.restaurantId,
          payment_method: paymentMethod,
          card_brand: cardBrand || null,
          card_last4: cardLast4 || null,
        },
        log,
      });
      continue;
    }

    const decrementedDrops: Array<{ dropId: string; quantity: number }> = [];
    const heldDrops: Array<{ dropId: string; quantity: number }> = [];

    try {
      for (const dropAllocation of group.drops) {
        const alreadyHeld = await hasHeldDropPortion({
          adminClient,
          sessionId: session.id,
          dropId: dropAllocation.dropId,
          quantity: dropAllocation.quantity,
        });

        if (alreadyHeld) {
          heldDrops.push(dropAllocation);
          continue;
        }

        await decrementDropPortions({
          adminClient,
          dropId: dropAllocation.dropId,
          quantity: dropAllocation.quantity,
        });
        decrementedDrops.push(dropAllocation);
      }

      const reservationPayload = {
        _internal_user_id: userId,
        feature: "chefs_table",
        preorder_items: group.preorderItems,
        total_amount: group.total,
        payment_method: paymentMethod,
        checkout_session_id: session.id,
        paid: true,
        card_brand: cardBrand || null,
        card_last4: cardLast4 || null,
        order_reference: String(session.metadata?.order_reference || `CT-${Date.now()}`),
        stripe_payment_intent: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null,
      };

      const note = buildReservationNote({
        count: group.partySize,
        subtotal: group.total,
        total: group.total,
        paymentMethod,
        cardBrand: cardBrand || null,
        cardLast4: cardLast4 || null,
      });

      const { data: reservationId, error: reservationError } = await adminClient.rpc(
        "validate_and_create_reservation",
        {
          p_restaurant_id: group.restaurantId,
          p_date: group.date,
          p_time: group.time,
          p_party_size: group.partySize,
          p_feature: "chefs_table",
          p_metadata: reservationPayload,
          p_notes: note,
        },
      );

      if (reservationError || !reservationId) {
        const fallbackReservation = await findExistingChefReservation({
          adminClient,
          userId,
          group,
          sessionId: session.id,
        });

        if (fallbackReservation) {
          for (const dropAllocation of decrementedDrops) {
            await incrementDropPortions({
              adminClient,
              dropId: dropAllocation.dropId,
              quantity: dropAllocation.quantity,
            });
          }
          decrementedDrops.length = 0;
          finalizedReservations.push(fallbackReservation);
          await recordReservationChargeIfMissing({
            adminClient,
            userId,
            sessionId: session.id,
            paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null,
            amount: group.total,
            currency: (session.currency || "chf").toLowerCase(),
            reservationId: fallbackReservation.id,
            feature: "chefs_table",
            metadata: {
              restaurant_id: group.restaurantId,
              payment_method: paymentMethod,
              card_brand: cardBrand || null,
              card_last4: cardLast4 || null,
            },
            log,
          });
          continue;
        }

        throw new Error(reservationError?.message || "Impossible de creer la reservation La Table du Chef.");
      }

      const { error: statusUpdateError } = await adminClient
        .from("reservations")
        .update({
          status: "confirmed",
          total_amount: group.total,
          payment_method: paymentMethod,
          preorder_items: group.preorderItems,
          notes: note,
          metadata: reservationPayload,
          updated_at: new Date().toISOString(),
        })
        .eq("id", reservationId);

      if (statusUpdateError) {
        log?.warn?.("chefs_table_status_update_failed", {
          reservation_id: reservationId,
          message: statusUpdateError.message,
        });
      }

      await recordReservationChargeIfMissing({
        adminClient,
        userId,
        sessionId: session.id,
        paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null,
        amount: group.total,
        currency: (session.currency || "chf").toLowerCase(),
        reservationId,
        feature: "chefs_table",
        metadata: {
          restaurant_id: group.restaurantId,
          payment_method: paymentMethod,
          card_brand: cardBrand || null,
          card_last4: cardLast4 || null,
        },
        log,
      });

      await consumeHeldDropPortions({
        adminClient,
        sessionId: session.id,
        drops: heldDrops,
        log,
      });

      finalizedReservations.push({
        id: reservationId,
        restaurant_id: group.restaurantId,
        restaurant_name: group.restaurantName,
        date: group.date,
        time: group.time,
        party_size: group.partySize,
        status: "confirmed",
        total_amount: group.total,
        created_at: new Date().toISOString(),
        notes: note,
        metadata: reservationPayload,
        preorder_items: group.preorderItems,
      });
      newlyFinalized = true;

      const restaurantOwnerId = dropMap.get(group.drops[0].dropId)?.restaurants?.owner_id || null;
      if (restaurantOwnerId) {
        try {
          await enqueueNotification({
            adminClient,
            userId: restaurantOwnerId,
            title: "Nouvelle reservation La Table du Chef",
            body: `${group.partySize} experience(s) reservee(s) pour le ${group.date} a ${group.time} - ${group.total.toFixed(2)} CHF`,
            type: "reservation",
            category: "transactional",
            data: {
              reservation_id: reservationId,
              restaurant_id: group.restaurantId,
              restaurant_name: group.restaurantName,
              total_amount: group.total,
              feature: "chefs_table",
              url: "/dashboard/reservations",
            },
          });
        } catch (error) {
          log?.error?.("chefs_table_restaurant_notification_failed", {
            reservation_id: reservationId,
            message: error instanceof Error ? error.message : "unknown",
          });
        }
      }

      try {
        await enqueueNotification({
          adminClient,
          userId,
          title: "Reservation La Table du Chef confirmee",
          body: `Votre experience chez ${group.restaurantName} est confirmee le ${group.date} a ${group.time}.`,
          type: "reservation",
          category: "transactional",
          data: {
            reservation_id: reservationId,
            restaurant_id: group.restaurantId,
            restaurant_name: group.restaurantName,
            total_amount: group.total,
            feature: "chefs_table",
            url: "/reservations",
          },
        });
      } catch (error) {
        log?.error?.("chefs_table_customer_notification_failed", {
          reservation_id: reservationId,
          message: error instanceof Error ? error.message : "unknown",
        });
      }
    } catch (error) {
      for (const dropAllocation of decrementedDrops) {
        try {
          await incrementDropPortions({
            adminClient,
            dropId: dropAllocation.dropId,
            quantity: dropAllocation.quantity,
          });
        } catch (rollbackError) {
          log?.error?.("chefs_table_portion_rollback_failed", {
            dropId: dropAllocation.dropId,
            message: rollbackError instanceof Error ? rollbackError.message : "unknown",
          });
        }
      }
      throw error;
    }
  }

  finalizedReservations.sort((left, right) => {
    const leftKey = `${left.date}T${left.time}`;
    const rightKey = `${right.date}T${right.time}`;
    return leftKey.localeCompare(rightKey);
  });

  if (newlyFinalized && shouldDispatchNotifications) {
    try {
      await triggerNotificationDispatch({ source: "chefs-table-finalized", push: true, email: true });
    } catch (error) {
      log?.error?.("chefs_table_notification_failed", {
        message: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  return {
    reservations: finalizedReservations,
    newlyFinalized,
  };
}
