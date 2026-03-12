import {
  HttpError,
  authenticateRequest,
  createAdminClient,
  jsonResponse,
  requireRole,
  writeAuditLog,
} from "../_shared/auth.ts";
import {
  normalizeDeliveryProofCode,
  triggerDispatchOrder,
} from "../_shared/delivery-dispatch.ts";
import {
  enqueueNotification,
  triggerNotificationDispatch,
} from "../_shared/notifications.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ACTIVE_JOB_STATUSES = ["accepted", "arriving_pickup", "picked_up", "arriving_dropoff"];

function toIsoDate(value: Date) {
  return value.toISOString();
}

function courierDisplayName(courier: Record<string, unknown> | null) {
  if (!courier) return "Livreur Miamz";
  const first = String(courier.first_name || "").trim();
  const last = String(courier.last_name || "").trim();
  return [first, last].filter(Boolean).join(" ").trim() || "Livreur Miamz";
}

async function getCourierForActor(adminClient: ReturnType<typeof createAdminClient>, userId: string) {
  const { data: courier, error } = await adminClient
    .from("couriers")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new HttpError(500, error.message);
  return courier;
}

async function createCourierForActor(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
  now: Date,
) {
  const { data: profile } = await adminClient
    .from("profiles")
    .select("full_name, phone")
    .eq("user_id", userId)
    .maybeSingle();

  const rawFullName = String(profile?.full_name || "");
  const [firstName, ...rest] = rawFullName.split(" ").filter(Boolean);
  const lastName = rest.join(" ");

  const { data: courier, error } = await adminClient
    .from("couriers")
    .insert({
      user_id: userId,
      first_name: firstName || null,
      last_name: lastName || null,
      phone: profile?.phone || null,
      status: "approved",
      vehicle_type: "bicycle",
      is_online: false,
      updated_at: toIsoDate(now),
    })
    .select("*")
    .single();

  if (error) throw new HttpError(500, error.message);
  return courier;
}

async function ensureCourierForActor(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
  now: Date,
) {
  const existingCourier = await getCourierForActor(adminClient, userId);
  if (!existingCourier) {
    return createCourierForActor(adminClient, userId, now);
  }

  if (existingCourier.status === "pending_approval") {
    const { data: updatedCourier, error } = await adminClient
      .from("couriers")
      .update({
        status: "approved",
        updated_at: toIsoDate(now),
      })
      .eq("id", existingCourier.id)
      .select("*")
      .single();

    if (error) throw new HttpError(500, error.message);
    return updatedCourier;
  }

  return existingCourier;
}

async function getOrderContext(adminClient: ReturnType<typeof createAdminClient>, orderId: string) {
  const { data: order, error } = await adminClient
    .from("orders")
    .select("id, user_id, restaurant_id, status, total_amount, tip_amount, order_number, delivery_address, estimated_delivery_at, actual_delivered_at, metadata")
    .eq("id", orderId)
    .maybeSingle();

  if (error) throw new HttpError(500, error.message);
  if (!order) throw new HttpError(404, "Commande introuvable");

  const { data: restaurant, error: restaurantError } = await adminClient
    .from("restaurants")
    .select("id, owner_id, name, avg_prep_time_min")
    .eq("id", order.restaurant_id)
    .maybeSingle();

  if (restaurantError) throw new HttpError(500, restaurantError.message);

  return { order, restaurant };
}

async function triggerRedispatch(dispatchJobId: string, orderId: string) {
  await triggerDispatchOrder({
    dispatchJobId,
    orderId,
    round: 1,
  });
}

