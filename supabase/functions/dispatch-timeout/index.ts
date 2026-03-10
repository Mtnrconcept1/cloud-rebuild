import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Cron-triggered function that:
 * 1. Expires timed-out dispatch attempts
 * 2. Re-dispatches jobs that have no pending attempts
 * Should be called every 30 seconds via pg_cron or external scheduler.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const now = new Date();
    let expired = 0;
    let redispatched = 0;

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

      const round = Math.floor((count || 0) / 1) + 1; // Each round = 1 attempt
      const expandedRadius = 5 + (round - 1) * 3; // 5km, 8km, 11km

      // Call dispatch-order to find next courier
      const dispatchUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/dispatch-order`;

      const response = await fetch(dispatchUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          dispatch_job_id: job.id,
          order_id: job.order_id,
          radius_km: expandedRadius,
          round,
        }),
      });

      if (response.ok) {
        redispatched++;
      } else {
        console.error(`Re-dispatch failed for job ${job.id}:`, await response.text());
      }
    }

    return new Response(
      JSON.stringify({ expired, redispatched, checked_at: now.toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("dispatch-timeout error:", error);
    const msg = error instanceof Error ? error.message : "Erreur interne";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
