import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  HttpError,
  authenticateRequest,
  createAdminClient,
  jsonResponse,
  requireRole,
  writeAuditLog,
} from "../_shared/auth.ts";
import { getDeliveryDispatchConfig } from "../_shared/delivery-dispatch.ts";
import {
  enqueueNotification,
  triggerNotificationDispatch,
} from "../_shared/notifications.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";

const ACTIVE_DISPATCH_STATUSES = ["accepted", "arriving_pickup", "picked_up", "arriving_dropoff"];

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toStringValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function toNumberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getOrderSequence(order: any) {
  const orderNumber = toStringValue(order?.order_number);
  if (orderNumber) {
    const suffixMatch = /-(\d+)$/.exec(orderNumber);
    if (suffixMatch) return Number(suffixMatch[1]);
  }

  const createdAt = toStringValue(order?.created_at);
  if (createdAt) return Date.parse(createdAt);
  return Number.MAX_SAFE_INTEGER;
}

async function buildDispatchRouteContext(
  supabaseAdmin: ReturnType<typeof createClient>,
  input: {
    order: any;
    restaurant: any;
  },
) {
  const metadata = asObject(input.order?.metadata) || {};
  const checkoutGroupId = toStringValue(metadata.checkout_group_id);
  const deliveryAddress = toStringValue(input.order?.delivery_address) || "";
  const deliveryLat = toNumberValue(metadata.delivery_lat);
  const deliveryLng = toNumberValue(metadata.delivery_lng);

  const siblingOrders = new Map<string, any>();
  siblingOrders.set(String(input.order.id), {
    ...input.order,
    restaurants: input.restaurant,
  });

  if (checkoutGroupId) {
    const { data: groupedOrders, error } = await supabaseAdmin
      .from("orders")
      .select(`
        id,
        order_number,
        created_at,
        restaurant_id,
        delivery_address,
        metadata,
        restaurants(
          id,
          name,
          address,
          latitude,
          longitude
        )
      `)
      .filter("metadata->>checkout_group_id", "eq", checkoutGroupId);

    if (error) throw error;

    for (const groupedOrder of groupedOrders || []) {
      if (groupedOrder?.id) {
        siblingOrders.set(String(groupedOrder.id), groupedOrder);
      }
    }
  }

  const orderedPickups = Array.from(siblingOrders.values())
    .sort((left, right) => getOrderSequence(left) - getOrderSequence(right))
    .reduce((acc: any[], order: any) => {
      const restaurant = Array.isArray(order.restaurants) ? order.restaurants[0] : order.restaurants;
      if (!restaurant?.id || acc.some((item) => item.restaurant_id === restaurant.id)) {
        return acc;
      }

      acc.push({
        restaurant_id: restaurant.id,
        restaurant_name: restaurant.name || "Restaurant",
        address: restaurant.address || "",
        latitude: toNumberValue(restaurant.latitude),
        longitude: toNumberValue(restaurant.longitude),
        order_id: order.id || null,
        order_number: order.order_number || null,
      });

      return acc;
    }, []);

  const routeSteps = orderedPickups.map((pickup, index) => ({
    id: `pickup-${pickup.restaurant_id}`,
    type: "pickup",
    label: orderedPickups.length > 1 ? `Retrait ${index + 1}` : "Retrait",
    address: pickup.address,
    latitude: pickup.latitude,
    longitude: pickup.longitude,
    restaurant_name: pickup.restaurant_name,
    order_id: pickup.order_id,
    order_number: pickup.order_number,
    step_index: index + 1,
  }));

  if (deliveryLat !== null && deliveryLng !== null) {
    routeSteps.push({
      id: "dropoff",
      type: "dropoff",
      label: "Livraison",
      address: deliveryAddress,
      latitude: deliveryLat,
      longitude: deliveryLng,
      step_index: routeSteps.length + 1,
    });
  }

  return {
    multiRestaurant: orderedPickups.length > 1,
    routeSteps,
    pickupLat: orderedPickups[0]?.latitude ?? toNumberValue(input.restaurant?.latitude),
    pickupLng: orderedPickups[0]?.longitude ?? toNumberValue(input.restaurant?.longitude),
    dropoffLat: deliveryLat,
    dropoffLng: deliveryLng,
    restaurantAddress: toStringValue(input.restaurant?.address),
  };
}