async function applyJobStatusTransition(input: {
  adminClient: ReturnType<typeof createAdminClient>;
  courier: any;
  job: any;
  nextStatus: string;
  now: Date;
}) {
  const { adminClient, courier, job, nextStatus, now } = input;
  const { order, restaurant } = await getOrderContext(adminClient, job.order_id);

  const jobUpdate: Record<string, unknown> = {
    status: nextStatus,
    updated_at: toIsoDate(now),
  };

  if (nextStatus === "picked_up") {
    jobUpdate.picked_up_at = toIsoDate(now);
  }
  if (nextStatus === "arriving_dropoff") {
    jobUpdate.arrived_dropoff_at = toIsoDate(now);
  }
  if (nextStatus === "delivered") {
    jobUpdate.delivered_at = toIsoDate(now);
    const startedAt = job.accepted_at || job.assigned_at || job.created_at;
    const durationMin = Math.max(
      1,
      Math.round((now.getTime() - new Date(startedAt).getTime()) / (1000 * 60)),
    );
    jobUpdate.actual_duration_minutes = durationMin;
    jobUpdate.earnings_tip = Number(order.tip_amount || 0);
  }

  const { data: updatedJob, error: updateJobError } = await adminClient
    .from("dispatch_jobs")
    .update(jobUpdate)
    .eq("id", job.id)
    .select("*")
    .single();

  if (updateJobError) throw new HttpError(500, updateJobError.message);

  const orderStatusMap: Record<string, string> = {
    arriving_pickup: "preparing",
    picked_up: "picked_up",
    arriving_dropoff: "on_the_way",
    delivered: "delivered",
  };

  const trackingStatusMap: Record<string, string> = {
    arriving_pickup: "preparing",
    picked_up: "picked_up",
    arriving_dropoff: "in_transit",
    delivered: "delivered",
  };

  const orderUpdate: Record<string, unknown> = {};
  const trackingUpdate: Record<string, unknown> = {
    order_id: order.id,
    status: trackingStatusMap[nextStatus] || "preparing",
    driver_name: courierDisplayName(courier),
    driver_phone: courier.phone,
    current_lat: courier.current_lat,
    current_lng: courier.current_lng,
  };

  if (orderStatusMap[nextStatus]) {
    orderUpdate.status = orderStatusMap[nextStatus];
  }
  if (nextStatus === "picked_up") {
    orderUpdate.picked_up_at = toIsoDate(now);
    trackingUpdate.picked_up_at = toIsoDate(now);
  }
  if (nextStatus === "delivered") {
    orderUpdate.delivered_at = toIsoDate(now);
    orderUpdate.actual_delivered_at = toIsoDate(now);
    trackingUpdate.delivered_at = toIsoDate(now);
  }

  if (Object.keys(orderUpdate).length > 0) {
    await adminClient.from("orders").update(orderUpdate).eq("id", order.id);
  }

  await adminClient.from("delivery_tracking").upsert(trackingUpdate, { onConflict: "order_id" });

  if (nextStatus === "delivered") {
    const { data: existingEarnings } = await adminClient
      .from("courier_earnings")
      .select("id")
      .eq("dispatch_job_id", job.id);

    if (!existingEarnings || existingEarnings.length === 0) {
      const earningsRows: Record<string, unknown>[] = [];
      const baseAmount = Number(updatedJob.earnings_base || job.earnings_base || 0);
      const tipAmount = Number(order.tip_amount || updatedJob.earnings_tip || 0);
      const bonusAmount = Number(updatedJob.earnings_bonus || job.earnings_bonus || 0);

      if (baseAmount > 0) {
        earningsRows.push({
          courier_id: courier.id,
          amount: baseAmount,
          type: "delivery",
          description: `Livraison ${order.order_number || order.id}`,
          dispatch_job_id: job.id,
        });
      }
      if (tipAmount > 0) {
        earningsRows.push({
          courier_id: courier.id,
          amount: tipAmount,
          type: "tip",
          description: `Pourboire ${order.order_number || order.id}`,
          dispatch_job_id: job.id,
        });
      }
      if (bonusAmount > 0) {
        earningsRows.push({
          courier_id: courier.id,
          amount: bonusAmount,
          type: "bonus",
          description: `Bonus ${order.order_number || order.id}`,
          dispatch_job_id: job.id,
        });
      }

      if (earningsRows.length > 0) {
        await adminClient.from("courier_earnings").insert(earningsRows);
      }
    }

    const previousTotalDeliveries = Number(courier.total_deliveries || 0);
    const previousAverage = Number(courier.avg_delivery_time_min || 0);
    const durationMin = Number(updatedJob.actual_duration_minutes || 0);
    const newAverage = previousTotalDeliveries <= 0
      ? durationMin
      : Math.round(((previousAverage * previousTotalDeliveries) + durationMin) / (previousTotalDeliveries + 1));

    await adminClient
      .from("couriers")
      .update({
        total_deliveries: previousTotalDeliveries + 1,
        avg_delivery_time_min: durationMin > 0 ? newAverage : courier.avg_delivery_time_min,
        updated_at: toIsoDate(now),
      })
      .eq("id", courier.id);

    if (order.user_id) {
      await enqueueNotification({
        adminClient,
        userId: order.user_id,
        title: "Commande livree",
        body: `Votre commande ${order.order_number || order.id} a ete livree.`,
        type: "order",
        category: "transactional",
        data: {
          order_id: order.id,
          dispatch_job_id: job.id,
          url: "/commandes",
        },
      });
    }

    if (restaurant?.owner_id) {
      await enqueueNotification({
        adminClient,
        userId: restaurant.owner_id,
        title: "Livraison terminee",
        body: `La commande ${order.order_number || order.id} a ete livree.`,
        type: "dispatch",
        category: "transactional",
        data: {
          order_id: order.id,
          dispatch_job_id: job.id,
          courier_id: courier.id,
          url: "/dashboard/commandes",
        },
      });
    }

    if (order.user_id || restaurant?.owner_id) {
      try {
        await triggerNotificationDispatch({ source: "courier-portal-delivered", push: true, email: true });
      } catch (error) {
        console.error("courier-portal delivery push trigger failed:", error);
      }
    }
  }

  return { updatedJob, order, restaurant };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;

  try {
    actor = await authenticateRequest(req, { allowServiceRole: false });
    requireRole(actor, ["courier", "admin"]);

    if (!actor.userId) {
      throw new HttpError(401, "Unauthorized");
    }

    const payload = await req.json().catch(() => ({}));
    const action = String(payload?.action || "").trim();
    const adminClient = actor.adminClient;
    const now = new Date();

    if (!action) {
      throw new HttpError(400, "Action requise");
    }

    if (action === "ensure_profile") {
      const courier = await ensureCourierForActor(adminClient, actor.userId, now);

      await writeAuditLog({
        adminClient,
        actor,
        request: req,
        functionName: "courier-portal",
        action: "ensure_profile",
        status: "success",
        targetEntityType: "couriers",
        targetEntityId: String(courier.id),
      });

      return jsonResponse({ courier }, 200, corsHeaders);
    }

    const courier = await ensureCourierForActor(adminClient, actor.userId, now);
    if (!courier) {
      throw new HttpError(404, "Profil coursier introuvable");
    }

    if (action === "sync_presence") {
      const requestedOnline = payload?.is_online;
      const lat = typeof payload?.lat === "number" ? payload.lat : null;
      const lng = typeof payload?.lng === "number" ? payload.lng : null;
      const heading = typeof payload?.heading === "number" ? payload.heading : null;
      const speed = typeof payload?.speed === "number" ? payload.speed : null;
      const accuracy = typeof payload?.accuracy === "number" ? payload.accuracy : null;
      const activeDispatchJobId = typeof payload?.active_dispatch_job_id === "string"
        ? payload.active_dispatch_job_id
        : null;

      if (requestedOnline === true && ["rejected", "suspended"].includes(String(courier.status || ""))) {
        throw new HttpError(403, "Le compte coursier ne peut pas passer en ligne dans son etat actuel");
      }

      const updatePayload: Record<string, unknown> = {
        updated_at: toIsoDate(now),
      };

      if (typeof requestedOnline === "boolean") {
        updatePayload.is_online = requestedOnline;
      }
      if (lat !== null && lng !== null) {
        updatePayload.current_lat = lat;
        updatePayload.current_lng = lng;
        updatePayload.last_location_at = toIsoDate(now);
      }

      const { data: updatedCourier, error: courierUpdateError } = await adminClient
        .from("couriers")
        .update(updatePayload)
        .eq("id", courier.id)
        .select("*")
        .single();

      if (courierUpdateError) throw new HttpError(500, courierUpdateError.message);

      if (lat !== null && lng !== null) {
        await adminClient.from("courier_locations").insert({
          courier_id: courier.id,
          lat,
          lng,
          heading,
          speed,
          accuracy,
          recorded_at: toIsoDate(now),
        });
      }

      let activeJob = null;
      if (activeDispatchJobId) {
        const { data } = await adminClient
          .from("dispatch_jobs")
          .select("id, order_id, status")
          .eq("id", activeDispatchJobId)
          .eq("courier_id", courier.id)
          .maybeSingle();
        activeJob = data;
      } else {
        const { data } = await adminClient
          .from("dispatch_jobs")
          .select("id, order_id, status")
          .eq("courier_id", courier.id)
          .in("status", ACTIVE_JOB_STATUSES)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        activeJob = data;
      }

      if (activeJob && lat !== null && lng !== null) {
        await adminClient
          .from("delivery_tracking")
          .upsert({
            order_id: activeJob.order_id,
            status: activeJob.status === "arriving_dropoff" || activeJob.status === "picked_up" ? "in_transit" : "preparing",
            driver_name: courierDisplayName(updatedCourier),
            driver_phone: updatedCourier.phone,
            current_lat: lat,
            current_lng: lng,
          }, { onConflict: "order_id" });
      }

      await writeAuditLog({
        adminClient,
        actor,
        request: req,
        functionName: "courier-portal",
        action: "sync_presence",
        status: "success",
        targetEntityType: "couriers",
        targetEntityId: String(courier.id),
        metadata: {
          is_online: typeof requestedOnline === "boolean" ? requestedOnline : updatedCourier.is_online,
          active_dispatch_job_id: activeJob?.id || null,
        },
      });

      return jsonResponse({ courier: updatedCourier }, 200, corsHeaders);
    }

    if (action === "save_profile") {
      const allowedVehicleTypes = new Set(["bicycle", "scooter", "car", "walk"]);
      const vehicleType = String(payload?.vehicle_type || courier.vehicle_type || "bicycle");
      const rawShifts = Array.isArray(payload?.shifts) ? payload.shifts : [];

      if (!allowedVehicleTypes.has(vehicleType)) {
        throw new HttpError(400, "Type de vehicule invalide");
      }

      const normalizedShifts = rawShifts.map((shift) => {
        const dayOfWeek = Number((shift as Record<string, unknown>)?.day_of_week);
        const startTime = String((shift as Record<string, unknown>)?.start_time || "").slice(0, 5);
        const endTime = String((shift as Record<string, unknown>)?.end_time || "").slice(0, 5);

        if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
          throw new HttpError(400, "Jour de disponibilite invalide");
        }
        if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
          throw new HttpError(400, "Horaire invalide");
        }
        if (endTime <= startTime) {
          throw new HttpError(400, "L'heure de fin doit etre apres l'heure de debut");
        }

        return {
          courier_id: courier.id,
          day_of_week: dayOfWeek,
          start_time: startTime,
          end_time: endTime,
          zone: null,
        };
      }).sort((a, b) => {
        if (a.day_of_week !== b.day_of_week) return a.day_of_week - b.day_of_week;
        return a.start_time.localeCompare(b.start_time);
      });

      const { data: updatedCourier, error: updateCourierError } = await adminClient
        .from("couriers")
        .update({
          first_name: String(payload?.first_name || "").trim() || null,
          last_name: String(payload?.last_name || "").trim() || null,
          phone: String(payload?.phone || "").trim() || null,
          vehicle_type: vehicleType,
          license_plate: String(payload?.license_plate || "").trim() || null,
          iban: String(payload?.iban || "").trim() || null,
          status: courier.status === "pending_approval" ? "approved" : courier.status,
          updated_at: toIsoDate(now),
        })
        .eq("id", courier.id)
        .select("*")
        .single();

      if (updateCourierError) throw new HttpError(500, updateCourierError.message);

      const { error: deleteShiftsError } = await adminClient
        .from("courier_shifts")
        .delete()
        .eq("courier_id", courier.id);

      if (deleteShiftsError) throw new HttpError(500, deleteShiftsError.message);

      let savedShifts: any[] = [];
      if (normalizedShifts.length > 0) {
        const { data, error: insertShiftsError } = await adminClient
          .from("courier_shifts")
          .insert(normalizedShifts)
          .select("*");

        if (insertShiftsError) throw new HttpError(500, insertShiftsError.message);
        savedShifts = data || [];
      }

      await writeAuditLog({
        adminClient,
        actor,
        request: req,
        functionName: "courier-portal",
        action: "save_profile",
        status: "success",
        targetEntityType: "couriers",
        targetEntityId: String(courier.id),
        metadata: {
          shift_count: normalizedShifts.length,
        },
      });

      return jsonResponse({ courier: updatedCourier, shifts: savedShifts }, 200, corsHeaders);
    }

    if (action === "respond_attempt") {
      const attemptId = String(payload?.attempt_id || "").trim();
      const decision = String(payload?.decision || "").trim();

      if (!attemptId || !["accept", "decline"].includes(decision)) {
        throw new HttpError(400, "Tentative ou decision invalide");
      }

      const { data: attempt, error: attemptError } = await adminClient
        .from("dispatch_attempts")
        .select("*")
        .eq("id", attemptId)
        .maybeSingle();

      if (attemptError) throw new HttpError(500, attemptError.message);
      if (!attempt || attempt.courier_id !== courier.id) {
        throw new HttpError(404, "Proposition de mission introuvable");
      }
      if (attempt.status !== "pending") {
        throw new HttpError(409, "Cette proposition a deja ete traitee");
      }

      const { data: job, error: jobError } = await adminClient
        .from("dispatch_jobs")
        .select("*")
        .eq("id", attempt.dispatch_job_id)
        .maybeSingle();

      if (jobError) throw new HttpError(500, jobError.message);
      if (!job) throw new HttpError(404, "Mission introuvable");

      const { order, restaurant } = await getOrderContext(adminClient, job.order_id);

      if (decision === "decline") {
        const { error: declineError } = await adminClient
          .from("dispatch_attempts")
          .update({
            status: "declined",
            responded_at: toIsoDate(now),
          })
          .eq("id", attempt.id);

        if (declineError) throw new HttpError(500, declineError.message);

        const { data: remainingPendingAttempts } = await adminClient
          .from("dispatch_attempts")
          .select("id")
          .eq("dispatch_job_id", job.id)
          .eq("status", "pending")
          .limit(1);

        if (!remainingPendingAttempts || remainingPendingAttempts.length === 0) {
          await triggerRedispatch(job.id, order.id);
        }

        await writeAuditLog({
          adminClient,
          actor,
          request: req,
          functionName: "courier-portal",
          action: "respond_attempt",
          status: "success",
          targetEntityType: "dispatch_attempts",
          targetEntityId: String(attempt.id),
          metadata: { decision, dispatch_job_id: job.id, order_id: order.id },
        });

        return jsonResponse({ status: "declined" }, 200, corsHeaders);
      }

      if (courier.status !== "approved") {
        throw new HttpError(403, "Le compte coursier doit etre approuve avant d accepter une mission");
      }

      const { data: activeJob } = await adminClient
        .from("dispatch_jobs")
        .select("id")
        .eq("courier_id", courier.id)
        .in("status", ACTIVE_JOB_STATUSES)
        .neq("id", job.id)
        .limit(1)
        .maybeSingle();

      if (activeJob) {
        throw new HttpError(409, "Une mission est deja en cours pour ce coursier");
      }

      const estimatedArrival = order.estimated_delivery_at
        || new Date(now.getTime() + ((restaurant?.avg_prep_time_min || 20) + 15) * 60 * 1000).toISOString();

      const { error: acceptAttemptError } = await adminClient
        .from("dispatch_attempts")
        .update({
          status: "accepted",
          responded_at: toIsoDate(now),
        })
        .eq("id", attempt.id);

      if (acceptAttemptError) throw new HttpError(500, acceptAttemptError.message);

      await adminClient
        .from("dispatch_attempts")
        .update({
          status: "cancelled",
          responded_at: toIsoDate(now),
        })
        .eq("dispatch_job_id", job.id)
        .eq("status", "pending")
        .neq("id", attempt.id);

      const { data: updatedJob, error: updateJobError } = await adminClient
        .from("dispatch_jobs")
        .update({
          courier_id: courier.id,
          status: "accepted",
          assigned_at: job.assigned_at || toIsoDate(now),
          accepted_at: toIsoDate(now),
          earnings_base: job.earnings_base || attempt.estimated_earnings || 0,
          updated_at: toIsoDate(now),
        })
        .eq("id", job.id)
        .select("*")
        .single();

      if (updateJobError) throw new HttpError(500, updateJobError.message);

      await adminClient
        .from("orders")
        .update({
          courier_id: courier.id,
          estimated_delivery_at: estimatedArrival,
        })
        .eq("id", order.id);

      await adminClient
        .from("delivery_tracking")
        .upsert({
          order_id: order.id,
          status: "preparing",
          driver_name: courierDisplayName(courier),
          driver_phone: courier.phone,
          current_lat: courier.current_lat,
          current_lng: courier.current_lng,
          estimated_arrival: estimatedArrival,
        }, { onConflict: "order_id" });

      if (order.user_id) {
        await enqueueNotification({
          adminClient,
          userId: order.user_id,
          title: "Livreur assigne",
          body: `${courierDisplayName(courier)} prend en charge votre commande ${order.order_number || order.id}.`,
          type: "dispatch",
          category: "transactional",
          data: {
            order_id: order.id,
            dispatch_job_id: job.id,
            courier_id: courier.id,
            url: "/commandes",
          },
        });
      }

      if (restaurant?.owner_id) {
        await enqueueNotification({
          adminClient,
          userId: restaurant.owner_id,
          title: "Livreur confirme",
          body: `${courierDisplayName(courier)} se dirige vers ${restaurant.name || "le restaurant"}.`,
          type: "dispatch",
          category: "transactional",
          data: {
            order_id: order.id,
            dispatch_job_id: job.id,
            courier_id: courier.id,
            url: "/dashboard/commandes",
          },
        });
      }

      if (order.user_id || restaurant?.owner_id) {
        try {
          await triggerNotificationDispatch({ source: "courier-portal-assigned", push: true, email: true });
        } catch (error) {
          console.error("courier-portal assignment push trigger failed:", error);
        }
      }

      await writeAuditLog({
        adminClient,
        actor,
        request: req,
        functionName: "courier-portal",
        action: "respond_attempt",
        status: "success",
        targetEntityType: "dispatch_attempts",
        targetEntityId: String(attempt.id),
        metadata: { decision, dispatch_job_id: job.id, order_id: order.id },
      });

      return jsonResponse({ status: "accepted", dispatch_job: updatedJob }, 200, corsHeaders);
    }

    if (action === "verify_delivery_proof") {
      const dispatchJobId = String(payload?.dispatch_job_id || "").trim();
      const proofCode = normalizeDeliveryProofCode(payload?.proof_code);
      const verificationMethod = payload?.verification_method === "manual_code" ? "manual_code" : "qr";

      if (!dispatchJobId || proofCode.length !== 6) {
        throw new HttpError(400, "Mission ou code de verification invalide");
      }

      const { data: job, error: jobError } = await adminClient
        .from("dispatch_jobs")
        .select("*")
        .eq("id", dispatchJobId)
        .eq("courier_id", courier.id)
        .maybeSingle();

      if (jobError) throw new HttpError(500, jobError.message);
      if (!job) throw new HttpError(404, "Mission introuvable");
      if (!["picked_up", "arriving_dropoff"].includes(String(job.status || ""))) {
        throw new HttpError(409, "Le code client est disponible uniquement avant la remise");
      }

      const { order } = await getOrderContext(adminClient, job.order_id);
      const orderMetadata = typeof order.metadata === "object" && !Array.isArray(order.metadata) ? order.metadata : {};
      const expectedCode = normalizeDeliveryProofCode(orderMetadata.delivery_proof_code);

      if (!expectedCode) {
        throw new HttpError(409, "Aucun code de remise n'est configure pour cette commande");
      }
      if (proofCode !== expectedCode) {
        throw new HttpError(409, "Code client invalide");
      }

      const verifiedAt = toIsoDate(now);
      const updatedMetadata = {
        ...orderMetadata,
        delivery_proof_verified_at: verifiedAt,
        delivery_proof_method: verificationMethod,
      };

      await adminClient
        .from("orders")
        .update({
          metadata: updatedMetadata,
          updated_at: verifiedAt,
        })
        .eq("id", order.id);

      const { data: proof, error: proofError } = await adminClient
        .from("proof_of_delivery")
        .upsert({
          dispatch_job_id: job.id,
          courier_id: courier.id,
          verification_method: verificationMethod,
          verification_payload: {
            code: proofCode,
            verification_method: verificationMethod,
          },
          verified_at: verifiedAt,
          recorded_at: verifiedAt,
          notes: verificationMethod === "manual_code" ? "Validation code client" : "Validation QR client",
        }, { onConflict: "dispatch_job_id" })
        .select("*")
        .single();

      if (proofError) throw new HttpError(500, proofError.message);

      const { updatedJob } = await applyJobStatusTransition({
        adminClient,
        courier,
        job,
        nextStatus: "delivered",
        now,
      });

      await writeAuditLog({
        adminClient,
        actor,
        request: req,
        functionName: "courier-portal",
        action: "verify_delivery_proof",
        status: "success",
        targetEntityType: "proof_of_delivery",
        targetEntityId: String(proof.id),
        metadata: { dispatch_job_id: job.id, order_id: order.id },
      });

      return jsonResponse({ dispatch_job: updatedJob, proof }, 200, corsHeaders);
    }

    if (action === "update_job_status") {
      const dispatchJobId = String(payload?.dispatch_job_id || "").trim();
      const nextStatus = String(payload?.status || "").trim();

      const allowedTransitions: Record<string, string[]> = {
        accepted: ["arriving_pickup", "picked_up"],
        arriving_pickup: ["picked_up"],
        picked_up: ["arriving_dropoff", "delivered"],
        arriving_dropoff: ["delivered"],
      };

      if (!dispatchJobId || !nextStatus) {
        throw new HttpError(400, "Mission ou statut invalide");
      }

      const { data: job, error: jobError } = await adminClient
        .from("dispatch_jobs")
        .select("*")
        .eq("id", dispatchJobId)
        .eq("courier_id", courier.id)
        .maybeSingle();

      if (jobError) throw new HttpError(500, jobError.message);
      if (!job) throw new HttpError(404, "Mission introuvable");

      const currentStatus = String(job.status || "");
      if (currentStatus === nextStatus) {
        return jsonResponse({ dispatch_job: job }, 200, corsHeaders);
      }
      if (!allowedTransitions[currentStatus]?.includes(nextStatus)) {
        throw new HttpError(409, `Transition invalide: ${currentStatus} -> ${nextStatus}`);
      }

      if (nextStatus === "delivered") {
        const { data: proof } = await adminClient
          .from("proof_of_delivery")
          .select("id")
          .eq("dispatch_job_id", job.id)
          .eq("courier_id", courier.id)
          .maybeSingle();

        if (!proof) {
          throw new HttpError(409, "Scannez le QR client avant de confirmer la livraison");
        }
      }

      const { updatedJob, order } = await applyJobStatusTransition({
        adminClient,
        courier,
        job,
        nextStatus,
        now,
      });

      await writeAuditLog({
        adminClient,
        actor,
        request: req,
        functionName: "courier-portal",
        action: "update_job_status",
        status: "success",
        targetEntityType: "dispatch_jobs",
        targetEntityId: String(job.id),
        metadata: { from: currentStatus, to: nextStatus, order_id: order.id },
      });

      return jsonResponse({ dispatch_job: updatedJob }, 200, corsHeaders);
    }

    throw new HttpError(400, "Action inconnue");
  } catch (error) {
    console.error("courier-portal error:", error);
    await writeAuditLog({
      adminClient: actor?.adminClient || createAdminClient(),
      actor,
      request: req,
      functionName: "courier-portal",
      action: "invoke",
      status: "failure",
      targetEntityType: "couriers",
      errorMessage: error instanceof Error ? error.message : "Erreur interne",
    });
    if (error instanceof HttpError) {
      return jsonResponse({ error: error.message }, error.status, corsHeaders);
    }
    const message = error instanceof Error ? error.message : "Erreur interne";
    return jsonResponse({ error: message }, 500, corsHeaders);
  }
});
