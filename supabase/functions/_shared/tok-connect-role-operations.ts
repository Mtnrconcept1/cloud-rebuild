import { TOK_SPECIAL_OFFER_TOOLS, TOK_SPECIAL_OFFER_NAMES, invokeTokSpecialOfferOperation } from "./tok-connect-special-offer-operations.ts";
import { TOK_FLOORPLAN_OPERATION_TOOLS, TOK_FLOORPLAN_OPERATION_NAMES, invokeTokFloorplanOperation } from "./tok-connect-floorplan-operations.ts";
import type { RequestActor } from "./auth.ts";
import { TOK_SERVICE_SETTINGS_FIELDS, TOK_NEW_SERVICE_REQUIRED_FIELDS, prepareTokServiceSettings } from "./tok-connect-service-settings-operations.ts";

type RecordValue = Record<string, unknown>;
type Result = { statusCode: number; payload: RecordValue };
type Dependencies = {
  authorizeMutation: () => Promise<void>;
  invokeEdge: (body: RecordValue) => Promise<Result>;
  invokeRpc: (body: RecordValue) => Promise<Result>;
  mutate: (operation: string, args: RecordValue, run: () => Promise<Result>) => Promise<Result>;
};
export class TokRoleOperationError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const uuid = { type: "string", format: "uuid" };
const page = { limit: { type: "integer", minimum: 1, maximum: 50 }, offset: { type: "integer", minimum: 0, maximum: 10000 } };
const restaurant = { restaurant_id: uuid };
const confirmation = { confirmed_by_user: { type: "boolean", const: true }, idempotency_key: { type: "string", minLength: 8, maxLength: 120, pattern: "^[A-Za-z0-9:_-]+$" } };
const menuFields = { name: { type: "string", minLength: 1, maxLength: 180 }, description: { type: "string", maxLength: 4000 }, category: { type: "string", maxLength: 100 }, price_chf: { type: "number", minimum: 0.01, maximum: 10000 }, is_available: { type: "boolean" } };
const promotionFields = { name: { type: "string", minLength: 1, maxLength: 180 }, promotion_type: { type: "string", enum: ["percentage", "fixed", "free_delivery"] }, promotion_value: { type: "number", minimum: 0, maximum: 10000 }, target: { type: "string", enum: ["all", "new", "returning"] }, start_at: { type: "string", format: "date-time" }, end_at: { type: "string", format: "date-time" }, active: { type: "boolean" } };
function tool(name: string, description: string, properties: RecordValue, required: string[] = [], write = false) {
  const externalEffects = ["tok_accept_restaurant_reservation", "tok_refuse_restaurant_reservation", "tok_update_restaurant_reservation_status", "tok_update_restaurant_order_status", "tok_contact_restaurant_support", "tok_reply_restaurant_review", "tok_report_restaurant_review"];
  return { name, description, inputSchema: { type: "object", properties: { ...properties, ...(write ? confirmation : {}) }, required: [...required, ...(write ? ["confirmed_by_user", "idempotency_key"] : [])], additionalProperties: false }, annotations: { readOnlyHint: !write, destructiveHint: write, idempotentHint: true, openWorldHint: externalEffects.includes(name) } };
}
export const TOK_ROLE_OPERATION_TOOLS = [
  ...TOK_SPECIAL_OFFER_TOOLS,
  ...TOK_FLOORPLAN_OPERATION_TOOLS,
  tool("tok_list_my_restaurants", "Lister les restaurants dont je suis propriétaire pour choisir le contexte restaurateur. Aucun accès administratif implicite.", page),
  tool("tok_list_restaurant_reservations", "Consulter les réservations d'un restaurant dont je suis propriétaire, avec leur vrai statut TOK.", { ...restaurant, ...page, date: { type: "string", format: "date" } }, ["restaurant_id"]),
  tool("tok_accept_restaurant_reservation", "Accepter une réservation en attente dans mon restaurant par la mutation native TOK, avec ses notifications. Nécessite une demande explicite de l'utilisateur.", { ...restaurant, reservation_id: uuid }, ["restaurant_id", "reservation_id"], true),
  tool("tok_refuse_restaurant_reservation", "Refuser ou annuler une réservation de mon restaurant via le flux natif TOK et sa raison obligatoire. Les protections et remboursements natifs restent applicables.", { ...restaurant, reservation_id: uuid, reason_code: { type: "string", enum: ["closure", "overbooking", "kitchen_issue", "customer_unreachable", "private_event", "duplicate_error", "other"] }, reason_details: { type: "string", minLength: 1, maxLength: 1000 } }, ["restaurant_id", "reservation_id", "reason_code"], true),
  tool("tok_update_restaurant_reservation_status", "Marquer une réservation arrivée, installée ou absente. TOK vérifie la progression et les verrouillages. La clôture facturable utilise un autre flux.", { ...restaurant, reservation_id: uuid, status: { type: "string", enum: ["arrived", "seated", "no_show"] } }, ["restaurant_id", "reservation_id", "status"], true),
  tool("tok_list_restaurant_orders", "Consulter les commandes de mon restaurant avec statut de commande et de paiement, sans données bancaires.", { ...restaurant, ...page }, ["restaurant_id"]),
  tool("tok_update_restaurant_order_status", "Accepter, préparer, marquer prête ou annuler une commande de mon restaurant via restaurant-order-status natif. TOK contrôle les transitions et déclenche livraison et notifications.", { ...restaurant, order_id: uuid, status: { type: "string", enum: ["accepted", "preparing", "ready", "cancelled"] } }, ["restaurant_id", "order_id", "status"], true),
  tool("tok_list_restaurant_menu", "Consulter les plats et prix du menu de mon restaurant.", { ...restaurant, ...page }, ["restaurant_id"]),
  tool("tok_create_restaurant_menu_item", "Créer un plat dans le menu de mon restaurant avec prix CHF, nom et disponibilité, par le même stockage RLS que TOK.", { ...restaurant, ...menuFields }, ["restaurant_id", "name", "price_chf", "is_available"], true),
  tool("tok_generate_restaurant_campaign_draft", "Créer dans TOK Campaign Studio un projet de campagne IA pour mon restaurant, sans publication ni achat publicitaire. Une génération peut consommer des crédits TOK; confirmation explicite et idempotence obligatoires. Sans budget fourni, le plafond autorisé est 0 CHF.", { ...restaurant, prompt: { type: "string", minLength: 5, maxLength: 3500 }, max_budget_chf: { type: "number", minimum: 0, maximum: 5000 }, max_daily_budget_chf: { type: "number", minimum: 0, maximum: 1000 } }, ["restaurant_id", "prompt"], true),
  tool("tok_list_restaurant_marketing_references", "Lire les références graphiques du Studio Marketing de mon restaurant (logo, carte, identité). Utiliser leurs identifiants pour générer un visuel; si aucune référence n'existe, demander son ajout dans le Studio TOK.", { ...restaurant, ...page }, ["restaurant_id"]),
  tool("tok_list_restaurant_marketing_assets", "Retrouver les visuels IA de mon restaurant et leur statut réel, sans génération ni débit. Après une interruption, vérifier la galerie et conserver la même clé d'idempotence; ne jamais relancer avec une nouvelle clé pour contourner une opération en cours.", { ...restaurant, ...page, asset_id: uuid }, ["restaurant_id"]),
  tool("tok_generate_restaurant_marketing_visual", "Générer un visuel marketing natif TOK en une seule image pour mon restaurant, conservé dans sa galerie; aucune publicité ni publication n'est lancée. Lire d’abord tok_list_restaurant_marketing_references et transmettre 1 à 4 reference_media_ids. Dépense possible de crédits photo TOK avec confirmation.", { ...restaurant, prompt: { type: "string", minLength: 5, maxLength: 3500 }, format: { type: "string", enum: ["square", "portrait", "landscape"] }, reference_media_ids: { type: "array", minItems: 1, maxItems: 4, uniqueItems: true, items: uuid } }, ["restaurant_id", "prompt", "reference_media_ids"], true),
  tool("tok_generate_restaurant_dish_photo", "Générer via PhotoPro une photographie culinaire native pour un plat existant de mon menu. La photo source du plat, si elle existe, est lue depuis TOK; l'image générée reste en galerie jusqu'à confirmation de son association. Des crédits TOK peuvent être débités.", { ...restaurant, menu_item_id: uuid, photo_instructions: { type: "string", maxLength: 1200 }, format: { type: "string", enum: ["square", "portrait", "landscape"] } }, ["restaurant_id", "menu_item_id"], true),
  tool("tok_attach_restaurant_dish_photo", "Associer à un plat de mon restaurant une image PhotoPro réellement générée et stockée par TOK pour mon propre compte. Vérifie identité, restaurant, type d'asset et galerie. Ne publie aucun post.", { ...restaurant, menu_item_id: uuid, asset_id: uuid }, ["restaurant_id", "menu_item_id", "asset_id"], true),
  tool("tok_delete_restaurant_menu_item", "Supprimer un plat de mon restaurant à la demande explicite du propriétaire. Préférer la désactivation si le propriétaire veut seulement masquer le plat; les contraintes natives peuvent refuser la suppression.", { ...restaurant, menu_item_id: uuid }, ["restaurant_id", "menu_item_id"], true),
  tool("tok_update_restaurant_menu_item", "Modifier le nom, descriptif, prix CHF, catégorie ou disponibilité d'un plat existant de mon restaurant, comme dans TOK. Ne crée pas de paiement.", { ...restaurant, menu_item_id: uuid, ...menuFields }, ["restaurant_id", "menu_item_id"], true),
  tool("tok_list_restaurant_hours", "Consulter les paramètres réels des services midi/soir de mon restaurant. Ces horaires canoniques contrôlent les disponibilités TOK, les créneaux réservables et les commandes.", restaurant, ["restaurant_id"]),
  tool("tok_update_restaurant_hours", "Modifier un service midi/soir existant dans les réglages canoniques TOK (horaires, capacité, réservation/commande ouverte ou fermée). Fournir les plages de capacité si les nouveaux horaires les dépassent. Les autres champs et l'autre service sont conservés. Une fermeture quotidienne de service n'est pas une fermeture exceptionnelle datée.", { ...restaurant, ...TOK_SERVICE_SETTINGS_FIELDS }, ["restaurant_id", "service"], true),
  tool("tok_list_restaurant_promotions", "Consulter les promotions de mon restaurant, leurs dates et leur activation.", { ...restaurant, ...page }, ["restaurant_id"]),
  tool("tok_create_restaurant_promotion", "Créer une promotion TOK de mon restaurant avec dates ISO explicites, pourcentage, montant CHF ou livraison gratuite. N'effectue aucune publication sociale ou dépense publicitaire.", { ...restaurant, ...promotionFields }, ["restaurant_id", "name", "promotion_type", "promotion_value", "target", "start_at", "end_at", "active"], true),
  tool("tok_delete_restaurant_promotion", "Supprimer une promotion existante de mon restaurant à la demande explicite de son propriétaire.", { ...restaurant, promotion_id: uuid }, ["restaurant_id", "promotion_id"], true),
  tool("tok_set_restaurant_promotion_active", "Activer ou désactiver une promotion existante de mon restaurant comme dans TOK. Ne publie pas sur les réseaux sociaux et ne dépense aucun budget publicitaire.", { ...restaurant, promotion_id: uuid, active: { type: "boolean" } }, ["restaurant_id", "promotion_id", "active"], true),
  tool("tok_get_my_account", "Consulter mon profil client TOK et mon niveau de fidélité. Ne renvoie aucune clé, rôle ou donnée d'un autre compte.", {}),
  tool("tok_update_my_profile", "Modifier mes coordonnées TOK par update_client_profile natif. Les champs absents sont conservés; ne peut changer aucun rôle, email de connexion ni points fidélité.", { full_name: { type: "string", maxLength: 160 }, first_name: { type: "string", maxLength: 80 }, last_name: { type: "string", maxLength: 120 }, phone: { type: "string", maxLength: 40 }, address: { type: "string", maxLength: 500 }, city: { type: "string", maxLength: 120 }, avatar_url: { type: "string", maxLength: 2048 }, date_of_birth: { type: "string", format: "date" } }, [], true),
  tool("tok_get_my_loyalty", "Consulter mes points et mon niveau de fidélité TOK. Cet outil ne crédite et ne dépense aucun point.", {}),
  tool("tok_list_my_tok_one_subscriptions", "Consulter mes abonnements TOK One et leur état sans identifiants Stripe ni données bancaires.", page),
  tool("tok_list_my_meal_subscriptions", "Consulter mes abonnements repas existants, leurs jours, restaurants et horaires.", page),
  tool("tok_list_my_support_tickets", "Consulter mes demandes de support TOK, sans notes internes ou dossiers d'autres utilisateurs.", page),
  tool("tok_contact_restaurant_support", "Envoyer au support TOK une demande explicite concernant mon restaurant par le service natif contact-support. Le texte fourni est réellement transmis au support.", { ...restaurant, subject: { type: "string", minLength: 3, maxLength: 180 }, message: { type: "string", minLength: 10, maxLength: 5000 } }, ["restaurant_id", "subject", "message"], true),
  tool("tok_list_restaurant_branches", "Lister les succursales de mon restaurant pour choisir horaires ou plan de salle.", { ...restaurant, ...page }, ["restaurant_id"]),
  tool("tok_list_restaurant_invoices", "Consulter les factures de mon restaurant, montants CHF, échéances et statuts. Ne déclenche aucun paiement.", { ...restaurant, ...page }, ["restaurant_id"]),
  tool("tok_list_restaurant_staff", "Consulter les membres et fonctions de l'équipe de mon restaurant. Ne modifie aucun accès ni salaire.", { ...restaurant, ...page }, ["restaurant_id"]),
  tool("tok_list_restaurant_daily_kpis", "Consulter les indicateurs quotidiens persistés de mon restaurant: revenus, commandes, réservations et satisfaction. Dates et fraîcheur figurent dans les résultats; une page n'est pas un total global.", { ...restaurant, ...page }, ["restaurant_id"]),
  tool("tok_list_restaurant_subscriptions", "Consulter l'abonnement et les limites IA de mon restaurant sans identifiants Stripe ni données bancaires.", { ...restaurant, ...page }, ["restaurant_id"]),
  tool("tok_list_restaurant_subscription_plans", "Consulter le catalogue actif des abonnements restaurateurs TOK et leurs prix CHF. Ne souscrit aucun abonnement.", page),
  tool("tok_list_restaurant_floor_tables", "Consulter les tables, capacités et secteurs d'une succursale de mon restaurant. Aucun changement du plan ou affectation de clients.", { ...restaurant, branch_id: uuid, ...page }, ["restaurant_id", "branch_id"]),
  tool("tok_create_restaurant_floor_table", "Ajouter une nouvelle table ronde active au plan d'une succursale de mon restaurant. Sa position initiale est fixe et aucune réservation n'est déplacée.", { ...restaurant, branch_id: uuid, table_number: { type: "string", minLength: 1, maxLength: 80 }, capacity: { type: "integer", minimum: 1, maximum: 20 }, sector: { type: "string", minLength: 1, maxLength: 120 }, is_active: { type: "boolean", const: true } }, ["restaurant_id", "branch_id", "table_number", "capacity", "sector", "is_active"], true),
  tool("tok_update_restaurant_floor_table", "Renommer une table existante ou changer son secteur. L'activation, la désactivation, les capacités et les affectations exigent le flux natif de plan de salle et ne sont pas modifiables par cet outil.", { ...restaurant, branch_id: uuid, table_id: uuid, table_number: { type: "string", minLength: 1, maxLength: 80 }, sector: { type: "string", minLength: 1, maxLength: 120 } }, ["restaurant_id", "branch_id", "table_id"], true),
  tool("tok_create_restaurant_hours", "Configurer un nouveau service midi ou soir encore absent des réglages canoniques de mon restaurant. Les horaires locaux, capacités et autorisations doivent être explicites. Le service apparaîtra dans TOK et contrôlera les disponibilités réelles.", { ...restaurant, ...TOK_SERVICE_SETTINGS_FIELDS }, ["restaurant_id", ...TOK_NEW_SERVICE_REQUIRED_FIELDS], true),
  tool("tok_get_restaurant_profile", "Consulter les coordonnées et paramètres publics de mon restaurant TOK.", restaurant, ["restaurant_id"]),
  tool("tok_update_restaurant_profile", "Modifier nom, description ou coordonnées publiques de mon restaurant dans TOK. Ne change aucun propriétaire, rôle, statut d'approbation ou taux de commission.", { ...restaurant, name: { type: "string", minLength: 1, maxLength: 180 }, description: { type: "string", maxLength: 5000 }, address: { type: "string", minLength: 1, maxLength: 500 }, city: { type: "string", minLength: 1, maxLength: 120 }, phone: { type: "string", maxLength: 40 } }, ["restaurant_id"], true),
  tool("tok_get_restaurant_delivery_settings", "Consulter la disponibilité livraison, frais CHF et minimum de commande de mon restaurant.", restaurant, ["restaurant_id"]),
  tool("tok_update_restaurant_delivery_settings", "Modifier la disponibilité livraison, frais CHF et minimum de commande de mon restaurant comme dans ses réglages TOK. Les règles globales de disponibilité restent applicables.", { ...restaurant, delivery_available: { type: "boolean" }, delivery_fee: { type: "number", minimum: 0, maximum: 1000 }, min_order_amount: { type: "number", minimum: 0, maximum: 10000 } }, ["restaurant_id", "delivery_available", "delivery_fee", "min_order_amount"], true),
  tool("tok_list_restaurant_reviews", "Consulter les avis et réponses publiques de mon restaurant.", { ...restaurant, ...page }, ["restaurant_id"]),
  tool("tok_reply_restaurant_review", "Publier une réponse explicite à un avis de mon restaurant par restaurant_reply_review natif. Ce texte sera visible publiquement; ne publie que la réponse demandée par l'utilisateur.", { ...restaurant, review_id: uuid, reply_text: { type: "string", minLength: 1, maxLength: 3000 } }, ["restaurant_id", "review_id", "reply_text"], true),
  tool("tok_report_restaurant_review", "Signaler au support un avis de mon restaurant avec une raison explicite via la modération native TOK. Ne supprime pas l'avis.", { ...restaurant, review_id: uuid, reason: { type: "string", minLength: 3, maxLength: 1000 } }, ["restaurant_id", "review_id", "reason"], true),
  tool("tok_list_restaurant_news", "Consulter les actualités TOK de mon restaurant avec leur statut réel, y compris brouillons.", { ...restaurant, ...page }, ["restaurant_id"]),
  tool("tok_create_restaurant_news_draft", "Enregistrer un brouillon texte d'actualité TOK pour mon restaurant, visible dans son espace. Aucune publication, programmation, génération IA, boost ou dépense; le statut reste draft.", { ...restaurant, body: { type: "string", minLength: 1, maxLength: 2000 }, post_type: { type: "string", enum: ["plat", "promo", "evenement", "coulisses", "annonce"] } }, ["restaurant_id", "body", "post_type"], true),
  tool("tok_list_my_notifications", "Consulter mes notifications TOK, dont confirmations et changements de réservation.", page),
  tool("tok_mark_my_notification_read", "Marquer une de mes notifications TOK comme lue.", { notification_id: uuid }, ["notification_id"], true),
  tool("tok_list_my_favorites", "Consulter mes restaurants favoris TOK.", page),
  tool("tok_set_my_favorite", "Ajouter ou retirer un restaurant de mes favoris TOK.", { ...restaurant, favorite: { type: "boolean" } }, ["restaurant_id", "favorite"], true),
  tool("tok_list_my_reviews", "Consulter les avis que j'ai rédigés dans TOK. La publication et modification d'avis restent dans le parcours natif vérifié.", page),
] as const;

