import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  HttpError,
  authenticateRequest,
  createAdminClient,
  jsonResponse,
  requireRole,
  writeAuditLog,
} from "../_shared/auth.ts";
import {
  getEstimatedArrivalTime,
  shouldDispatchDeliveryNow,
  triggerDispatchOrder,
} from "../_shared/delivery-dispatch.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";

/**
 * Cron-triggered function that:
 * 1. Expires timed-out dispatch attempts
 * 2. Re-dispatches jobs that have no pending attempts
 * Should be called every 30 seconds via pg_cron or external scheduler.
 */
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
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const now = new Date();
    let expired = 0;
    let redispatched = 0;
    let scheduledDispatched = 0;

    const { data: scheduledOrders, error: scheduledOrdersError } = await supabaseAdmin
      .from("orders")
      .select("id, scheduled_at, delivery_address, status, metadata")
      .not("scheduled_at", "is", null)
      .not("delivery_address", "is", null)
      .in("status", ["preparing"]);

    if (scheduledOrdersError) throw scheduledOrdersError;

    for (const order of scheduledOrders || []) {
      const scheduledAt = typeof order.scheduled_at === "string" ? order.scheduled_at : null;
      const metadata = order.metadata && typeof order.metadata === "object" && !Array.isArray(order.metadata)
        ? order.metadata
        : {};

      if (!shouldDispatchDeliveryNow(metadata, scheduledAt, now)) {
        continue;
      }

      const { data: existingDispatch } = await supabaseAdmin
        .from("dispatch_jobs")
        .select("id")
        .eq("order_id", order.id)
        .not("status", "in", "(delivered,cancelled,expired)")
        .limit(1);

      if (existingDispatch && existingDispatch.length > 0) {
        continue;
      }

      await supabaseAdmin.from("delivery_tracking").upsert({
        order_id: order.id,
        status: "preparing",
        estimated_arrival: getEstimatedArrivalTime(metadata, scheduledAt, now),
      });

      const response = await triggerDispatchOrder({
        orderId: String(order.id),
      });

      if (response.ok) {
        scheduledDispatched++;
      } else {
        console.error(`Scheduled dispatch failed for order ${order.id}:`, response.body);
      }
    }

    // Step 1: Find and expire timed-out attempts
    const { data: pendingAttempts, error: fetchError } = await supabaseAdmin
      .from("dispatch_attempts")
      .select("id, dispatch_job_id, courier_id, offered_at, timeout_seconds")
      .eq("status", "pending");

    if (fetchError) throw fetchError;

    for (const attempt of pendingAttempts || []) {
      const offeredAt = new Date(attempt.offered_at);
      const timeoutMs = (attempt.timeout_seconds || 45) * 1000;
      const expiresAt = new Date(offeredAt.getTime() + timeoutMs);

      if (now > expiresAt) {
        // Expire the attempt
        await supabaseAdmin
          .from("dispatch_attempts")
          .update({
            status: "expired",
            responded_at: now.toISOString(),
          })
          .eq("id", attempt.id);

        // Update courier acceptance rate
        const { data: courier } = await supabaseAdmin
          .from("couriers")
          .select("id, acceptance_rate, total_deliveries")
          .eq("id", attempt.courier_id)
          .maybeSingle();

        if (courier) {
          // Decrease acceptance rate slightly for timeout
          const newRate = Math.max(0, (courier.acceptance_rate || 100) - 2);
          await supabaseAdmin
            .from("couriers")
            .update({ acceptance_rate: newRate, updated_at: now.toISOString() })
            .eq("id", courier.id);
        }

        expired++;
      }
    }

    // Step 2: Find dispatch jobs that are "searching" with no pending attempts
    const { data: searchingJobs } = await supabaseAdmin
      .from("dispatch_jobs")
      .select("id, order_id, created_at")
      .eq("status", "searching");

    for (const job of searchingJobs || []) {
      // Check if there are any pending attempts for this job
      const { data: pendingForJob } = await supabaseAdmin
        .from("dispatch_attempts")
        .select("id")
        .eq("dispatch_job_id", job.id)
        .eq("status", "pending")
        .limit(1);

      if (pendingForJob && pendingForJob.length > 0) {
        continue; // Still waiting for a response
      }

      // Count previous attempts to determine round
      const { count } = await supabaseAdmin
        .from("dispatch_attempts")
        .select("id", { count: "exact", head: true })
        .eq("dispatch_job_id", job.id);

      const round = Math.floor((count || 0) / 1) + 1;
      const response = await triggerDispatchOrder({
        dispatchJobId: String(job.id),
        orderId: String(job.order_id),
        round,
      });

      if (response.ok) {
        redispatched++;
      } else {
        console.error(`Re-dispatch failed for job ${job.id}:`, response.body);
      }
    }

    await writeAuditLog({
      adminClient: actor.adminClient,
      actor,
      request: req,
      functionName: "dispatch-timeout",
      action: "expire_and_redispatch",
      status: "success",
      targetEntityType: "dispatch_jobs",
      metadata: { expired, redispatched, scheduled_dispatched: scheduledDispatched, checked_at: now.toISOString() },
    });

    return jsonResponse({ expired, redispatched, scheduled_dispatched: scheduledDispatched, checked_at: now.toISOString() }, 200, corsHeaders);
  } catch (error) {
    console.error("dispatch-timeout error:", error);
    await writeAuditLog({
      adminClient: actor?.adminClient || createAdminClient(),
      actor,
      request: req,
      functionName: "dispatch-timeout",
      action: "expire_and_redispatch",
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
