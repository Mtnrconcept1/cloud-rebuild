import {
  HttpError,
  authenticateRequest,
  jsonResponse,
  requireRestaurantAccess,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { createRateLimiter } from "../_shared/rate-limit.ts";
import {
  OPENAI_API_KEY,
  createOpenAIResponse,
  extractUsage,
  getOpenAITextCreditUnits,
  estimateOpenAITextCostChf,
  parseStructuredOutput,
  selectTokAiModel,
} from "../_shared/openai.ts";
import {
  assertTokCreditSpendRecorded,
  estimateTextAiPreflightCredits,
  requireRestaurantTokCreditBalance,
} from "../_shared/restaurant-credits.ts";

const FUNCTION_NAME = "ai-restaurant-editor";
const MODEL = selectTokAiModel("restaurant");
const UUID = /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i;
const ALLOWED: Record<string, Record<string, "text" | "bool" | "price" | "minutes">> = {
  restaurant: {
    name: "text", description: "text", cuisine_type: "text",
    address: "text", city: "text", phone: "text",
    supports_reservation: "bool", supports_dinein: "bool",
    supports_pickup: "bool", delivery_available: "bool",
    avg_prep_time_min: "minutes",
  },
  menu_item: {
    name: "text", description: "text", category: "text",
    price: "price", is_available: "bool",
  },
  ai_profile: {
    brand_tone: "text", visual_style: "text", default_language: "text",
  },
  restaurant_settings: {
    auto_accept_orders: "bool", print_orders_automatically: "bool",
  },
  dish_photo: { image_url: "text" },
};
const TABLES: Record<string, string> = {
  restaurant: "restaurants",
  menu_item: "menu_items",
  ai_profile: "restaurant_ai_profiles",
  restaurant_settings: "restaurant_settings",
  dish_photo: "menu_items",
};
const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "summary", "target", "record_id", "field", "value"],
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    target: { type: "string", enum: Object.keys(ALLOWED) },
    record_id: { type: "string" },
    field: { type: "string" },
    value: { type: "string" },
  },
};

type Proposal = {
  title: string;
  summary: string;
  target: string;
  record_id: string;
  field: string;
  value: string;
};
type SavedChange = Proposal & { previous_value: unknown; subject_name: string };

function uuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}
function convertValue(target: string, field: string, value: unknown) {
  const kind = ALLOWED[target]?.[field];
  if (!kind || typeof value !== "string") throw new HttpError(422, "Modification non autorisée");
  if (kind === "bool") {
    if (value !== "true" && value !== "false") throw new HttpError(422, "Valeur booléenne invalide");
    return value === "true";
  }
  if (kind === "minutes" || kind === "price") {
    const number = Number(value);
    if (!Number.isFinite(number) || number < (kind === "minutes" ? 5 : 0) || number > (kind === "minutes" ? 240 : 10000)) {
      throw new HttpError(422, "Valeur numérique invalide");
    }
    if (kind === "minutes" && !Number.isInteger(number)) throw new HttpError(422, "Durée invalide");
    return number;
  }
  const max = target === "dish_photo" ? 1200 : field === "description" ? 2000 : 250;
  const clean = value.trim();
  if (!clean || clean.length > max || Array.from(clean).some((character) => character.charCodeAt(0) < 32)) throw new HttpError(422, "Texte invalide");
  if (field === "name" && clean.length < 2) throw new HttpError(422, "Nom trop court");
  return clean;
}
async function currentRow(
  actor: Awaited<ReturnType<typeof authenticateRequest>>,
  restaurantId: string,
  change: Proposal,
) {
  const table = TABLES[change.target];
  if (!table || !ALLOWED[change.target]?.[change.field]) throw new HttpError(422, "Action non autorisée");
  const recordId = change.target === "restaurant" || change.target === "ai_profile" || change.target === "restaurant_settings"
    ? restaurantId
    : change.record_id;
  if (!uuid(recordId)) throw new HttpError(422, "Élément invalide");
  if (change.target === "restaurant" && change.record_id && change.record_id !== restaurantId) {
    throw new HttpError(403, "Restaurant différent du compte connecté");
  }
  const query = actor.adminClient.from(table).select("*");
  const scoped = change.target === "restaurant"
    ? query.eq("id", restaurantId)
    : query.eq("restaurant_id", restaurantId);
  const { data, error } = await (change.target === "menu_item" || change.target === "dish_photo"
    ? scoped.eq("id", recordId)
    : scoped).maybeSingle();
  if (error) throw new HttpError(500, "Impossible de vérifier les données");
  if (!data && change.target !== "ai_profile" && change.target !== "restaurant_settings") {
    throw new HttpError(404, "Élément introuvable dans ce restaurant");
  }
  return data as Record<string, unknown> | null;
}
function sameValue(a: unknown, b: unknown) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}
async function changeStatus(
  actor: Awaited<ReturnType<typeof authenticateRequest>>,
  taskId: string,
  restaurantId: string,
  userId: string,
  oldStatus: string,
  status: string,
) {
  const { data, error } = await actor.adminClient.from("ai_restaurant_tasks")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", taskId).eq("restaurant_id", restaurantId).eq("user_id", userId)
    .eq("source", FUNCTION_NAME).eq("status", oldStatus).select("id").maybeSingle();
  if (error || !data) throw new HttpError(409, "Cette proposition a déjà été traitée");
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, cors);
  if (preflight) return preflight;
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  let taskId: string | null = null;
  let restaurantId: string | null = null;
  let claimed = false;
  try {
    if (req.method !== "POST") throw new HttpError(405, "Méthode non autorisée");
    actor = await authenticateRequest(req, { allowServiceRole: false });
    if (!actor.userId) throw new HttpError(401, "Connexion nécessaire");
    const body = await req.json().catch(() => ({}));
    restaurantId = uuid(body.restaurantId) ? body.restaurantId : null;
    if (!restaurantId) throw new HttpError(400, "Restaurant requis");
    const restaurant = await requireRestaurantAccess(actor, restaurantId);
    // Unlike read-only helpers, edits are strictly owner-only, including for administrators.
    if (restaurant.owner_id !== actor.userId) throw new HttpError(403, "Seul le propriétaire peut modifier ce restaurant");
    const mode = body.mode === "apply" || body.mode === "apply_photo" ? body.mode : "plan";
    const rate = createRateLimiter(actor.adminClient, FUNCTION_NAME);
    await rate.consume("user:" + actor.userId, { maxRequests: 30, windowSeconds: 3600 });
    await rate.consume("restaurant:" + restaurantId, { maxRequests: 80, windowSeconds: 3600 });

    if (mode === "plan") {
      if (!OPENAI_API_KEY) throw new HttpError(503, "IA indisponible");
      const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 3500) : "";
      if (prompt.length < 5) throw new HttpError(400, "Précisez la modification demandée");

      const [menu, aiProfile, settings, details] = await Promise.all([
        actor.adminClient.from("menu_items").select("id,name,description,category,price,is_available,image_url").eq("restaurant_id", restaurantId).limit(120),
        actor.adminClient.from("restaurant_ai_profiles").select("brand_tone,visual_style,default_language").eq("restaurant_id", restaurantId).maybeSingle(),
        actor.adminClient.from("restaurant_settings").select("auto_accept_orders,print_orders_automatically").eq("restaurant_id", restaurantId).maybeSingle(),
        actor.adminClient.from("restaurants").select("id,name,description,cuisine_type,address,city,phone,supports_reservation,supports_dinein,supports_pickup,delivery_available,avg_prep_time_min").eq("id", restaurantId).single(),
      ]);
      if (menu.error || aiProfile.error || settings.error || details.error) throw new HttpError(503, "Contexte du restaurant indisponible");
      const context = { restaurant: details.data, menu_items: menu.data, ai_profile: aiProfile.data, restaurant_settings: settings.data };
      const maxOutputTokens = 900;
      const preflightCredits = estimateTextAiPreflightCredits({ model: MODEL, input: { prompt, context }, maxOutputTokens });
      await requireRestaurantTokCreditBalance({
        adminClient: actor.adminClient, restaurantId, requiredCredits: preflightCredits,
      });
      const { data: quota, error: quotaError } = await actor.adminClient.rpc("check_restaurant_ai_quota", {
        p_restaurant_id: restaurantId, p_feature: "ai_menu_optimizer", p_units: 1,
      });
      if (quotaError) throw new HttpError(503, "Quota IA indisponible");
      if (quota && typeof quota === "object" && quota.allowed === false) throw new HttpError(402, "Quota IA dépassé");

      const response = await createOpenAIResponse({
        model: MODEL,
        input: [
          { role: "system", content:
            "Tu proposes UNE SEULE modification de données pour le restaurant fourni. Ne change jamais de restaurant. " +
            "Réponds en français. Utilise uniquement ces cibles/champs: " + JSON.stringify(ALLOWED) + ". " +
            "restaurant, ai_profile et restaurant_settings: record_id vide. " +
            "menu_item et dish_photo: record_id doit être un id EXACT fourni dans menu_items. " +
            "Pour dish_photo: field=image_url et value est un prompt détaillé de photographie culinaire, PAS une URL. " +
            "Valeurs booléennes uniquement 'true' ou 'false', prix en CHF numériques. " +
            "N'invente pas de plats ou d'informations factuelles. Ne fais jamais de commande, paiement, remboursement ou publication. " +
            "Si une demande est trop vaste, propose seulement une première modification explicite que l'utilisateur pourra confirmer." },
          { role: "user", content: JSON.stringify({ request: prompt, context }) },
        ],
        maxOutputTokens,
        jsonSchema: { name: "tok_restaurant_edit_proposal", description: "Single controlled restaurant edit", schema: OUTPUT_SCHEMA },
      });
      const proposed = parseStructuredOutput<Proposal>(response);
      convertValue(proposed.target, proposed.field, proposed.value);
      if (proposed.target === "dish_photo" && proposed.field !== "image_url") throw new HttpError(422, "Photo non autorisée");
      if (proposed.target !== "dish_photo" && proposed.field === "image_url") throw new HttpError(422, "Image non autorisée");
      if (!uuid(proposed.record_id) && !["restaurant", "ai_profile", "restaurant_settings"].includes(proposed.target)) {
        throw new HttpError(422, "Plat non identifié");
      }
      const row = await currentRow(actor, restaurantId, proposed);
      const operation: SavedChange = {
        title: String(proposed.title || "Modification du restaurant").slice(0, 140),
        summary: String(proposed.summary || "").slice(0, 500),
        target: proposed.target,
        record_id: ["restaurant", "ai_profile", "restaurant_settings"].includes(proposed.target) ? "" : proposed.record_id,
        field: proposed.field,
        value: proposed.value,
        previous_value: row?.[proposed.field] ?? null,
        subject_name: typeof row?.name === "string" ? row.name : restaurant.name,
      };
      const { data: task, error: taskError } = await actor.adminClient.from("ai_restaurant_tasks").insert({
        restaurant_id: restaurantId,
        user_id: actor.userId,
        task_type: "controlled_edit",
        feature_name: "ai_menu_optimizer",
        title: operation.title,
        prompt,
        result: operation,
        status: "draft",
        model: MODEL,
        source: FUNCTION_NAME,
        metadata: { action: "plan", confirmed: false },
      }).select("id").single();
      if (taskError || !task) throw new HttpError(500, "Impossible d'enregistrer la proposition");
      taskId = task.id;
      const usage = extractUsage(response);
      const { error: usageError } = await actor.adminClient.from("ai_usage_logs").insert({
        function_name: FUNCTION_NAME, action: "plan", feature_name: "ai_menu_optimizer", source: FUNCTION_NAME,
        model: MODEL, user_id: actor.userId, restaurant_id: restaurantId, task_id: taskId,
        status: "success", input_tokens: usage.input_tokens, output_tokens: usage.output_tokens,
        total_tokens: usage.total_tokens,
        estimated_cost_chf: estimateOpenAITextCostChf(MODEL, usage.input_tokens, usage.output_tokens),
        metadata: { credit_kind: "ai_tools", credit_units: getOpenAITextCreditUnits(MODEL, usage.input_tokens, usage.output_tokens) },
      });
      assertTokCreditSpendRecorded(usageError);
      await writeAuditLog({
        adminClient: actor.adminClient, functionName: FUNCTION_NAME, action: "plan", status: "success",
        actor, request: req, targetEntityType: "ai_restaurant_tasks", targetEntityId: taskId,
        metadata: { restaurant_id: restaurantId, field: proposed.field, target: proposed.target },
      });
      return jsonResponse({ taskId, restaurantId, status: "draft", ...operation }, 200, cors);
    }

    taskId = uuid(body.taskId) ? body.taskId : null;
    if (!taskId) throw new HttpError(400, "Proposition requise");
    const { data: task, error: taskError } = await actor.adminClient.from("ai_restaurant_tasks")
      .select("id,restaurant_id,user_id,status,source,result,created_at")
      .eq("id", taskId).eq("restaurant_id", restaurantId).eq("user_id", actor.userId)
      .eq("source", FUNCTION_NAME).maybeSingle();
    if (taskError || !task) throw new HttpError(404, "Proposition introuvable");
    if (task.status !== "draft") throw new HttpError(409, "Proposition déjà exécutée");
    if (Date.now() - new Date(task.created_at).getTime() > 24 * 60 * 60 * 1000) {
      throw new HttpError(410, "Proposition expirée, recommencez");
    }
    const change = task.result as SavedChange;
    const newValue = convertValue(change.target, change.field, change.value);
    if ((change.target === "dish_photo") !== (mode === "apply_photo")) throw new HttpError(422, "Action incorrecte");
    const row = await currentRow(actor, restaurantId, change);
    if (!sameValue(row?.[change.field], change.previous_value)) {
      throw new HttpError(409, "Le contenu a changé depuis la proposition, recommencez");
    }
    let finalValue: unknown = newValue;
    if (mode === "apply_photo") {
      if (!uuid(body.assetId)) throw new HttpError(400, "Image IA requise");
      const { data: asset, error: assetError } = await actor.adminClient.from("ai_generated_assets")
        .select("id,user_id,restaurant_id,status,asset_type,asset_url,metadata")
        .eq("id", body.assetId).eq("restaurant_id", restaurantId).eq("user_id", actor.userId).maybeSingle();
      if (assetError || !asset || asset.status !== "stored" || asset.asset_type !== "menu_visual"
        || typeof asset.asset_url !== "string" || !asset.asset_url.startsWith("https://")
        || asset.metadata?.gallery_storage_bucket !== "restaurant-images") {
        throw new HttpError(422, "Image non générée par TOK pour ce restaurant");
      }
      finalValue = asset.asset_url;
    }
    await changeStatus(actor, taskId, restaurantId, actor.userId, "draft", "generated");
    claimed = true;
    const table = TABLES[change.target];
    const patch = { [change.field]: finalValue };
    const key = change.target === "restaurant" ? "id" : "restaurant_id";
    let update = actor.adminClient.from(table).update(patch).eq(key, restaurantId);
    if (change.target === "menu_item" || change.target === "dish_photo") update = update.eq("id", change.record_id);
    if (row) {
      update = change.previous_value === null
        ? update.is(change.field, null)
        : update.eq(change.field, change.previous_value);
      const { data, error } = await update.select(change.target === "restaurant" ? "id" : change.target === "menu_item" || change.target === "dish_photo" ? "id" : "restaurant_id").maybeSingle();
      if (error || !data) throw new HttpError(409, "Modification refusée : données modifiées entre-temps");
    } else {
      const { error } = await actor.adminClient.from(table).insert({
        restaurant_id: restaurantId,
        ...(change.target === "ai_profile" ? { created_by: actor.userId } : {}),
        ...patch,
      });
      if (error) throw new HttpError(409, "Modification refusée : enregistrement concurrent");
    }
    await changeStatus(actor, taskId, restaurantId, actor.userId, "generated", "applied");
    claimed = false;
    await writeAuditLog({
      adminClient: actor.adminClient, functionName: FUNCTION_NAME, action: mode, status: "success",
      actor, request: req, targetEntityType: table, targetEntityId: change.record_id || restaurantId,
      metadata: { restaurant_id: restaurantId, task_id: taskId, field: change.field, previous_value: change.previous_value },
    });
    return jsonResponse({ status: "applied", taskId, target: change.target, field: change.field }, 200, cors);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof HttpError ? error.message : "Erreur interne";
    if (claimed && actor && taskId && restaurantId && actor.userId) {
      try {
        await actor.adminClient.from("ai_restaurant_tasks").update({ status: "failed" })
          .eq("id", taskId).eq("restaurant_id", restaurantId).eq("user_id", actor.userId)
          .eq("status", "generated");
      } catch {
        // A failed cleanup must not replace the original request error.
      }
    }
    if (actor) await writeAuditLog({
      adminClient: actor.adminClient, functionName: FUNCTION_NAME, action: "error", status: "failure",
      actor, request: req, targetEntityType: "ai_restaurant_tasks", targetEntityId: taskId || restaurantId,
      errorMessage: message,
    }).catch(() => {});
    return jsonResponse({ error: message }, status, cors);
  }
});
