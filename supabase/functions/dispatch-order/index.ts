import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { order_id, dispatch_job_id, radius_km = 5, round = 1 } = await req.json();

    if (!order_id && !dispatch_job_id) {
      return new Response(JSON.stringify({ error: "order_id or dispatch_job_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get or create dispatch job
    let jobId = dispatch_job_id;
    let job;

    if (dispatch_job_id) {
      const { data } = await supabaseAdmin
        .from("dispatch_jobs")
        .select("*, orders(id, restaurant_id, delivery_address, total_amount, user_id)")
        .eq("id", dispatch_job_id)
        .maybeSingle();
      job = data;
    } else {
      // Check if dispatch job already exists for this order
      const { data: existing } = await supabaseAdmin
        .from("dispatch_jobs")
        .select("*, orders(id, restaurant_id, delivery_address, total_amount, user_id)")
        .eq("order_id", order_id)
        .in("status", ["pending", "searching"])
        .maybeSingle();

      if (existing) {
        job = existing;
        jobId = existing.id;
      } else {
        const { data: newJob, error } = await supabaseAdmin
          .from("dispatch_jobs")
          .insert({ order_id, status: "searching" })
          .select("*, orders(id, restaurant_id, delivery_address, total_amount, user_id)")
          .single();

        if (error) throw error;
        job = newJob;
        jobId = newJob.id;
      }
    }

    if (!job) {
      return new Response(JSON.stringify({ error: "Dispatch job not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update job status to searching
    await supabaseAdmin
      .from("dispatch_jobs")
      .update({ status: "searching", updated_at: new Date().toISOString() })
      .eq("id", jobId);

    // Get restaurant coordinates
    const restaurantId = (job as any).orders?.restaurant_id;
    const { data: restaurant } = await supabaseAdmin
      .from("restaurants")
      .select("latitude, longitude, name")
      .eq("id", restaurantId)
      .maybeSingle();

    if (!restaurant?.latitude || !restaurant?.longitude) {
      await supabaseAdmin
        .from("dispatch_jobs")
        .update({ status: "no_courier", updated_at: new Date().toISOString() })
        .eq("id", jobId);

      return new Response(JSON.stringify({ error: "Restaurant has no coordinates" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get couriers who already declined this job
    const { data: previousAttempts } = await supabaseAdmin
      .from("dispatch_attempts")
      .select("courier_id")
      .eq("dispatch_job_id", jobId)
      .in("status", ["declined", "expired"]);

    const excludedCourierIds = (previousAttempts || []).map((a: any) => a.courier_id);

    // Find nearby available couriers using RPC
    const { data: nearbyCouriers, error: courierError } = await supabaseAdmin
      .rpc("find_nearby_couriers", {
        p_lat: restaurant.latitude,
        p_lng: restaurant.longitude,
        p_radius_km: radius_km,
        p_limit: 10,
      });

    if (courierError) throw courierError;

    // Filter out excluded couriers
    const availableCouriers = (nearbyCouriers || []).filter(
      (c: any) => !excludedCourierIds.includes(c.courier_id)
    );

    if (availableCouriers.length === 0) {
      if (round >= 3) {
        // After 3 rounds, mark as no courier available
        await supabaseAdmin
          .from("dispatch_jobs")
          .update({ status: "no_courier", updated_at: new Date().toISOString() })
          .eq("id", jobId);

        // Notify admin
        const { data: admins } = await supabaseAdmin
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin")
          .limit(5);

        for (const admin of admins || []) {
          await supabaseAdmin.from("notifications").insert({
            user_id: admin.user_id,
            title: "Aucun livreur disponible",
            body: `Commande de ${restaurant.name} — aucun livreur trouvé après ${round} tentatives.`,
            type: "dispatch",
            category: "system",
            data: { order_id, dispatch_job_id: jobId },
          });
        }

        return new Response(JSON.stringify({
          status: "no_courier",
          message: `No couriers available after ${round} rounds`,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Will be retried by dispatch-timeout with expanded radius
      return new Response(JSON.stringify({
        status: "searching",
        message: `No couriers in round ${round}, will retry with larger radius`,
        round,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Select best courier (first in sorted results from RPC)
    const bestCourier = availableCouriers[0];

    // Estimate earnings (base fee + distance bonus)
    const distanceKm = bestCourier.distance_km || 1;
    const baseFee = 5.0; // CHF
    const distanceBonus = Math.max(0, (distanceKm - 1) * 1.5); // 1.5 CHF per km after first km
    const estimatedEarnings = Math.round((baseFee + distanceBonus) * 100) / 100;

    // Create dispatch attempt
    const { data: attempt, error: attemptError } = await supabaseAdmin
      .from("dispatch_attempts")
      .insert({
        dispatch_job_id: jobId,
        courier_id: bestCourier.courier_id,
        status: "pending",
        timeout_seconds: 45,
        distance_to_pickup_meters: Math.round(distanceKm * 1000),
        estimated_earnings: estimatedEarnings,
      })
      .select()
      .single();

    if (attemptError) throw attemptError;

    // Notify courier
    await supabaseAdmin.from("notifications").insert({
      user_id: bestCourier.user_id,
      title: "Nouvelle course disponible !",
      body: `${restaurant.name} — ${distanceKm.toFixed(1)} km — ${estimatedEarnings.toFixed(2)} CHF`,
      type: "dispatch",
      category: "transactional",
      data: {
        dispatch_job_id: jobId,
        dispatch_attempt_id: attempt.id,
        restaurant_name: restaurant.name,
        distance_km: distanceKm,
        estimated_earnings: estimatedEarnings,
      },
    });

    return new Response(JSON.stringify({
      status: "offered",
      dispatch_job_id: jobId,
      attempt_id: attempt.id,
      courier_id: bestCourier.courier_id,
      estimated_earnings: estimatedEarnings,
      round,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("dispatch-order error:", error);
    const msg = error instanceof Error ? error.message : "Erreur interne";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
