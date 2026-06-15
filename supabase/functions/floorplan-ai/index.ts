import {
  HttpError,
  authenticateRequest,
  jsonResponse,
  requireRestaurantAccess,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { createRateLimiter } from "../_shared/rate-limit.ts";
import { makeLogger } from "../_shared/logging.ts";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MAX_IMAGE_DATA_URL_CHARS = 8_000_000;
const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

type FloorplanAction = "generate" | "optimize" | "suggest-furniture" | "custom" | "image-import";

type ReservationRow = { party_size: number | null };
type ImagePayload = {
  dataUrl: string;
  mimeType: string;
  name: string | null;
};

function buildSystemPrompt(params: {
  restaurant: { name: string; cuisine_type: string | null; city: string | null };
  avgPartySize: string;
  partyDistribution: Record<number, number>;
  canvasWidth: number;
  canvasHeight: number;
  currentLayoutSummary: string;
}) {
  const { restaurant, avgPartySize, partyDistribution, canvasWidth, canvasHeight, currentLayoutSummary } = params;
  return `Tu es un expert en aménagement de salles de restaurant pour la plateforme Tok.
Tu dois TOUJOURS répondre avec un JSON valide, sans texte avant ni après le JSON.

Contexte du restaurant:
- Nom: ${restaurant.name}
- Cuisine: ${restaurant.cuisine_type || "Non spécifié"}
- Ville: ${restaurant.city || "Non spécifié"}
- Taille moyenne des groupes (30j): ${avgPartySize} personnes
- Distribution: ${JSON.stringify(partyDistribution)}
- Canvas: ${canvasWidth}x${canvasHeight} pixels

Disposition actuelle:
${currentLayoutSummary}

TYPES DISPONIBLES (kind):
- "table-round-2", "table-round-4", "table-rect-4", "table-rect-6"
- "chair", "stool", "bar", "corner-bench", "banquette", "booth"
- "host-stand", "divider", "plant", "service-station"

SHAPES: "round" ou "rect"
SEAT TYPES: "chair", "stool", "bench", "corner-bench"

RÈGLES:
- x,y dans les limites du canvas (0-${canvasWidth} x 0-${canvasHeight})
- minimum 60px entre les éléments
- rondes: w=h; tables rect min 140x90; meubles min 60x60; max 300x300
- rotation multiple de 15; capacity = nombre de places

FORMAT DE RÉPONSE (JSON strict):
{
  "tables": [{"table_number":"T1","capacity":4,"kind":"table-rect-4","shape":"rect","seatType":"chair","x":100,"y":100,"w":176,"h":112,"rotation":0,"seatLabels":[1,2,3,4]}],
  "explanation": "..."
}`;
}

function normalizeImagePayload(value: unknown): ImagePayload | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const dataUrl = typeof record.dataUrl === "string" ? record.dataUrl.trim() : "";
  const mimeType = typeof record.mimeType === "string" ? record.mimeType.trim().toLowerCase() : "";
  const name = typeof record.name === "string" ? record.name.trim().slice(0, 180) : null;

  if (!dataUrl || !mimeType || !IMAGE_MIME_TYPES.has(mimeType)) return null;
  if (dataUrl.length > MAX_IMAGE_DATA_URL_CHARS) return null;
  if (!dataUrl.startsWith(`data:${mimeType};base64,`)) return null;

  return { dataUrl, mimeType, name };
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, cors);
  if (preflight) return preflight;

  const log = makeLogger("floorplan-ai");
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;

  try {
    actor = await authenticateRequest(req, { allowServiceRole: false });
    if (!actor.userId) throw new HttpError(401, "Unauthorized");

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini";
    const OPENAI_VISION_MODEL = Deno.env.get("OPENAI_VISION_MODEL") || OPENAI_MODEL;
    if (!OPENAI_API_KEY) {
      log.error("openai_key_missing");
      throw new HttpError(503, "ai_service_unavailable");
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action as FloorplanAction;
    const restaurantId = typeof body.restaurantId === "string" ? body.restaurantId : "";
    const canvasWidth = Math.min(Math.max(Number(body.canvasWidth) || 1040, 400), 2000);
    const canvasHeight = Math.min(Math.max(Number(body.canvasHeight) || 680, 400), 2000);
    const currentLayout = Array.isArray(body.currentLayout) ? body.currentLayout : [];
    const rawPrompt = typeof body.prompt === "string" ? body.prompt.slice(0, 2000) : "";
    const image = normalizeImagePayload(body.image);

    if (!restaurantId || !["generate", "optimize", "suggest-furniture", "custom", "image-import"].includes(action)) {
      throw new HttpError(400, "invalid_request");
    }
    if (action === "image-import" && !image) {
      throw new HttpError(400, "invalid_image");
    }

    // Ownership check.
    const restaurant = await requireRestaurantAccess(actor, restaurantId);

    // Per-user + per-restaurant + global rate limit. Fail-closed.
    const rl = createRateLimiter(actor.adminClient, "floorplan-ai");
    await rl.consume(`user:${actor.userId}`, { maxRequests: 15, windowSeconds: 3600 });
    await rl.consume(`restaurant:${restaurantId}`, { maxRequests: 30, windowSeconds: 3600 });
    await rl.consume("global", { maxRequests: 200, windowSeconds: 60 });

    // Reservation stats (last 30d).
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentReservations } = await actor.adminClient
      .from("reservations")
      .select("party_size")
      .eq("restaurant_id", restaurantId)
      .gte("created_at", thirtyDaysAgo);

    const reservations = (recentReservations as ReservationRow[] | null) ?? [];
    const avgPartySize = reservations.length > 0
      ? (reservations.reduce((s, r) => s + (r.party_size || 2), 0) / reservations.length).toFixed(1)
      : "2.5";
    const partyDistribution: Record<number, number> = {};
    for (const r of reservations) {
      const size = r.party_size || 2;
      partyDistribution[size] = (partyDistribution[size] || 0) + 1;
    }

    const currentLayoutSummary = currentLayout.length > 0
      ? currentLayout
        .map((t: Record<string, unknown>) => {
          const layout = (t.layout ?? {}) as Record<string, unknown>;
          return `${t.table_number}: ${t.capacity}p ${layout.shape} (${Math.round(
            Number(layout.x) || 0,
          )},${Math.round(Number(layout.y) || 0)}) ${layout.w}x${layout.h}`;
        })
        .join("\n")
      : "Aucune table placée";

    const systemPrompt = buildSystemPrompt({
      restaurant: {
        name: restaurant.name,
        cuisine_type: restaurant.cuisine_type,
        city: restaurant.city,
      },
      avgPartySize,
      partyDistribution,
      canvasWidth,
      canvasHeight,
      currentLayoutSummary,
    });

    let userPrompt = rawPrompt;
    if (!userPrompt) {
      if (action === "image-import") {
        userPrompt =
          "Analyze the uploaded floor-plan image and recreate it as a Tok room layout. Preserve visible table numbers, infer seating capacity from visible chairs or benches, estimate relative x/y/w/h positions on the canvas, include visible furniture such as plants, bars, host stands and dividers, and avoid inventing objects that are not visible. Return only the strict JSON format.";
      } else if (action === "generate") {
        userPrompt =
          "Génère un plan de salle optimisé avec un bon mix de tables 2/4/6 personnes, un accueil et des plantes. Optimise circulation et couverts.";
      } else if (action === "optimize") {
        userPrompt =
          "Analyse la disposition actuelle et propose une version optimisée. Garde les types existants, ajuste positions/rotations/espacement.";
      } else if (action === "suggest-furniture") {
        userPrompt =
          "Suggère des meubles complémentaires (plantes, séparateurs, bar, accueil) sans modifier les tables existantes.";
      } else {
        userPrompt = "Donne tes suggestions d'amélioration.";
      }
    }

    const selectedModel = action === "image-import" ? OPENAI_VISION_MODEL : OPENAI_MODEL;
    const userContent = image
      ? [
        { type: "text", text: userPrompt },
        { type: "image_url", image_url: { url: image.dataUrl, detail: "high" } },
      ]
      : userPrompt;

    const aiResponse = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        temperature: action === "image-import" ? 0.2 : 0.7,
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResponse.ok) {
      log.error("openai_error", { status: aiResponse.status });
      if (aiResponse.status === 429) {
        throw new HttpError(429, "Trop de requêtes. Réessayez dans quelques instants.");
      }
      throw new HttpError(502, "ai_service_error");
    }

    const data = await aiResponse.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new HttpError(502, "ai_empty_response");

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      log.error("ai_parse_error");
      throw new HttpError(502, "ai_invalid_response");
    }

    await writeAuditLog({
      adminClient: actor.adminClient,
      functionName: "floorplan-ai",
      status: "success",
      action,
      actor,
      request: req,
      targetEntityType: "restaurants",
      targetEntityId: restaurantId,
      metadata: { model: selectedModel, rid: log.rid, has_image: Boolean(image), image_mime_type: image?.mimeType || null },
    });

    return jsonResponse(parsed as Record<string, unknown>, 200, cors);
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof HttpError ? err.message : "internal_error";
    log.error("request_failed", { status, message });

    if (actor) {
      await writeAuditLog({
        adminClient: actor.adminClient,
        functionName: "floorplan-ai",
        status: "failure",
        actor,
        request: req,
        errorMessage: message,
        metadata: { rid: log.rid },
      }).catch(() => {});
    }

    return jsonResponse({ error: message, rid: log.rid }, status, cors);
  }
});