// This inventory deliberately separates backend availability from callable tools.
// Discovery must never advertise a generic executor as feature parity.
export const TOK_ROLE_OPERATION_COVERAGE = [
  { domain: "restaurant.special_offers", status: "partial", tools: TOK_SPECIAL_OFFER_TOOLS.map((tool) => tool.name), remaining: ["offer_edit"] },
  { domain: "restaurant.floorplan", status: "partial", tools: TOK_FLOORPLAN_OPERATION_TOOLS.map((tool) => tool.name), remaining: ["atomic_multi_reservation_swaps", "decorative_objects", "floorplan_ai", "staff_branch_access", "table_billing_closure"] },
  { domain: "restaurant.reservations", status: "partial", tools: ["tok_list_restaurant_reservations", "tok_accept_restaurant_reservation", "tok_refuse_restaurant_reservation", "tok_update_restaurant_reservation_status"], remaining: ["rescheduling", "billable_table_closure", "floorplan_mutations"] },
  { domain: "restaurant.orders", status: "partial", tools: ["tok_list_restaurant_orders", "tok_update_restaurant_order_status"], remaining: ["refunds", "delivery_completion_by_courier"] },
  { domain: "restaurant.marketing_studio", status: "partial", tools: ["tok_list_restaurant_marketing_references", "tok_list_restaurant_marketing_assets", "tok_generate_restaurant_campaign_draft", "tok_generate_restaurant_marketing_visual"], remaining: ["campaign_publication", "ad_purchase", "campaign_approval", "campaign_listing"] },
  { domain: "restaurant.menu_photography", status: "partial", tools: ["tok_generate_restaurant_dish_photo", "tok_attach_restaurant_dish_photo"], remaining: ["bulk_image_import", "asset_gallery_management"] },
  { domain: "restaurant.menu_hours_promotions", status: "partial", tools: ["tok_list_restaurant_menu", "tok_create_restaurant_menu_item", "tok_update_restaurant_menu_item", "tok_delete_restaurant_menu_item", "tok_list_restaurant_hours", "tok_update_restaurant_hours", "tok_list_restaurant_promotions", "tok_create_restaurant_promotion", "tok_delete_restaurant_promotion", "tok_set_restaurant_promotion_active"], remaining: ["exceptional_closures", "promotion_edit"] },
  { domain: "customer.account_favorites_notifications_reviews", status: "partial", tools: ["tok_get_my_account", "tok_update_my_profile", "tok_get_my_loyalty", "tok_list_my_notifications", "tok_mark_my_notification_read", "tok_list_my_favorites", "tok_set_my_favorite", "tok_list_my_reviews"], remaining: ["review_publication", "support_submission", "loyalty_redemption"] },
  { domain: "restaurant.management", status: "partial", tools: ["tok_list_restaurant_branches", "tok_list_restaurant_invoices", "tok_list_restaurant_staff", "tok_list_restaurant_daily_kpis", "tok_list_restaurant_subscriptions", "tok_list_restaurant_subscription_plans", "tok_list_restaurant_floor_tables", "tok_contact_restaurant_support"], remaining: ["staff_mutations", "bill_payment", "subscription_management", "floorplan_mutations"] },
  { domain: "restaurant.profile_reviews_news_floorplan", status: "partial", tools: ["tok_get_restaurant_profile", "tok_update_restaurant_profile", "tok_get_restaurant_delivery_settings", "tok_update_restaurant_delivery_settings", "tok_list_restaurant_reviews", "tok_reply_restaurant_review", "tok_report_restaurant_review", "tok_list_restaurant_news", "tok_create_restaurant_news_draft", "tok_create_restaurant_floor_table", "tok_update_restaurant_floor_table", "tok_create_restaurant_hours"], remaining: ["news_publication", "floorplan_assignments", "floorplan_layout", "floorplan_table_activation", "per_date_exceptional_closures"] },
  { domain: "customer.subscriptions_support", status: "partial", tools: ["tok_list_my_tok_one_subscriptions", "tok_list_my_meal_subscriptions", "tok_list_my_support_tickets"], remaining: ["subscription_management", "support_submission"] },
  ...["marketing_publication", "media", "courier", "admin", "group_orders", "golden_tok", "loyalty_redemption"].map((domain) => ({ domain, status: "backend_only", tools: [], remaining: ["dedicated_contract_and_end_to_end_validation"] })),
];
const byName = new Map(TOK_ROLE_OPERATION_TOOLS.map((value) => [value.name, value]));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (status: number, code: string): never => { throw new TokRoleOperationError(status, code); };
const ok = (data: RecordValue): Result => ({ statusCode: 200, payload: { ok: true, ...data } });

