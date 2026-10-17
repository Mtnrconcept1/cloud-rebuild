import type { RequestActor } from "./auth.ts";
import { buildTokOnePlanQuote } from "./tok-one-recurring-quote.ts";

type Json = Record<string, unknown>;
type Result = { statusCode: number; payload: Json };
type Dependencies = {
  authorizeMutation: () => Promise<void>;
  invokeEdge: (body: Json) => Promise<Result>;
  invokeRpc: (body: Json) => Promise<Result>;
  mutate: (operation: string, args: Json, run: () => Promise<Result>) => Promise<Result>;
};
export class TokCustomerOperationError extends Error {
  constructor(public status: number, code: string) { super(code); }
}
const uuid = { type: "string", format: "uuid" };
const text = (maxLength: number, minLength = 0) => ({ type: "string", minLength, maxLength });
const rating = { type: "integer", minimum: 1, maximum: 10 };
const confirmation = { confirmed_by_user: { type: "boolean", const: true }, idempotency_key: { ...text(120, 8), pattern: "^[A-Za-z0-9:_-]+$" } };
function tool(name: string, description: string, properties: Json, required: string[], write = true) {
  return { name, description, inputSchema: { type: "object", properties: { ...properties, ...(write ? confirmation : {}) }, required: [...required, ...(write ? ["confirmed_by_user", "idempotency_key"] : [])], additionalProperties: false }, annotations: { readOnlyHint: !write, destructiveHint: write, idempotentHint: true, openWorldHint: write } };
}
export const TOK_CUSTOMER_OPERATION_TOOLS = [
  tool("tok_check_my_review_eligibility", "Vérifier si mon compte peut publier un avis après une consommation vérifiée dans ce restaurant. Ne publie rien.", { restaurant_id: uuid }, ["restaurant_id"], false),
  tool("tok_submit_my_verified_review", "Publier l'avis explicitement demandé par le client, avec quatre notes sur 10 et son texte exact. TOK vérifie la consommation réelle et interdit un second avis pour ce restaurant ; ne jamais inventer une expérience ou des notes.", { restaurant_id: uuid, rating, service_rating: rating, quality_rating: rating, speed_rating: rating, comment: text(5000) }, ["restaurant_id", "rating", "service_rating", "quality_rating", "speed_rating"]),
  tool("tok_create_my_support_incident", "Ouvrir un incident support TOK lié à une de mes commandes OU réservations, avec le texte demandé. Le restaurant et le client sont déduits de la ressource appartenant au compte authentifié.", { order_id: uuid, reservation_id: uuid, subject: text(180, 3), description: text(5000, 10), category: { type: "string", enum: ["general", "order_missing", "order_late", "wrong_item", "missing_item", "quality_issue", "refund_request", "payment_issue", "reservation_issue", "zero_attente_issue", "delivery_issue", "technical_issue"] } }, ["subject", "description", "category"]),
  tool("tok_cancel_my_tok_one_subscription", "Demander la résiliation de mon abonnement TOK One courant à la fin de la période payée. TOK applique le préavis natif de trois jours ; les abonnements Apple restent gérés chez Apple. Ne rembourse pas et ne souscrit aucun nouvel abonnement.", { subscription_id: uuid }, ["subscription_id"]),
  tool("tok_quote_my_tok_one_subscription", "Lire chez Stripe le prix récurrent vérifiable de mon abonnement TOK One existant avant toute reprise du renouvellement. Ne crée ni ne modifie l'abonnement ; les tarifications complexes et Apple sont refusées.", { subscription_id: uuid }, ["subscription_id"], false),
  tool("tok_resume_my_tok_one_subscription", "Réactiver le renouvellement de mon abonnement TOK One existant après présentation du devis Stripe et autorisation explicite du montant et de la périodicité. Reprendre exactement le récapitulatif fourni par tok_quote_my_tok_one_subscription ; le serveur revérifie le prix avant la reprise.", { subscription_id: uuid, expected_recurring_amount_cents: { type: "integer", minimum: 0, maximum: 1000000 }, expected_currency: { type: "string", enum: ["CHF"] }, expected_interval: { type: "string", enum: ["month", "year"] }, expected_interval_count: { type: "integer", minimum: 1, maximum: 12 } }, ["subscription_id", "expected_recurring_amount_cents", "expected_currency", "expected_interval", "expected_interval_count"]),
  tool("tok_list_tok_one_plans", "Lister les formules TOK One actives et leurs prix mensuels CHF natifs. Ne souscrit rien.", {}, [], false),
  tool("tok_quote_tok_one_plan", "Préparer le devis d'une nouvelle souscription TOK One : prix mensuel CHF, essai de 14 jours, renouvellement automatique et préavis de résiliation de trois jours. Ne crée aucun checkout.", { plan_id: uuid }, ["plan_id"], false),
  tool("tok_checkout_my_tok_one_plan", "Créer le checkout sécurisé de la formule TOK One explicitement choisie après acceptation du prix mensuel CHF, de l'essai de 14 jours, du renouvellement automatique et du préavis de trois jours. Réutiliser exactement payment_attempt_id et idempotency_key après timeout/reconnexion. Le lien Stripe ne prouve jamais un abonnement actif ; relire statut de paiement et abonnement après finalisation.", { plan_id: uuid, payment_attempt_id: uuid, expected_recurring_amount_cents: { type: "integer", minimum: 1, maximum: 1000000 }, expected_currency: { type: "string", enum: ["CHF"] }, expected_interval: { type: "string", enum: ["month"] }, expected_interval_count: { type: "integer", minimum: 1, maximum: 1 }, recurring_terms_accepted: { type: "boolean", const: true } }, ["plan_id", "payment_attempt_id", "expected_recurring_amount_cents", "expected_currency", "expected_interval", "expected_interval_count", "recurring_terms_accepted"]),
  tool("tok_send_my_gift_points", "Offrir des MIAMZ au destinataire explicitement indiqué. Débite exactement le nombre de points autorisé ; cadeau minimum 100 points, sans bonus inventé. Disponible uniquement si points-cadeau est actif. Le code retourné doit être partagé par le client ; aucun email de livraison n'est promis.", { recipient_email: { ...text(180, 3), format: "email" }, points: { type: "integer", minimum: 100, maximum: 1000000 }, message: text(1000) }, ["recipient_email", "points"]),
  tool("tok_claim_my_gift_points", "Réclamer un cadeau MIAMZ par son code. TOK vérifie que le code est valide et destiné à l'adresse du compte authentifié, puis crédite une seule fois les points. Disponible uniquement si points-cadeau est actif.", { claim_code: text(120, 1) }, ["claim_code"]),
] as const;

