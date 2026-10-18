/** Public permission vocabulary. This module contains no credentials or server imports. */
export const TOK_OAUTH_SCOPE_LABELS: Record<string, string> = {
  "restaurants:read": "Rechercher et consulter les restaurants",
  "availability:read": "Consulter les disponibilités",
  "reservations:create": "Créer mes réservations",
  "reservations:cancel": "Annuler mes réservations",
  "account:read": "Lire mon profil, mes favoris et mes notifications",
  "account:write": "Modifier mon profil, mes favoris et mes notifications",
  "orders:read": "Lire mes commandes et leurs paiements",
  "orders:create": "Préparer mes commandes et leurs paiements",
  "subscriptions:read": "Consulter mes abonnements et leurs tarifs",
  "subscriptions:write": "Souscrire et gérer mes abonnements",
  "loyalty:write": "Envoyer et réclamer mes cadeaux MIAMZ",
  "reviews:write": "Publier mes avis vérifiés",
  "support:write": "Créer mes demandes de support",
  "restaurant:read": "Consulter la gestion des restaurants sélectionnés",
  "restaurant:write": "Modifier la gestion des restaurants sélectionnés",
  "restaurant:generate": "Générer des campagnes et images avec mes crédits TOK",
  "credits:read": "Consulter les crédits des restaurants sélectionnés",
  "campaigns:preview": "Préparer un aperçu de campagne",
  "analytics:read": "Lire les indicateurs des restaurants sélectionnés",
  "autopilot:plan": "Préparer un plan pour les restaurants sélectionnés",
};
export const TOK_OAUTH_DEFAULT_SCOPES = ["restaurants:read", "availability:read"];
export const TOK_OAUTH_RESTAURANT_SCOPES = new Set([
  "restaurant:read", "restaurant:write", "restaurant:generate", "credits:read",
  "campaigns:preview", "analytics:read", "autopilot:plan",
]);
export const TOK_OAUTH_OWNER_SCOPES = new Set(["restaurant:read", "restaurant:write", "restaurant:generate"]);
export type TokOAuthGrant = {
  id: string; user_id: string; client_id: string; client_name: string; scopes: string[];
  restaurant_ids: string[]; revision: number; created_at: string; updated_at: string;
  expires_at: string; revoked_at: string | null;
};

