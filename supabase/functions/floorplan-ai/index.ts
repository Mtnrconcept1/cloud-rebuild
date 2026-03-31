import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") || "gpt-4o";
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, restaurantId, currentLayout, canvasWidth, canvasHeight, prompt } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: restaurant, error: restError } = await adminClient
      .from("restaurants")
      .select("name, cuisine_type, city, address")
      .eq("id", restaurantId)
      .eq("owner_id", user.id)
      .single();

    if (restError || !restaurant) {
      return new Response(JSON.stringify({ error: "Restaurant introuvable" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Gather reservation stats for optimization
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentReservations } = await adminClient
      .from("reservations")
      .select("party_size, status, time")
      .eq("restaurant_id", restaurantId)
      .gte("created_at", thirtyDaysAgo);

    const reservations = recentReservations || [];
    const avgPartySize = reservations.length > 0
      ? (reservations.reduce((s, r) => s + (r.party_size || 2), 0) / reservations.length).toFixed(1)
      : "2.5";
    const partyDistribution: Record<number, number> = {};
    reservations.forEach((r) => {
      const size = r.party_size || 2;
      partyDistribution[size] = (partyDistribution[size] || 0) + 1;
    });

    const currentLayoutSummary = currentLayout && currentLayout.length > 0
      ? currentLayout.map((t: any) => `${t.table_number}: ${t.capacity}p ${t.layout.shape} (${Math.round(t.layout.x)},${Math.round(t.layout.y)}) ${t.layout.w}x${t.layout.h}`).join("\n")
      : "Aucune table placée";

    const systemPrompt = `Tu es un expert en aménagement de salles de restaurant pour la plateforme Tok.
Tu dois TOUJOURS répondre avec un JSON valide, sans texte avant ni après le JSON.

Contexte du restaurant:
- Nom: ${restaurant.name}
- Cuisine: ${restaurant.cuisine_type || "Non spécifié"}
- Ville: ${restaurant.city}
- Taille moyenne des groupes (30j): ${avgPartySize} personnes
- Distribution: ${JSON.stringify(partyDistribution)}
- Canvas: ${canvasWidth || 1040}x${canvasHeight || 680} pixels

Disposition actuelle:
${currentLayoutSummary}

TYPES DISPONIBLES (kind):
- "table-round-2": Table ronde 2 pers
- "table-round-4": Table ronde 4 pers
- "table-rect-4": Table rectangulaire 4 pers
- "table-rect-6": Table rectangulaire 6 pers
- "chair": Chaise individuelle
- "stool": Tabouret
- "bar": Comptoir/bar
- "corner-bench": Banc d'angle
- "banquette": Banquette
- "booth": Booth
- "host-stand": Accueil
- "divider": Séparateur/cloison
- "plant": Plante décorative
- "service-station": Desserte/station de service

SHAPES: "round" ou "rect"
SEAT TYPES: "chair", "stool", "bench", "corner-bench"

RÈGLES IMPORTANTES:
- Les positions x,y doivent être dans les limites du canvas (0-${canvasWidth || 1040} x 0-${canvasHeight || 680})
- Laisse au minimum 60px entre les éléments pour la circulation
- Les tables rondes ont w=h (carré)
- Tailles minimum: tables rondes 100x100, rect 140x90, meubles 60x60
- Tailles maximum: 300x300
- rotation: 0-359 (multiple de 15 recommandé)
- seatLabels: tableau de numéros de places (ex: [1,2] pour 2 places)
- Pour les tables: capacity = nombre total de places assises

FORMAT DE RÉPONSE (JSON strict):
{
  "tables": [
    {
      "table_number": "T1",
      "capacity": 4,
      "kind": "table-rect-4",
      "shape": "rect",
      "seatType": "chair",
      "x": 100,
      "y": 100,
      "w": 176,
      "h": 112,
      "rotation": 0,
      "seatLabels": [1,2,3,4]
    }
  ],
  "explanation": "Explication courte en français de tes choix d'aménagement"
}`;

    let userPrompt = "";
    if (action === "generate") {
      userPrompt = prompt || "Génère un plan de salle optimisé pour ce restaurant avec un bon mix de tables 2 et 4 personnes, quelques tables 6, un accueil à l'entrée et des plantes décoratives. Optimise la circulation et le nombre de couverts.";
    } else if (action === "optimize") {
      userPrompt = "Analyse la disposition actuelle et propose une version optimisée. Améliore la circulation, le nombre de couverts et l'esthétique. Garde les types de tables existants mais ajuste positions, rotations et espacement.";
    } else if (action === "suggest-furniture") {
      userPrompt = "Analyse le plan actuel et suggère des meubles à ajouter: plantes, séparateurs, bar, accueil, etc. Ne modifie pas les tables existantes, ajoute uniquement du mobilier complémentaire pour améliorer l'ambiance et le flux de service.";
    } else if (action === "custom") {
      userPrompt = prompt || "Donne tes suggestions d'amélioration.";
    } else {
      return new Response(JSON.stringify({ error: "Action inconnue" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI error:", response.status, errorText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Trop de requêtes. Réessayez dans quelques instants." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Erreur du service IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return new Response(JSON.stringify({ error: "Réponse IA vide" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse and validate the response
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      return new Response(JSON.stringify({ error: "Réponse IA invalide", raw: content }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("floorplan-ai error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erreur inconnue" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
