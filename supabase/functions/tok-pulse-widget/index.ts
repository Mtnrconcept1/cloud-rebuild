import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders, handleCorsPreflight, isRequestOriginAllowed } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const PUBLIC_ORIGIN = "https://www.thetok.ch";
const CACHE_CONTROL = "public, max-age=120, s-maxage=300, stale-while-revalidate=900";

function genevaDateKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function safeCount(value: number | null) {
  return Number.isFinite(value) && Number(value) > 0 ? Number(value) : 0;
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (!isRequestOriginAllowed(req)) return new Response(null, { status: 403, headers: corsHeaders });
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;
  if (req.method !== "GET") {
    return new Response(null, { status: 405, headers: new Headers({ ...corsHeaders, allow: "GET, OPTIONS" }) });
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: "pulse_widget_not_configured" }), {
      status: 503,
      headers: new Headers({ ...corsHeaders, "content-type": "application/json", "cache-control": "no-store" }),
    });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const now = new Date().toISOString();
  const today = genevaDateKey();

  const [restaurantsResult, flashResult, chefResult, antiWasteResult] = await Promise.all([
    admin.from("restaurants").select("id", { count: "exact", head: true }).eq("is_active", true).eq("supports_reservation", true),
    admin.from("flash_sales").select("id", { count: "exact", head: true }).eq("is_active", true).eq("sale_date", today).gt("quantity_available", 0),
    admin.from("chef_table_drops").select("id", { count: "exact", head: true }).eq("is_active", true).gt("remaining_portions", 0).gte("drop_time", now),
    admin.from("anti_waste_offers").select("id", { count: "exact", head: true }).eq("is_active", true),
  ]);

  const firstError = [restaurantsResult.error, flashResult.error, chefResult.error, antiWasteResult.error].find(Boolean);
  if (firstError) {
    console.error("tok-pulse-widget", firstError);
    return new Response(JSON.stringify({ error: "pulse_widget_data_unavailable" }), {
      status: 503,
      headers: new Headers({ ...corsHeaders, "content-type": "application/json", "cache-control": "no-store" }),
    });
  }

  const reservable = safeCount(restaurantsResult.count);
  const flash = safeCount(flashResult.count);
  const chef = safeCount(chefResult.count);
  const antiWaste = safeCount(antiWasteResult.count);
  const priority = flash > 0 ? "flash" : chef > 0 ? "chef_table" : "reservation";

  const payload = {
    version: 1,
    updated_at: now,
    city: "Genève",
    priority,
    reservation: {
      count: reservable,
      title: reservable > 0 ? `${reservable} restaurants TOK` : "Trouver une table",
      subtitle: "Réservation et découverte",
      url: `${PUBLIC_ORIGIN}/recherche?mode=reservation`,
    },
    flash: {
      count: flash,
      title: flash > 0 ? `${flash} offre${flash > 1 ? "s" : ""} flash` : "Offres flash",
      subtitle: flash > 0 ? "Disponibles aujourd’hui" : "Reviens bientôt",
      url: `${PUBLIC_ORIGIN}/ventes-flash`,
    },
    chef_table: {
      count: chef,
      title: chef > 0 ? `${chef} Table${chef > 1 ? "s" : ""} du Chef` : "La Table du Chef",
      subtitle: chef > 0 ? "Drops à venir" : "Active les alertes",
      url: `${PUBLIC_ORIGIN}/chefs-table`,
    },
    anti_waste: {
      count: antiWaste,
      title: antiWaste > 0 ? `${antiWaste} offre${antiWaste > 1 ? "s" : ""} anti-gaspi` : "Anti-gaspi",
      subtitle: "Mieux manger, moins gaspiller",
      url: `${PUBLIC_ORIGIN}/anti-gaspi`,
    },
  };

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: new Headers({
      ...corsHeaders,
      "content-type": "application/json; charset=utf-8",
      "cache-control": CACHE_CONTROL,
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex, nofollow, nosnippet, noarchive",
    }),
  });
});