export const TOK_CUSTOMER_OPERATION_COVERAGE = [
  { domain: "customer.review_publication", status: "available", tools: ["tok_check_my_review_eligibility", "tok_submit_my_verified_review"], remaining: ["review_edit_requires_native_verified_update_contract"] },
  { domain: "customer.support", status: "available", tools: ["tok_create_my_support_incident"], remaining: ["unlinked_account_support_requires_native_authenticated_contract"] },
  { domain: "customer.tok_one", status: "partial", tools: ["tok_cancel_my_tok_one_subscription", "tok_quote_my_tok_one_subscription", "tok_resume_my_tok_one_subscription", "tok_list_tok_one_plans", "tok_quote_tok_one_plan", "tok_checkout_my_tok_one_plan"], remaining: ["complex_recurring_billing_requires_invoice_preview", "apple_subscription_management"] },
  { domain: "customer.gift_points", status: "feature_gated", tools: ["tok_send_my_gift_points", "tok_claim_my_gift_points"], remaining: ["points-cadeau_feature_flag_must_be_active", "gift_email_delivery_not_implemented_by_native_rpc"] },
  ...["delivery_checkout", "multi_restaurant_checkout", "group_orders", "golden_tok"].map((domain) => ({ domain: `customer.${domain}`, status: "backend_only", tools: [], remaining: ["dedicated_native_quote_payment_fulfillment_contract_and_end_to_end_validation"] })),
];
const definitions = new Map(TOK_CUSTOMER_OPERATION_TOOLS.map((item) => [item.name, item]));
const fail = (status: number, code: string): never => { throw new TokCustomerOperationError(status, code); };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function quotePlan(plan: Json) {
  try { return buildTokOnePlanQuote(plan); } catch { return fail(409, "tok_connect_tok_one_plan_price_invalid"); }
}
export function validateTokCustomerOperation(name: string, raw: unknown): Json {
  const descriptor = definitions.get(name);
  if (!descriptor) return fail(404, "tok_connect_customer_operation_unknown");
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fail(400, "tok_connect_customer_args_invalid");
  const args = raw as Json;
  const schema = descriptor.inputSchema;
  for (const key of Object.keys(args)) if (!(key in schema.properties)) fail(400, "tok_connect_customer_unknown_argument");
  for (const key of schema.required) if (!(key in args)) fail(400, "tok_connect_customer_argument_required");
  for (const [key, value] of Object.entries(args)) {
    const rule = (schema.properties as Json)[key] as Json;
    if (rule.type === "string" && (typeof value !== "string" || value.trim().length < Number(rule.minLength || 0)
      || value.length > Number(rule.maxLength || 10000) || rule.format === "uuid" && !UUID.test(value)
      || rule.format === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
      || rule.pattern && !new RegExp(String(rule.pattern)).test(value))) fail(400, "tok_connect_customer_argument_invalid");
    if (rule.type === "integer" && (typeof value !== "number" || !Number.isInteger(value) || value < Number(rule.minimum) || value > Number(rule.maximum))) fail(400, "tok_connect_customer_argument_invalid");
    if (rule.type === "boolean" && (typeof value !== "boolean" || "const" in rule && value !== rule.const)) fail(409, "tok_connect_customer_confirmation_required");
    if (Array.isArray(rule.enum) && !rule.enum.includes(value)) fail(400, "tok_connect_customer_argument_invalid");
  }
  if (name === "tok_create_my_support_incident" && Boolean(args.order_id) === Boolean(args.reservation_id)) fail(400, "tok_connect_support_one_owned_reference_required");
  return args;
}