export function validateTokRoleOperation(name: string, input: unknown): RecordValue {
  const descriptor = byName.get(name);
  if (!descriptor) return fail(404, "tok_connect_operation_not_found");
  if (!input || typeof input !== "object" || Array.isArray(input)) return fail(400, "tok_connect_operation_args_invalid");
  const args = input as RecordValue;
  const schema = descriptor.inputSchema;
  const properties = schema.properties as RecordValue;
  for (const key of Object.keys(args)) if (!Object.hasOwn(properties, key)) fail(400, "tok_connect_operation_unknown_argument");
  for (const key of schema.required) if (args[key] === undefined) fail(400, `tok_connect_${key}_required`);
  for (const [key, value] of Object.entries(args)) {
    const rule = properties[key] as RecordValue;
    if (rule.type === "string" && (typeof value !== "string" || (rule.minLength && value.trim().length < Number(rule.minLength)) || (rule.maxLength && value.length > Number(rule.maxLength)))) fail(400, `tok_connect_${key}_invalid`);
    if (key === "reference_media_ids" && (!Array.isArray(value) || value.length < Number(rule.minItems ?? 0)
      || value.length > Number(rule.maxItems ?? 100) || (rule.uniqueItems && new Set(value).size !== value.length)
      || value.some((item) => typeof item !== "string" || !UUID.test(item)))) fail(400, `tok_connect_${key}_invalid`);
    if (rule.type === "boolean" && typeof value !== "boolean") fail(400, `tok_connect_${key}_invalid`);
    if (["integer", "number"].includes(String(rule.type)) && (typeof value !== "number" || !Number.isFinite(value) || (rule.type === "integer" && !Number.isInteger(value)) || value < Number(rule.minimum) || value > Number(rule.maximum))) fail(400, `tok_connect_${key}_invalid`);
    if (rule.const !== undefined && value !== rule.const) fail(key === "confirmed_by_user" ? 409 : 400, key === "confirmed_by_user" ? "tok_connect_human_confirmation_required" : `tok_connect_${key}_invalid`);
    if (rule.enum && !(rule.enum as unknown[]).includes(value)) fail(400, `tok_connect_${key}_invalid`);
    if (rule.format === "uuid" && !UUID.test(String(value))) fail(400, `tok_connect_${key}_invalid`);
    if (rule.format === "date" && (!/^\d{4}-\d{2}-\d{2}$/.test(String(value)) || !Number.isFinite(Date.parse(String(value) + "T12:00:00Z")) || new Date(String(value) + "T12:00:00Z").toISOString().slice(0, 10) !== value)) fail(400, "tok_connect_date_invalid");
    if (rule.format === "date-time" && (!/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.test(String(value)) || !Number.isFinite(Date.parse(String(value))) || new Date(String(value).slice(0, 10) + "T12:00:00Z").toISOString().slice(0, 10) !== String(value).slice(0, 10))) fail(400, "tok_connect_datetime_invalid");
    if (rule.pattern && !new RegExp(String(rule.pattern)).test(String(value))) fail(400, `tok_connect_${key}_invalid`);
  }
  if (name === "tok_update_restaurant_menu_item" && !["name", "description", "category", "price_chf", "is_available"].some((key) => key in args)) fail(400, "tok_connect_menu_patch_required");
  if ("price_chf" in args && Math.abs(Number(args.price_chf) * 100 - Math.round(Number(args.price_chf) * 100)) > 0.000001) fail(400, "tok_connect_price_chf_cents_required");
  if (name === "tok_update_my_profile" && !["full_name", "first_name", "last_name", "phone", "address", "city", "avatar_url", "date_of_birth"].some((key) => key in args)) fail(400, "tok_connect_profile_patch_required");
  if (name === "tok_update_restaurant_profile" && !["name", "description", "address", "city", "phone"].some((key) => key in args)) fail(400, "tok_connect_restaurant_profile_patch_required");
  if (name === "tok_update_restaurant_floor_table" && !["table_number", "sector"].some((key) => key in args)) fail(400, "tok_connect_floor_table_patch_required");
  if (name === "tok_update_my_profile" && args.avatar_url && !/^https:\/\/[^\s]+$/.test(String(args.avatar_url))) fail(400, "tok_connect_avatar_url_invalid");
  if (name === "tok_create_restaurant_promotion" && (Date.parse(String(args.end_at)) <= Date.parse(String(args.start_at)) || (["percentage", "fixed"].includes(String(args.promotion_type)) && Number(args.promotion_value) <= 0) || (args.promotion_type === "percentage" && Number(args.promotion_value) > 100) || (args.promotion_type === "fixed" && Number(args.promotion_value) > 1000) || (args.promotion_type === "free_delivery" && args.promotion_value !== 0))) fail(400, "tok_connect_promotion_invalid");
  if (name === "tok_refuse_restaurant_reservation" && args.reason_code === "other" && !String(args.reason_details || "").trim()) fail(400, "tok_connect_reason_details_required");
  return args;
}