const toolsByScope: Record<string, readonly string[]> = {
  "restaurants:read": ["tok_search_restaurants", "tok_get_restaurant", "tok_get_restaurant_menu", "tok_list_customer_special_offers"],
  "availability:read": ["tok_get_availability", "tok_check_availability"],
  "reservations:create": ["tok_quote_reservation", "tok_book_table"],
  "reservations:cancel": ["tok_cancel_my_reservation"],
  "account:read": ["tok_my_reservations", "tok_get_my_account", "tok_get_my_loyalty", "tok_list_my_support_tickets", "tok_list_my_notifications", "tok_list_my_favorites", "tok_list_my_reviews", "tok_check_my_review_eligibility"],
  "account:write": ["tok_update_my_profile", "tok_mark_my_notification_read", "tok_set_my_favorite"],
  "orders:read": ["tok_my_orders", "tok_customer_payment_status"],
  "orders:create": ["tok_quote_customer_cart", "tok_checkout_customer_cart", "tok_cancel_cart_payment_attempt"],
  "subscriptions:read": ["tok_list_my_tok_one_subscriptions", "tok_list_my_meal_subscriptions", "tok_quote_my_tok_one_subscription", "tok_list_tok_one_plans", "tok_quote_tok_one_plan"],
  "subscriptions:write": ["tok_cancel_my_tok_one_subscription", "tok_resume_my_tok_one_subscription", "tok_checkout_my_tok_one_plan"],
  "loyalty:write": ["tok_send_my_gift_points", "tok_claim_my_gift_points"],
  "reviews:write": ["tok_submit_my_verified_review"],
  "support:write": ["tok_create_my_support_incident"],
  "restaurant:read": ["tok_list_my_restaurants", "tok_list_restaurant_reservations", "tok_list_restaurant_orders", "tok_list_restaurant_menu", "tok_list_restaurant_marketing_references", "tok_list_restaurant_marketing_assets", "tok_list_restaurant_hours", "tok_list_restaurant_promotions", "tok_list_restaurant_branches", "tok_list_restaurant_invoices", "tok_list_restaurant_staff", "tok_list_restaurant_daily_kpis", "tok_list_restaurant_subscriptions", "tok_list_restaurant_subscription_plans", "tok_list_restaurant_floor_tables", "tok_get_restaurant_profile", "tok_get_restaurant_delivery_settings", "tok_list_restaurant_reviews", "tok_list_restaurant_news", "tok_get_restaurant_floor_plan", "tok_list_restaurant_anti_waste", "tok_list_restaurant_flash_sale"],
  "restaurant:write": ["tok_accept_restaurant_reservation", "tok_refuse_restaurant_reservation", "tok_update_restaurant_reservation_status", "tok_update_restaurant_order_status", "tok_create_restaurant_menu_item", "tok_attach_restaurant_dish_photo", "tok_delete_restaurant_menu_item", "tok_update_restaurant_menu_item", "tok_update_restaurant_hours", "tok_create_restaurant_promotion", "tok_delete_restaurant_promotion", "tok_set_restaurant_promotion_active", "tok_contact_restaurant_support", "tok_create_restaurant_floor_table", "tok_update_restaurant_floor_table", "tok_create_restaurant_hours", "tok_update_restaurant_profile", "tok_update_restaurant_delivery_settings", "tok_reply_restaurant_review", "tok_report_restaurant_review", "tok_create_restaurant_news_draft", "tok_add_table_restaurant_floor_plan", "tok_save_table_restaurant_floor_plan", "tok_delete_table_restaurant_floor_plan", "tok_set_layout_restaurant_floor_plan", "tok_assign_reservation_restaurant_floor_plan", "tok_set_preferred_table_restaurant_floor_plan", "tok_create_restaurant_anti_waste", "tok_set_status_restaurant_anti_waste", "tok_archive_restaurant_anti_waste", "tok_create_restaurant_flash_sale", "tok_set_status_restaurant_flash_sale", "tok_archive_restaurant_flash_sale"],
  "restaurant:generate": ["tok_generate_restaurant_campaign_draft", "tok_generate_restaurant_marketing_visual", "tok_generate_restaurant_dish_photo"],
};
const scopeByTool = new Map(Object.entries(toolsByScope).flatMap(([scope, tools]) => tools.map((name) => [name, scope] as const)));
export function tokOAuthScopeForTool(name: string): string | null { return scopeByTool.get(name) || null; }

/** Native Edge dependencies of named operations. Generic RPC/data/Edge routes are excluded. */
export const TOK_OAUTH_EDGE_DEPENDENCIES: Record<string, readonly string[]> = {
  tok_quote_reservation: ["create-reservation"], tok_book_table: ["create-reservation"],
  tok_quote_customer_cart: ["validate-order"], tok_checkout_customer_cart: ["validate-order", "create-checkout"],
  tok_customer_payment_status: ["payment-attempt-status"], tok_cancel_cart_payment_attempt: ["cancel-payment-attempt"],
  tok_cancel_my_tok_one_subscription: ["manage-tok-one-subscription"],
  tok_quote_my_tok_one_subscription: ["manage-tok-one-subscription"],
  tok_resume_my_tok_one_subscription: ["manage-tok-one-subscription"],
  tok_checkout_my_tok_one_plan: ["create-checkout"],
  tok_generate_restaurant_campaign_draft: ["ai-campaign-studio"],
  tok_generate_restaurant_marketing_visual: ["ai-image-enhance"],
  tok_generate_restaurant_dish_photo: ["ai-image-enhance"],
  tok_contact_restaurant_support: ["contact-support"],
  tok_update_restaurant_order_status: ["restaurant-order-status"],
};

/** Decode only after Auth.getUser has verified this exact token. Never an authentication primitive. */
export function readVerifiedTokOAuthClaims(token: string): Record<string, unknown> {
  try {
    const segment = token.split(".")[1];
    if (!segment) return {};
    const raw = atob(segment.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - segment.length % 4) % 4));
    const value = JSON.parse(new TextDecoder().decode(Uint8Array.from(raw, (character) => character.charCodeAt(0))));
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}