export async function invokeTokCustomerOperation(actor: RequestActor, body: Json, deps: Dependencies): Promise<Result> {
  if (!actor.userId || !actor.userClient || actor.isServiceRole) return fail(401, "tok_connect_customer_user_required");
  if (!actor.roles.includes("client")) return fail(403, "tok_connect_client_role_required");
  const name = String(body.operation || "");
  const args = validateTokCustomerOperation(name, body.args);
  if (!definitions.get(name)!.annotations.readOnlyHint) await deps.authorizeMutation();
  const client = actor.userClient;
  async function read(query: PromiseLike<{ data: unknown; error: unknown }>) {
    const { data, error } = await query;
    if (error) return fail(503, "tok_connect_customer_backend_unavailable");
    return data;
  }
  const metadata = { confirmed_by_user: args.confirmed_by_user, idempotency_key: args.idempotency_key };
  if (["tok_list_tok_one_plans", "tok_quote_tok_one_plan", "tok_checkout_my_tok_one_plan"].includes(name)) {
    if (name === "tok_list_tok_one_plans") {
      const plans = await read(client.from("user_subscription_plans").select("id,name,price_monthly,status").eq("status", "active").order("id").limit(20));
      return { statusCode: 200, payload: { ok: true, plans: (Array.isArray(plans) ? plans : []).map((plan) => quotePlan(plan as Json)) } };
    }
    if (name === "tok_quote_tok_one_plan") {
      const plan = await read(client.from("user_subscription_plans").select("id,name,price_monthly,status").eq("id", args.plan_id).eq("status", "active").maybeSingle()) as Json | null;
      if (!plan) return fail(404, "tok_connect_tok_one_plan_not_found");
      return { statusCode: 200, payload: { ok: true, quote: quotePlan(plan) } };
    }
    if (args.idempotency_key !== "tok-one:" + args.payment_attempt_id) return fail(400, "tok_connect_tok_one_attempt_key_invalid");
    const expected = { expected_plan_id: args.plan_id, expected_recurring_amount_cents: args.expected_recurring_amount_cents, expected_currency: args.expected_currency, expected_interval: args.expected_interval, expected_interval_count: args.expected_interval_count };
    // The native checkout checks the expected price after its payment-attempt
    // replay lookup. A preflight price check here would break valid retries if
    // the catalogue changes after an existing Stripe session was created.
    const result = await deps.invokeEdge({ ...metadata, capability: "subscription.tok_one.checkout", payload: {
      payment_attempt_id: args.payment_attempt_id, checkout_kind: "tok-one", items: [], payment_method: "card",
      return_url: "https://www.thetok.ch/tok-one?payment_attempt_id=" + args.payment_attempt_id,
      order_metadata: { plan_id: args.plan_id, billing_period: "monthly", payment_attempt_id: args.payment_attempt_id, ...expected },
    } });
    if (result.payload.ok !== true) return result;
    const data = result.payload.data as Json | undefined;
    let checkoutUrl: string | null = null;
    try { const url = new URL(String(data?.url || "")); if (url.protocol === "https:" && url.hostname === "checkout.stripe.com" && !url.username && !url.password && !url.port) checkoutUrl = url.toString(); } catch { /* no verified link */ }
    return { ...result, payload: { ...result.payload, subscription_checkout: { payment_attempt_id: args.payment_attempt_id, checkout_url: checkoutUrl, subscription_active: false, requires_payment_completion: true, message: "Finalisez Stripe puis relisez votre abonnement TOK One ; ce lien ne prouve pas une activation." } } };
  }
  if (name === "tok_check_my_review_eligibility") {
    const data = await read(client.rpc("get_restaurant_review_submission_state", { p_restaurant_id: args.restaurant_id }));
    return { statusCode: 200, payload: { ok: true, eligibility: data } };
  }
  if (name === "tok_submit_my_verified_review") {
    // The native RPC verifies consumption and uniqueness transactionally. Do
    // not preflight can_submit here: a successful retry must reach the bridge's
    // idempotency replay even after the newly created review makes it false.
    return deps.invokeRpc({ ...metadata, rpc_name: "submit_verified_review", args: { p_restaurant_id: args.restaurant_id, p_rating: args.rating, p_service_rating: args.service_rating, p_quality_rating: args.quality_rating, p_speed_rating: args.speed_rating, p_comment: args.comment || null, p_tags: [], p_reservation_id: null, p_order_id: null } });
  }
  if (name === "tok_create_my_support_incident") {
    const order = Boolean(args.order_id);
    const item = await read(client.from(order ? "orders" : "reservations").select("id,restaurant_id").eq("id", order ? args.order_id : args.reservation_id).eq("user_id", actor.userId).maybeSingle()) as Json | null;
    if (!item?.restaurant_id) return fail(404, "tok_connect_customer_owned_reference_not_found");
    return deps.invokeRpc({ ...metadata, rpc_name: "create_support_incident", args: { p_category: args.category, p_subject: args.subject, p_description: args.description, p_order_id: args.order_id || null, p_reservation_id: args.reservation_id || null, p_restaurant_id: item.restaurant_id, p_priority: "normal", p_metadata: { source: "tok_connect_customer" } } });
  }
  if (["tok_cancel_my_tok_one_subscription", "tok_quote_my_tok_one_subscription", "tok_resume_my_tok_one_subscription"].includes(name)) {
    const subscription = await read(client.from("tok_one_subscriptions").select("id,status,current_period_end,cancel_at_period_end").eq("user_id", actor.userId).eq("stripe_mode", "live").order("created_at", { ascending: false }).limit(1).maybeSingle()) as Json | null;
    if (!subscription || subscription.id !== args.subscription_id) return fail(409, "tok_connect_tok_one_current_subscription_changed");
    const quoting = name === "tok_quote_my_tok_one_subscription";
    return deps.invokeEdge({ ...metadata, capability: quoting ? "subscription.tok_one.quote" : "subscription.tok_one.manage", payload: {
      action: quoting ? "quote" : name === "tok_cancel_my_tok_one_subscription" ? "cancel" : "resume",
      subscription_id: args.subscription_id,
      ...(!quoting && name === "tok_resume_my_tok_one_subscription" ? { confirmed_by_user: true, expected_recurring_amount_cents: args.expected_recurring_amount_cents, expected_currency: args.expected_currency, expected_interval: args.expected_interval, expected_interval_count: args.expected_interval_count } : {}),
    } });
  }
  if (name === "tok_send_my_gift_points" || name === "tok_claim_my_gift_points") {
    const flag = await read(client.from("feature_flags").select("is_active").eq("name", "points-cadeau").maybeSingle()) as Json | null;
    if (flag?.is_active !== true) return fail(409, "tok_connect_gift_points_feature_disabled");
    return deps.invokeRpc({ ...metadata, rpc_name: name === "tok_send_my_gift_points" ? "send_gift_points_v2" : "claim_gift_points_v2", args: name === "tok_send_my_gift_points" ? { recipient_email_param: String(args.recipient_email).trim().toLowerCase(), points_param: args.points, message_param: args.message || null } : { claim_code_param: String(args.claim_code).trim().toLowerCase() } });
  }
  return fail(404, "tok_connect_customer_operation_unknown");
}