/** Every operation uses the caller's RLS client and explicit ownership even for multi-role admins. */
export async function invokeTokRoleOperation(actor: RequestActor, body: RecordValue, deps: Dependencies): Promise<Result> {
  if (!actor.userId || !actor.userClient || actor.isServiceRole) return fail(401, "tok_connect_user_required");
  const name = String(body.operation || "");
  const args = validateTokRoleOperation(name, body.args);
  if (!byName.get(name)!.annotations.readOnlyHint) await deps.authorizeMutation();
  const client = actor.userClient;
  const limit = Number(args.limit || 20), offset = Number(args.offset || 0);
  async function read(query: PromiseLike<{ data: unknown; error: unknown }>) {
    const { data, error } = await query;
    if (error) return fail(503, "tok_connect_operation_unavailable");
    return data;
  }
  async function ownRestaurant(id: string) {
    if (!actor.roles.includes("restaurateur")) return fail(403, "tok_connect_restaurateur_required");
    const row = await read(client.from("restaurants").select("id,tok_connect_mcp_enabled").eq("id", id).eq("owner_id", actor.userId).maybeSingle()) as RecordValue | null;
    if (!row) return fail(404, "tok_connect_owned_restaurant_not_found");
    if (row.tok_connect_mcp_enabled !== true) fail(403, "tok_connect_restaurant_mcp_disabled");
  }
  async function ownEntity(table: string, id: string, restaurantId: string) {
    const row = await read(client.from(table).select("id").eq("id", id).eq("restaurant_id", restaurantId).maybeSingle());
    if (!row) fail(404, "tok_connect_restaurant_entity_not_found");
  }
  if (name === "tok_list_my_restaurants") {
    if (!actor.roles.includes("restaurateur")) return fail(403, "tok_connect_restaurateur_required");
    return ok({ items: await read(client.from("restaurants").select("id,name,city,is_active,status").eq("owner_id", actor.userId).eq("tok_connect_mcp_enabled", true).order("id").range(offset, offset + limit - 1)), limit, offset });
  }
  if (name === "tok_list_restaurant_subscription_plans") {
    if (!actor.roles.includes("restaurateur")) return fail(403, "tok_connect_restaurateur_required");
    return ok({ items: await read(client.from("restaurant_subscription_plans").select("id,slug,name,description,price_monthly_chf,currency,features").eq("is_active", true).order("position").range(offset, offset + limit - 1)), limit, offset });
  }
  if (/^tok_(get|list|update|create|delete|accept|refuse|contact|reply|report|generate|attach)_restaurant_/.test(name) || name === "tok_set_restaurant_promotion_active" || TOK_SPECIAL_OFFER_NAMES.has(name) || TOK_FLOORPLAN_OPERATION_NAMES.has(name)) {
    const id = String(args.restaurant_id);
    await ownRestaurant(id);
    if (TOK_SPECIAL_OFFER_NAMES.has(name)) return invokeTokSpecialOfferOperation(name, args, { read, client, mutate: deps.mutate, fail });
    if (TOK_FLOORPLAN_OPERATION_NAMES.has(name)) return invokeTokFloorplanOperation(name, args, { actor, read, fail, mutate: deps.mutate });
    if (name === "tok_list_restaurant_marketing_references") {
      const items = await read(client.from("restaurant_media")
        .select("id,media_type,media_url,storage_bucket,storage_path,created_at")
        .eq("restaurant_id", id)
        .in("media_type", ["marketing_logo", "marketing_business_card", "marketing_menu", "marketing_brand_visual"])
        .order("created_at", { ascending: false }).order("id")
        .range(offset, offset + limit - 1));
      return ok({ restaurant_id: id, items, limit, offset, studio_path: "/dashboard/photos" });
    }
    if (name === "tok_list_restaurant_marketing_assets") {
      let query = client.from("ai_generated_assets")
        .select("id,asset_type,status,asset_url,created_at")
        .eq("restaurant_id", id).eq("user_id", actor.userId)
        .in("asset_type", ["campaign_visual", "menu_visual", "banner"]);
      if (args.asset_id) query = query.eq("id", args.asset_id);
      return ok({ restaurant_id: id, items: await read(query.order("created_at", { ascending: false }).order("id")
        .range(offset, offset + limit - 1)), limit, offset, studio_path: "/dashboard/photos" });
    }
    if (name === "tok_generate_restaurant_campaign_draft") {
      const maxBudget = Number(args.max_budget_chf ?? 0);
      const maxDailyBudget = Math.min(Number(args.max_daily_budget_chf ?? 0), maxBudget);
      return deps.invokeEdge({
        capability: "restaurant.ai.campaign_studio", confirmed_by_user: args.confirmed_by_user,
        idempotency_key: args.idempotency_key,
        payload: {
          action: "generate", restaurantId: id, prompt: String(args.prompt).trim(),
          idempotencyKey: args.idempotency_key,
          guardrails: { max_budget_chf: maxBudget, max_daily_budget_chf: maxDailyBudget, manual_approval_required: true },
        },
      });
    }
    if (name === "tok_generate_restaurant_marketing_visual") {
      return deps.invokeEdge({
        capability: "restaurant.ai.image", confirmed_by_user: args.confirmed_by_user,
        idempotency_key: args.idempotency_key,
        payload: {
          restaurantId: id, assetType: "campaign_visual", marketingAssetMode: true,
          prompt: String(args.prompt).trim(), format: args.format || "square",
          referenceMediaIds: args.reference_media_ids,
          variantCount: 1, generateImage: true, imageOnly: true,
        },
      });
    }
    if (name === "tok_generate_restaurant_dish_photo") {
      const dish = await read(client.from("menu_items").select("id,name,description,category,image_url").eq("id", args.menu_item_id).eq("restaurant_id", id).maybeSingle()) as RecordValue | null;
      if (!dish) return fail(404, "tok_connect_restaurant_menu_item_not_found");
      const dishName = String(dish.name || "").trim();
      if (!dishName) return fail(422, "tok_connect_restaurant_menu_item_name_missing");
      const brief = [
        "Photographie culinaire premium pour le plat réel du restaurant.",
        "Plat : " + dishName,
        dish.category ? "Catégorie : " + String(dish.category).slice(0, 100) : "",
        dish.description ? "Description : " + String(dish.description).slice(0, 1000) : "",
        args.photo_instructions ? "Demande du restaurateur : " + String(args.photo_instructions).trim() : "",
        "Une seule photographie, sans texte ni logo ajouté. Ne pas présenter les ingrédients comme des faits si aucune image source n'existe.",
      ].filter(Boolean).join("\n");
      const sourceImageUrl = typeof dish.image_url === "string" && /^https:\/\//.test(dish.image_url) ? dish.image_url : undefined;
      return deps.invokeEdge({
        capability: "restaurant.ai.image", confirmed_by_user: args.confirmed_by_user,
        idempotency_key: args.idempotency_key,
        payload: {
          restaurantId: id, assetType: "menu_visual", dishName,
          prompt: brief, ...(sourceImageUrl ? { sourceImageUrl } : {}),
          format: args.format || "square", variantCount: 1,
          generateImage: true, imageOnly: true,
        },
      });
    }
    if (name === "tok_attach_restaurant_dish_photo") {
      await ownEntity("menu_items", String(args.menu_item_id), id);
      return deps.mutate(name, args, async () => {
        const asset = await read(actor.adminClient.from("ai_generated_assets")
          .select("id,user_id,restaurant_id,asset_type,status,asset_url,metadata")
          .eq("id", args.asset_id).eq("user_id", actor.userId).eq("restaurant_id", id).maybeSingle()) as RecordValue | null;
        const metadata = asset?.metadata && typeof asset.metadata === "object" ? asset.metadata as RecordValue : null;
        if (!asset || asset.asset_type !== "menu_visual" || asset.status !== "stored"
          || metadata?.gallery_storage_bucket !== "restaurant-images"
          || typeof asset.asset_url !== "string" || !/^https:\/\//.test(asset.asset_url)) {
          return fail(422, "tok_connect_dish_photo_unverified");
        }
        const item = await read(client.from("menu_items").update({ image_url: asset.asset_url })
          .eq("id", args.menu_item_id).eq("restaurant_id", id)
          .select("id,restaurant_id,name,image_url").maybeSingle());
        if (!item) return fail(404, "tok_connect_restaurant_menu_item_not_found");
        return ok({ item, asset_id: asset.id });
      });
    }
    if (name === "tok_list_restaurant_subscriptions") return ok({ items: await read(client.rpc("get_my_restaurant_ai_subscriptions", { p_restaurant_ids: [id] }).range(offset, offset + limit - 1)), limit, offset });
    if (name === "tok_contact_restaurant_support") return deps.invokeEdge({ confirmed_by_user: args.confirmed_by_user, idempotency_key: args.idempotency_key, capability: "support.contact", payload: { source: "restaurant_dashboard", restaurantId: id, subject: args.subject, message: args.message } });
    if (["tok_get_restaurant_profile", "tok_get_restaurant_delivery_settings", "tok_update_restaurant_profile", "tok_update_restaurant_delivery_settings"].includes(name)) {
      const delivery = name.endsWith("delivery_settings");
      const fields = delivery ? "id,delivery_available,delivery_fee,min_order_amount,opening_hours" : "id,name,description,address,city,phone,cuisine_type";
      if (name.startsWith("tok_get_")) return ok({ item: await read(client.from("restaurants").select(fields).eq("id", id).eq("owner_id", actor.userId).maybeSingle()) });
      const patch = Object.fromEntries((delivery ? ["delivery_available", "delivery_fee", "min_order_amount"] : ["name", "description", "address", "city", "phone"]).filter((key) => key in args).map((key) => [key, args[key]]));
      return deps.mutate(name, args, async () => {
        const item = await read(client.from("restaurants").update(patch).eq("id", id).eq("owner_id", actor.userId).select(fields).maybeSingle());
        if (!item) fail(404, "tok_connect_owned_restaurant_not_found");
        return ok({ item });
      });
    }
    if (name === "tok_reply_restaurant_review" || name === "tok_report_restaurant_review") {
      await ownEntity("reviews", String(args.review_id), id);
      return deps.invokeRpc({ confirmed_by_user: args.confirmed_by_user, idempotency_key: args.idempotency_key, rpc_name: name === "tok_reply_restaurant_review" ? "restaurant_reply_review" : "restaurant_report_review", args: name === "tok_reply_restaurant_review" ? { p_review_id: args.review_id, p_reply_text: args.reply_text } : { p_review_id: args.review_id, p_reason: args.reason } });
    }
    if (name === "tok_create_restaurant_news_draft") return deps.mutate(name, args, async () => ok({ item: await read(client.from("social_posts").insert({ restaurant_id: id, author_id: actor.userId, body: String(args.body).trim(), post_type: args.post_type, status: "draft", visibility: "unlisted", cta_type: "none", scheduled_at: null }).select("id,restaurant_id,body,status,post_type,visibility,created_at").single()), published: false }));
    const readModels: Record<string, { table: string; fields: string; order: string }> = {
      tok_list_restaurant_branches: { table: "restaurant_branches", fields: "id,restaurant_id,name,address,city,is_active", order: "id" },
      tok_list_restaurant_invoices: { table: "restaurant_invoices", fields: "id,restaurant_id,invoice_number,invoice_type,amount_ht,amount_tva,amount_ttc,status,period_start,period_end,due_at,paid_at", order: "created_at" },
      tok_list_restaurant_staff: { table: "restaurant_staff", fields: "id,restaurant_id,user_id,role,created_at", order: "created_at" },
      tok_list_restaurant_daily_kpis: { table: "restaurant_daily_kpis", fields: "kpi_date,revenue,orders_count,reservations_count,reviews_count,avg_ticket,cancel_rate,satisfaction_score,updated_at", order: "kpi_date" },
      tok_list_restaurant_reviews: { table: "reviews", fields: "id,restaurant_id,rating,comment,status,created_at,review_replies(id,reply_text,author_type,created_at)", order: "created_at" },
      tok_list_restaurant_news: { table: "social_posts", fields: "id,restaurant_id,body,status,post_type,visibility,scheduled_at,published_at,created_at", order: "created_at" },
    };
    const readModel = readModels[name];
    if (readModel) return ok({ items: await read(client.from(readModel.table).select(readModel.fields).eq("restaurant_id", id).order(readModel.order, { ascending: false }).range(offset, offset + limit - 1)), limit, offset });
    if (["tok_list_restaurant_floor_tables", "tok_create_restaurant_floor_table", "tok_update_restaurant_floor_table"].includes(name)) {
      await ownEntity("restaurant_branches", String(args.branch_id), id);
      const fields = "id,branch_id,table_number,capacity,is_active,sector";
      if (name === "tok_list_restaurant_floor_tables") return ok({ items: await read(client.from("reservation_tables").select(fields).eq("branch_id", args.branch_id).order("table_number").range(offset, offset + limit - 1)), limit, offset });
      return deps.mutate(name, args, async () => {
        if (name === "tok_create_restaurant_floor_table") {
          const capacity = Number(args.capacity);
          const row = { branch_id: args.branch_id, table_number: args.table_number, capacity, sector: args.sector, is_active: true, layout: { x: 72, y: 72, w: Math.max(176, capacity * 24), h: Math.max(112, capacity * 24), shape: "round", kind: "table", rotation: 0, seat_labels: Array.from({ length: capacity }, () => 1) } };
          return ok({ item: await read(client.from("reservation_tables").insert(row).select(fields).single()) });
        }
        const patch = Object.fromEntries(["table_number", "sector"].filter((key) => key in args).map((key) => [key, args[key]]));
        const item = await read(client.from("reservation_tables").update(patch).eq("id", args.table_id).eq("branch_id", args.branch_id).select(fields).maybeSingle());
        if (!item) fail(404, "tok_connect_floor_table_not_found");
        return ok({ item });
      });
    }
    if (["tok_accept_restaurant_reservation", "tok_refuse_restaurant_reservation", "tok_update_restaurant_reservation_status", "tok_update_restaurant_order_status"].includes(name)) {
      const order = name === "tok_update_restaurant_order_status";
      await ownEntity(order ? "orders" : "reservations", String(order ? args.order_id : args.reservation_id), id);
      const metadata = { confirmed_by_user: args.confirmed_by_user, idempotency_key: args.idempotency_key };
      if (order) return deps.invokeEdge({ ...metadata, capability: "restaurant.orders.status", payload: { order_id: args.order_id, status: args.status } });
      const refusal = name === "tok_refuse_restaurant_reservation";
      return deps.invokeRpc({ ...metadata, rpc_name: refusal ? "cancel_reservation_by_restaurant" : "update_restaurant_reservation_status_safe", args: refusal ? { p_reservation_id: args.reservation_id, p_reason_code: args.reason_code, p_reason_details: args.reason_details || null } : { p_reservation_id: args.reservation_id, p_status: name === "tok_accept_restaurant_reservation" ? "confirmed" : args.status } });
    }
    if (name.includes("hours")) {
      const operation = async () => {
        const row = await read(client.from("restaurants").select("id,opening_hours").eq("id", id).eq("owner_id", actor.userId).maybeSingle()) as RecordValue | null;
        if (!row) return fail(404, "tok_connect_owned_restaurant_not_found");
        if (name === "tok_list_restaurant_hours") return ok({ restaurant_id: id, opening_hours: row.opening_hours, source: "restaurants.opening_hours" });
        let next: RecordValue;
        try { next = prepareTokServiceSettings(row.opening_hours, args, name === "tok_create_restaurant_hours"); }
        catch (error) { return { statusCode: 400, payload: { ok: false, error: { message: error instanceof Error ? error.message : "tok_connect_service_settings_invalid" } } }; }
        let query = client.from("restaurants").update({ opening_hours: next }).eq("id", id).eq("owner_id", actor.userId);
        // A concurrent native UI edit must not be overwritten by the MCP merge.
        query = row.opening_hours === null ? query.is("opening_hours", null) : query.filter("opening_hours", "eq", JSON.stringify(row.opening_hours));
        const item = await read(query.select("id,opening_hours").maybeSingle());
        if (!item) return { statusCode: 409, payload: { ok: false, error: { message: "tok_connect_service_settings_changed_refresh_required" } } };
        return ok({ item, source: "restaurants.opening_hours" });
      };
      return name === "tok_list_restaurant_hours" ? operation() : deps.mutate(name, args, operation);
    }
    const menu = name.includes("menu");
    const promotion = name.includes("promotion");
    const table = menu ? "menu_items" : promotion ? "restaurant_promotions" : name.includes("reservations") ? "reservations" : "orders";
    const fields = menu ? "id,restaurant_id,name,description,category,price,is_available,image_url" : promotion ? "id,restaurant_id,name,promotion_type,promotion_value,start_at,end_at,active,target" : table === "reservations" ? "id,restaurant_id,date,time,party_size,status,feature,created_at" : "id,restaurant_id,status,payment_status,total_amount,created_at";
    if (name.startsWith("tok_create_")) {
      const values: RecordValue = { restaurant_id: id };
      const keys = menu ? ["name", "description", "category", "is_available"] : Object.keys(promotionFields);
      for (const key of keys) if (key in args) values[key] = args[key];
      if (menu) values.price = args.price_chf;
      return deps.mutate(name, args, async () => ok({ item: await read(client.from(table).insert(values).select(fields).single()) }));
    }
    if (name.startsWith("tok_list_")) {
      let query = client.from(table).select(fields).eq("restaurant_id", id);
      if (args.date) query = query.eq("date", args.date);
      return ok({ items: await read(query.order("id").range(offset, offset + limit - 1)), limit, offset });
    }
    const entityId = String(menu ? args.menu_item_id : args.promotion_id);
    if (name.startsWith("tok_delete_")) return deps.mutate(name, args, async () => {
      await ownEntity(table, entityId, id);
      const item = await read(client.from(table).delete().eq("id", entityId).eq("restaurant_id", id).select("id").maybeSingle());
      if (!item) return fail(404, "tok_connect_restaurant_entity_not_found");
      return ok({ deleted: true, id: entityId });
    });
    await ownEntity(table, entityId, id);
    const patch: RecordValue = promotion ? { active: args.active } : Object.fromEntries(["name", "description", "category", "is_available"].filter((key) => key in args).map((key) => [key, args[key]]));
    if (menu && "price_chf" in args) patch.price = args.price_chf;
    return deps.mutate(name, args, async () => {
      const data = await read(client.from(table).update(patch).eq("id", entityId).eq("restaurant_id", id).select(fields).maybeSingle());
      if (!data) return fail(404, "tok_connect_restaurant_entity_not_found");
      return ok({ item: data });
    });
  }
  if (name === "tok_get_my_account") return ok({ profile: await read(client.from("profiles").select("full_name,phone,address,city,avatar_url,current_tier,loyalty_points").eq("user_id", actor.userId).maybeSingle()) });
  if (name === "tok_get_my_loyalty") return ok({ loyalty: await read(client.from("loyalty_accounts").select("current_points,lifetime_points,tier_id,updated_at").eq("user_id", actor.userId).maybeSingle()) });
  if (name === "tok_update_my_profile") {
    // update_client_profile replaces the complete profile atomically across both
    // native tables. Merge absent fields from the caller's own current records.
    return deps.mutate(name, args, async () => {
      const profile = (await read(client.from("profiles").select("full_name,phone,address,city,avatar_url,date_of_birth").eq("user_id", actor.userId).maybeSingle()) || {}) as RecordValue;
      const userProfile = (await read(client.from("user_profiles").select("first_name,last_name").eq("user_id", actor.userId).maybeSingle()) || {}) as RecordValue;
      const merged = { ...profile, ...userProfile, ...args };
      const rpcArgs = Object.fromEntries(["full_name", "first_name", "last_name", "phone", "address", "city", "avatar_url", "date_of_birth"].map((key) => ["p_" + key, merged[key] ?? null]));
      await read(client.rpc("update_client_profile", rpcArgs));
      return ok({ updated: true });
    });
  }
  const personalModels: Record<string, { table: string; fields: string }> = {
    tok_list_my_tok_one_subscriptions: { table: "tok_one_subscriptions", fields: "id,plan_id,status,current_period_start,current_period_end,cancel_at_period_end,updated_at" },
    tok_list_my_meal_subscriptions: { table: "user_subscriptions", fields: "id,restaurant_id,menu_item_id,day_of_week,preferred_time,is_active,created_at" },
    tok_list_my_support_tickets: { table: "support_incidents", fields: "id,restaurant_id,order_id,reservation_id,category,status,subject,description,created_at,updated_at" },
  };
  const personalModel = personalModels[name];
  if (personalModel) return ok({ items: await read(client.from(personalModel.table).select(personalModel.fields).eq("user_id", actor.userId).order("created_at", { ascending: false }).range(offset, offset + limit - 1)), limit, offset });
  const table = name.includes("notification") ? "notifications" : name.includes("favorite") ? "favorites" : "reviews";
  if (name.startsWith("tok_list_my_")) {
    const fields = table === "notifications" ? "id,title,body,type,category,read_at,created_at" : table === "favorites" ? "id,restaurant_id,created_at" : "id,restaurant_id,rating,comment,status,created_at";
    return ok({ items: await read(client.from(table).select(fields).eq("user_id", actor.userId).order("created_at", { ascending: false }).range(offset, offset + limit - 1)), limit, offset });
  }
  if (name === "tok_mark_my_notification_read") return deps.mutate(name, args, async () => {
    const data = await read(client.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", args.notification_id).eq("user_id", actor.userId).select("id,read_at").maybeSingle());
    if (!data) return fail(404, "tok_connect_notification_not_found");
    return ok({ item: data });
  });
  if (name === "tok_set_my_favorite") return deps.mutate(name, args, async () => {
    if (args.favorite) {
      const existing = await read(client.from("favorites").select("id").eq("restaurant_id", args.restaurant_id).eq("user_id", actor.userId).maybeSingle());
      if (!existing) {
        const { error } = await client.from("favorites").insert({ restaurant_id: args.restaurant_id, user_id: actor.userId });
        // A concurrent addition reaches the same desired state under the unique user/restaurant constraint.
        if (error && error.code !== "23505") return fail(503, "tok_connect_favorite_unavailable");
      }
    } else await read(client.from("favorites").delete().eq("restaurant_id", args.restaurant_id).eq("user_id", actor.userId));
    return ok({ restaurant_id: args.restaurant_id, favorite: args.favorite });
  });
  return fail(404, "tok_connect_operation_not_found");
}
