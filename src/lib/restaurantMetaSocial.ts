import { getSupabase } from "@/integrations/supabase/client";

export type RestaurantMetaAccount = {
  id: string;
  pageId: string;
  pageName: string;
  instagramUserId: string | null;
  instagramUsername: string | null;
  enabled: boolean;
  connected: boolean;
};

export type RestaurantMetaPublicationResult = {
  channel: "facebook" | "instagram";
  status: "published" | "failed" | "unknown" | "processing";
  externalId?: string | null;
  reason?: string | null;
};

type MetaResponse = {
  ok: boolean;
  error?: string;
  accounts?: RestaurantMetaAccount[];
  url?: string;
  results?: RestaurantMetaPublicationResult[];
};

async function requestMeta(body: Record<string, unknown>): Promise<MetaResponse> {
  const { data, error } = await getSupabase().functions.invoke("restaurant-meta-social", { body });
  if (error) throw new Error("Connexion au service Meta impossible. Réessayez plus tard.");
  const result = data as MetaResponse | null;
  if (!result?.ok) throw new Error(result?.error || "L'opération Meta a été refusée.");
  return result;
}

export async function listRestaurantMetaAccounts(restaurantId: string) {
  const result = await requestMeta({ action: "accounts", restaurantId });
  return result.accounts || [];
}

export async function startRestaurantMetaConnection(restaurantId: string) {
  const result = await requestMeta({ action: "start", restaurantId });
  if (!result.url || !result.url.startsWith("https://www.facebook.com/")) {
    throw new Error("Adresse OAuth Meta invalide.");
  }
  window.location.assign(result.url);
}

export async function selectRestaurantMetaAccount(restaurantId: string, accountId: string) {
  return requestMeta({ action: "select", restaurantId, accountId });
}

export async function disconnectRestaurantMetaAccount(restaurantId: string, accountId: string) {
  return requestMeta({ action: "disconnect", restaurantId, accountId });
}

export async function publishRestaurantMetaContent(
  restaurantId: string,
  sourceType: "post" | "campaign",
  sourceId: string,
  channels: Array<"facebook" | "instagram">,
): Promise<RestaurantMetaPublicationResult[]> {
  const result = await requestMeta({ action: "publish", restaurantId, sourceType, sourceId, channels });
  return result.results || [];
}