async function queueCourierNotification(
  supabaseAdmin: ReturnType<typeof createClient>,
  input: {
    userId: string;
    title: string;
    body: string;
    data: Record<string, unknown>;
  },
) {
  return enqueueNotification({
    adminClient: supabaseAdmin,
    userId: input.userId,
    title: input.title,
    body: input.body,
    type: "dispatch",
    category: "transactional",
    data: input.data,
    requestedChannels: {
      in_app: true,
      push: true,
      email: false,
    },
  });
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;

  try {
    actor = await authenticateRequest(req, { allowSchedulerSecret: true });
    requireRole(actor, ["admin"]);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { order_id, dispatch_job_id, radius_km = null, round = 1 } = await req.json();

    if (!order_id && !dispatch_job_id) {
      await writeAuditLog({
        adminClient: actor.adminClient,
        actor,
        request: req,
        functionName: "dispatch-order",
        action: "offer_dispatch_job",
        status: "failure",
        targetEntityType: "dispatch_jobs",
        errorMessage: "order_id or dispatch_job_id required",
      });
      return jsonResponse({ error: "order_id or dispatch_job_id required" }, 400, corsHeaders);
    }

    let jobId = dispatch_job_id;
    let job: any = null;

    if (dispatch_job_id) {
      const { data } = await supabaseAdmin
        .from("dispatch_jobs")
        .select("*, orders(id, restaurant_id, delivery_address, total_amount, user_id, order_number, metadata, created_at)")
        .eq("id", dispatch_job_id)
        .maybeSingle();
      job = data;
    } else {
      const { data: existing } = await supabaseAdmin
        .from("dispatch_jobs")
        .select("*, orders(id, restaurant_id, delivery_address, total_amount, user_id, order_number, metadata, created_at)")
        .eq("order_id", order_id)
        .not("status", "in", "(delivered,cancelled,expired)")
        .maybeSingle();

      if (existing) {
        job = existing;
        jobId = existing.id;
      } else {
        const { data: newJob, error } = await supabaseAdmin
          .from("dispatch_jobs")
          .insert({ order_id, status: "searching" })
          .select("*, orders(id, restaurant_id, delivery_address, total_amount, user_id, order_number, metadata, created_at)")
          .single();

        if (error) throw error;
        job = newJob;
        jobId = newJob.id;
      }
    }

    if (!job) {
      await writeAuditLog({
        adminClient: actor.adminClient,
        actor,
        request: req,
        functionName: "dispatch-order",
        action: "offer_dispatch_job",
        status: "failure",
        targetEntityType: "dispatch_jobs",
        targetEntityId: String(jobId || order_id || ""),
        errorMessage: "Dispatch job not found",
      });
      return jsonResponse({ error: "Dispatch job not found" }, 404, corsHeaders);
    }

    if (ACTIVE_DISPATCH_STATUSES.includes(String(job.status || "")) && job.courier_id) {
      return jsonResponse({
        status: "already_assigned",
        dispatch_job_id: jobId,
        courier_id: job.courier_id,
      }, 200, corsHeaders);
    }

    const orderMetadata = typeof job.orders?.metadata === "object" && !Array.isArray(job.orders?.metadata)
      ? job.orders.metadata
      : {};
    const dispatchConfig = getDeliveryDispatchConfig(
      orderMetadata,
      round,
      typeof radius_km === "number" ? radius_km : null,
    );

    await supabaseAdmin
      .from("dispatch_jobs")
      .update({ status: "searching", updated_at: new Date().toISOString() })
      .eq("id", jobId);

    const { data: pendingAttempts } = await supabaseAdmin
      .from("dispatch_attempts")
      .select("id")
      .eq("dispatch_job_id", jobId)
      .eq("status", "pending")
      .limit(1);

    if (pendingAttempts && pendingAttempts.length > 0) {
      return jsonResponse({
        status: "awaiting_response",
        dispatch_job_id: jobId,
        round,
      }, 200, corsHeaders);
    }

    const restaurantId = job.orders?.restaurant_id;
    const { data: restaurant } = await supabaseAdmin
      .from("restaurants")
      .select("latitude, longitude, name, address, owner_id")
      .eq("id", restaurantId)
      .maybeSingle();

    if (!restaurant?.latitude || !restaurant?.longitude) {
      await supabaseAdmin
        .from("dispatch_jobs")
        .update({ status: "no_courier", updated_at: new Date().toISOString() })
        .eq("id", jobId);

      await writeAuditLog({
        adminClient: actor.adminClient,
        actor,
        request: req,
        functionName: "dispatch-order",
        action: "offer_dispatch_job",
        status: "failure",
        targetEntityType: "dispatch_jobs",
        targetEntityId: String(jobId || order_id || ""),
        errorMessage: "Restaurant has no coordinates",
      });

      return jsonResponse({ error: "Restaurant has no coordinates" }, 400, corsHeaders);
    }

    const routeContext = await buildDispatchRouteContext(supabaseAdmin, {
      order: job.orders,
      restaurant,
    });

    await supabaseAdmin
      .from("dispatch_jobs")
      .update({
        pickup_lat: routeContext.pickupLat,
        pickup_lng: routeContext.pickupLng,
        dropoff_lat: routeContext.dropoffLat,
        dropoff_lng: routeContext.dropoffLng,
        route_geometry: {
          steps: routeContext.routeSteps,
          multi_restaurant: routeContext.multiRestaurant,
          updated_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    const { data: previousAttempts } = await supabaseAdmin
      .from("dispatch_attempts")
      .select("courier_id")
      .eq("dispatch_job_id", jobId);

    const excludedCourierIds = new Set((previousAttempts || []).map((attempt: any) => String(attempt.courier_id)));

    const { data: nearbyCouriers, error: courierError } = await supabaseAdmin
      .rpc("find_nearby_couriers", {
        p_lat: restaurant.latitude,
        p_lng: restaurant.longitude,
        p_radius_km: dispatchConfig.radiusKm,
        p_limit: Math.max(dispatchConfig.courierFanout * 3, 10),
      });

    if (courierError) throw courierError;

    const availableCouriers = (nearbyCouriers || []).filter(
      (courier: any) => !excludedCourierIds.has(String(courier.courier_id)),
    );

    if (availableCouriers.length === 0) {
      if (round >= 3) {
        await supabaseAdmin
          .from("dispatch_jobs")
          .update({ status: "no_courier", updated_at: new Date().toISOString() })
          .eq("id", jobId);

        const { data: admins } = await supabaseAdmin
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin")
          .limit(5);

        for (const admin of admins || []) {
          await queueCourierNotification(supabaseAdmin, {
            userId: admin.user_id,
            title: "Aucun livreur disponible",
            body: `Commande de ${restaurant.name} - aucun livreur trouve apres ${round} tentatives.`,
            data: { order_id, dispatch_job_id: jobId, status: "no_courier" },
          });
        }

        if (restaurant?.owner_id) {
          await enqueueNotification({
            adminClient: supabaseAdmin,
            userId: restaurant.owner_id,
            title: "Aucun livreur disponible",
            body: `La commande ${job.orders?.order_number || job.order_id} n'a trouve aucun livreur pour le moment.`,
            type: "dispatch",
            category: "transactional",
            data: {
              order_id: order_id || job.order_id || null,
              dispatch_job_id: jobId,
              restaurant_id: restaurantId,
              status: "no_courier",
              url: "/dashboard/commandes",
            },
          });
        }

        try {
          await triggerNotificationDispatch({ source: "dispatch-order-no-courier", push: true, email: true });
        } catch (error) {
          console.error("dispatch-order no-courier notification trigger failed:", error);
        }

        await writeAuditLog({
          adminClient: actor.adminClient,
          actor,
          request: req,
          functionName: "dispatch-order",
          action: "offer_dispatch_job",
          status: "success",
          targetEntityType: "dispatch_jobs",
          targetEntityId: String(jobId || order_id || ""),
          metadata: { round, radius_km: dispatchConfig.radiusKm, outcome: "no_courier" },
        });

        return jsonResponse({
          status: "no_courier",
          message: `No couriers available after ${round} rounds`,
        }, 200, corsHeaders);
      }

      await writeAuditLog({
        adminClient: actor.adminClient,
        actor,
        request: req,
        functionName: "dispatch-order",
        action: "offer_dispatch_job",
        status: "success",
        targetEntityType: "dispatch_jobs",
        targetEntityId: String(jobId || order_id || ""),
        metadata: { round, radius_km: dispatchConfig.radiusKm, outcome: "searching" },
      });

      return jsonResponse({
        status: "searching",
        message: `No couriers in round ${round}, will retry with larger radius`,
        round,
      }, 200, corsHeaders);
    }

    const selectedCouriers = availableCouriers.slice(0, dispatchConfig.courierFanout);
    const attemptsPayload = selectedCouriers.map((courier: any) => {
      const distanceKm = Number(courier.distance_km || 1);
      const baseFee = 5.0;
      const distanceBonus = Math.max(0, (distanceKm - 1) * 1.5);
      const estimatedEarnings = Math.round((baseFee + distanceBonus) * 100) / 100;

      return {
        dispatch_job_id: jobId,
        courier_id: courier.courier_id,
        status: "pending",
        timeout_seconds: dispatchConfig.attemptTimeoutSeconds,
        distance_to_pickup_meters: Math.round(distanceKm * 1000),
        estimated_earnings: estimatedEarnings,
      };
    });

    const { data: attempts, error: attemptError } = await supabaseAdmin
      .from("dispatch_attempts")
      .insert(attemptsPayload)
      .select("id, courier_id, estimated_earnings, distance_to_pickup_meters");

    if (attemptError) throw attemptError;

    for (const courier of selectedCouriers) {
      const attempt = (attempts || []).find((item: any) => item.courier_id === courier.courier_id);
      if (!attempt) continue;

      const distanceKm = Number(courier.distance_km || 0);
      const estimatedEarnings = Number(attempt.estimated_earnings || 0);
      const windowLabel = String(orderMetadata.delivery_window_label || dispatchConfig.windowLabel);
      const scheduledLabel = String(orderMetadata.scheduled_delivery_label || "");
      const itemsSummary = String(orderMetadata.items_summary || "");
      const deliveryAddress = String(job.orders?.delivery_address || "");

      await queueCourierNotification(supabaseAdmin, {
        userId: courier.user_id,
        title: "Nouvelle course dans votre zone",
        body: [
          restaurant.name,
          itemsSummary,
          deliveryAddress,
          scheduledLabel || windowLabel,
        ].filter(Boolean).join(" - "),
        data: {
          dispatch_job_id: jobId,
          dispatch_attempt_id: attempt.id,
          order_id: order_id || job.order_id || null,
          order_number: job.orders?.order_number || order_id || null,
          restaurant_name: restaurant.name,
          restaurant_address: routeContext.restaurantAddress || null,
          restaurant_lat: routeContext.pickupLat,
          restaurant_lng: routeContext.pickupLng,
          delivery_address: deliveryAddress || null,
          delivery_lat: routeContext.dropoffLat,
          delivery_lng: routeContext.dropoffLng,
          total_amount: job.orders?.total_amount || null,
          items_count: orderMetadata.items_count || null,
          items_summary: itemsSummary || null,
          distance_km: distanceKm,
          estimated_earnings: estimatedEarnings,
          delivery_window_label: windowLabel,
          scheduled_delivery_label: scheduledLabel || null,
          multi_restaurant: routeContext.multiRestaurant,
          route_steps: routeContext.routeSteps,
          delivery_proof_required: true,
          url: "/courier/jobs",
        },
      });
    }

    if (selectedCouriers.length > 0) {
      try {
        await triggerNotificationDispatch({ source: "dispatch-order", push: true, email: false });
      } catch (error) {
        console.error("dispatch-order push trigger failed:", error);
      }
    }

    await writeAuditLog({
      adminClient: actor.adminClient,
      actor,
      request: req,
      functionName: "dispatch-order",
      action: "offer_dispatch_job",
      status: "success",
      targetEntityType: "dispatch_jobs",
      targetEntityId: String(jobId || order_id || ""),
      metadata: {
        order_id: order_id || job?.order_id || null,
        dispatch_job_id: jobId,
        round,
        radius_km: dispatchConfig.radiusKm,
        courier_count: selectedCouriers.length,
      },
    });

    return jsonResponse({
      status: "offered",
      dispatch_job_id: jobId,
      attempts: attempts || [],
      courier_count: selectedCouriers.length,
      radius_km: dispatchConfig.radiusKm,
      round,
    }, 200, corsHeaders);
  } catch (error) {
    console.error("dispatch-order error:", error);
    await writeAuditLog({
      adminClient: actor?.adminClient || createAdminClient(),
      actor,
      request: req,
      functionName: "dispatch-order",
      action: "offer_dispatch_job",
      status: "failure",
      targetEntityType: "dispatch_jobs",
      errorMessage: error instanceof Error ? error.message : "Erreur interne",
    });
    if (error instanceof HttpError) {
      return jsonResponse({ error: error.message }, error.status, corsHeaders);
    }
    const msg = error instanceof Error ? error.message : "Erreur interne";
    return jsonResponse({ error: msg }, 500, corsHeaders);
  }
});
