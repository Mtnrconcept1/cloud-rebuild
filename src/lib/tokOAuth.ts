import { getSupabase } from "@/integrations/supabase/client";
import { TOK_OAUTH_DEFAULT_SCOPES, TOK_OAUTH_RESTAURANT_SCOPES, TOK_OAUTH_SCOPE_LABELS, TOK_OAUTH_OWNER_SCOPES, type TokOAuthGrant } from "../../supabase/functions/_shared/tok-connect-oauth-policy";
export { TOK_OAUTH_DEFAULT_SCOPES, TOK_OAUTH_RESTAURANT_SCOPES, TOK_OAUTH_SCOPE_LABELS, TOK_OAUTH_OWNER_SCOPES, type TokOAuthGrant };
export type TokOAuthRestaurant = { id: string; name: string; is_owner: boolean };
type Result = { data: unknown; error: unknown };
type GrantClient = {
  rpc: (name: string, params?: Record<string, unknown>) => PromiseLike<Result>;
  from: (name: string) => { select: (columns: string) => { order: (column: string, options: { ascending: boolean }) => { limit: (count: number) => PromiseLike<Result> } } };
};
const client = () => getSupabase() as unknown as GrantClient;
export async function listTokOAuthRestaurants(): Promise<TokOAuthRestaurant[]> {
  const { data, error } = await client().rpc("list_tok_connect_oauth_restaurants");
  if (error) throw new Error("Les restaurants autorisables ne peuvent pas être chargés.");
  return Array.isArray(data) ? data as TokOAuthRestaurant[] : [];
}
export async function listManagedTokOAuthClients(ids: string[]): Promise<string[]> {
  if (!ids.length) return [];
  const { data, error } = await client().rpc("get_tok_connect_managed_oauth_clients", { p_client_ids: [...new Set(ids)].slice(0, 100) });
  if (error) throw new Error("La protection de cette connexion TOK ne peut pas être vérifiée.");
  return Array.isArray(data) ? data.filter((id): id is string => typeof id === "string") : [];
}
export async function listTokOAuthGrants(): Promise<TokOAuthGrant[]> {
  const { data, error } = await client().from("tok_connect_oauth_grants")
    .select("id,user_id,client_id,client_name,scopes,restaurant_ids,revision,created_at,updated_at,expires_at,revoked_at")
    .order("updated_at", { ascending: false }).limit(100);
  if (error) throw new Error("Les permissions des applications ne peuvent pas être chargées.");
  return Array.isArray(data) ? data as TokOAuthGrant[] : [];
}
export async function saveTokOAuthGrant(clientId: string, clientName: string, scopes: string[], restaurantIds: string[]): Promise<TokOAuthGrant> {
  if (!clientId || !scopes.length) throw new Error("Choisissez au moins une permission pour cette application.");
  if (scopes.some((scope) => TOK_OAUTH_RESTAURANT_SCOPES.has(scope)) && !restaurantIds.length) {
    throw new Error("Sélectionnez au moins un restaurant pour les permissions de gestion.");
  }
  const { data, error } = await client().rpc("set_tok_connect_oauth_grant", { p_client_id: clientId, p_client_name: clientName, p_scopes: scopes, p_restaurant_ids: restaurantIds });
  if (error || !data) throw new Error("Vos permissions TOK n’ont pas été enregistrées. Aucun accès supplémentaire n’a été confirmé.");
  return data as TokOAuthGrant;
}
export async function revokeTokOAuthConnection(clientId: string): Promise<void> {
  // Revoke business access and opaque tokens first, including when Auth is unavailable.
  const business = await client().rpc("revoke_tok_connect_oauth_grant", { p_client_id: clientId });
  if (business.error || business.data !== true) throw new Error("La révocation TOK a échoué. La coupure des accès n’est pas confirmée ; réessayez.");
  const identity = await getSupabase().auth.oauth.revokeGrant({ clientId });
  if (identity.error) throw new Error("Les accès métier TOK sont coupés. La connexion d’identité n’a pas encore été révoquée ; réessayez.");
}
