import {
  HttpError,
  authenticateRequest,
  createAdminClient,
  getEnv,
  jsonResponse,
  requireRestaurantAccess,
  type RequestActor,
} from "../_shared/auth.ts";
import {
  buildCorsHeaders,
  handleCorsPreflight,
  isRequestOriginAllowed,
} from "../_shared/cors.ts";
import {
  buildRestaurantMetaCaption,
  isActiveRestaurantMetaCampaign,
  normalizeMetaChannels,
  normalizeRestaurantMetaImageUrl,
  type RestaurantMetaChannel,
} from "../_shared/restaurant-meta-helpers.ts";

const GRAPH_VERSION = "v26.0";
const GRAPH_BASE = "https://graph.facebook.com/" + GRAPH_VERSION + "/";
const OAUTH_BASE = "https://www.facebook.com/" + GRAPH_VERSION + "/dialog/oauth";
const CALLBACK_PATH = "/functions/v1/restaurant-meta-social";
const RETURN_URL = "https://www.thetok.ch/dashboard/reseaux-sociaux";
const SCOPES = "pages_show_list,pages_manage_posts,pages_read_engagement,instagram_basic,instagram_content_publish";
const encoder = new TextEncoder();
type DataRow = Record<string, any>;

function uuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
function numericId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9]{5,60}$/.test(value);
}
function requireMetaConfig() {
  const appId = getEnv("META_APP_ID");
  const appSecret = getEnv("META_APP_SECRET");
  const tokenKey = getEnv("META_RESTAURANT_TOKEN_KEY");
  const supabaseUrl = getEnv("SUPABASE_URL");
  if (!numericId(appId) || !appSecret || !tokenKey || !supabaseUrl.startsWith("https://")) {
    throw new HttpError(503, "Connexion Meta non configurée.");
  }
  let secretBytes: Uint8Array;
  try {
    secretBytes = Uint8Array.from(atob(tokenKey), (character) => character.charCodeAt(0));
  } catch {
    throw new HttpError(503, "Chiffrement Meta indisponible.");
  }
  if (secretBytes.length !== 32) throw new HttpError(503, "Chiffrement Meta indisponible.");
  const redirectUri = new URL(CALLBACK_PATH, supabaseUrl).toString();
  return { appId, appSecret, secretBytes, supabaseUrl, redirectUri };
}
async function encryptionKey(raw: Uint8Array) {
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
function toBase64(bytes: Uint8Array): string {
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
}
function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}
async function encryptToken(token: string, raw: Uint8Array): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(raw),
    encoder.encode(token),
  );
  return toBase64(iv) + "." + toBase64(new Uint8Array(cipher));
}
async function decryptToken(payload: string, raw: Uint8Array): Promise<string> {
  const parts = payload.split(".");
  if (parts.length !== 2) throw new HttpError(503, "Jeton Meta indisponible.");
  try {
    const clear = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(parts[0]) },
      await encryptionKey(raw),
      fromBase64(parts[1]),
    );
    return new TextDecoder().decode(clear);
  } catch {
    throw new HttpError(503, "Jeton Meta indisponible.");
  }
}
async function hashState(state: string): Promise<string> {
  const hashed = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(state)));
  return Array.from(hashed, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function appSecretProof(token: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const proof = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(token)));
  return Array.from(proof, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function graphJson(
  path: string,
  token: string | null = null,
  params?: Record<string, string>,
  method: "GET" | "POST" = "GET",
): Promise<DataRow> {
  const url = new URL(path.replace(/^\/+/, ""), GRAPH_BASE);
  const headers: Record<string, string> = { Accept: "application/json" };
  const form = new URLSearchParams(params || {});
  if (token) {
    headers.Authorization = "Bearer " + token;
    form.set("appsecret_proof", await appSecretProof(token, getEnv("META_APP_SECRET")));
  }
  const options: RequestInit = { method, headers, redirect: "error", signal: AbortSignal.timeout(15_000) };
  if (method === "GET") url.search = form.toString();
  else {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    options.body = form.toString();
  }
  const response = await fetch(url, options);
  const result = await response.json().catch(() => null) as DataRow | null;
  if (!response.ok || !result || typeof result !== "object" || result.error) {
    throw new HttpError(502, "Meta a refusé l'opération. Vérifiez les autorisations du compte.");
  }
  return result;
}
function redirectResult(ok: boolean): Response {
  const target = new URL(RETURN_URL);
  target.searchParams.set("meta", ok ? "connected" : "failed");
  return new Response(null, {
    status: 303,
    headers: { Location: target.toString(), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}
function safeAccount(row: DataRow) {
  return {
    id: row.id,
    pageId: row.page_id,
    pageName: row.page_name,
    instagramUserId: row.instagram_user_id,
    instagramUsername: row.instagram_username,
    enabled: row.enabled === true,
    connected: Boolean(row.encrypted_page_token) && !row.disconnected_at,
  };
}

async function oauthCallback(req: Request): Promise<Response> {
  try {
    const params = new URL(req.url).searchParams;
    const state = params.get("state") || "";
    const code = params.get("code") || "";
    if (!/^[A-Za-z0-9_-]{40,90}$/.test(state) || !code || code.length > 2500 || params.has("error")) {
      return redirectResult(false);
    }
    const config = requireMetaConfig();
    const admin = createAdminClient();
    const { data: claim, error: claimError } = await admin.from("restaurant_meta_oauth_states")
      .update({ consumed_at: new Date().toISOString() })
      .eq("state_hash", await hashState(state))
      .is("consumed_at", null)
      .gt("expires_at", new Date().toISOString())
      .select("restaurant_id,user_id")
      .maybeSingle();
    if (claimError || !claim) return redirectResult(false);
    // Ownership may have changed since OAuth started.
    const { data: restaurant } = await admin.from("restaurants")
      .select("owner_id,is_demo").eq("id", claim.restaurant_id).maybeSingle();
    if (!restaurant || restaurant.owner_id !== claim.user_id || restaurant.is_demo) return redirectResult(false);

    const exchangeUrl = new URL("oauth/access_token", GRAPH_BASE);
    exchangeUrl.search = new URLSearchParams({
      client_id: config.appId, client_secret: config.appSecret,
      redirect_uri: config.redirectUri, code,
    }).toString();
    const exchange = await fetch(exchangeUrl, {
      redirect: "error", signal: AbortSignal.timeout(15_000),
    });
    const short = await exchange.json().catch(() => null) as DataRow | null;
    if (!exchange.ok || !short || typeof short.access_token !== "string") return redirectResult(false);

    const long = await graphJson("oauth/access_token", null, {
      grant_type: "fb_exchange_token", client_id: config.appId,
      client_secret: config.appSecret, fb_exchange_token: short.access_token,
    });
    if (typeof long.access_token !== "string") return redirectResult(false);

    const pages = await graphJson(
      "me/accounts", long.access_token,
      { fields: "id,name,access_token,instagram_business_account{id,username}", limit: "100" },
    );
    if (!Array.isArray(pages.data) || pages.data.length === 0 || pages.paging?.next) {
      // Incomplete pagination is not consent to publishing to an arbitrary Page.
      return redirectResult(false);
    }
    let count = 0;
    for (const page of pages.data) {
      if (!numericId(page.id) || typeof page.access_token !== "string" || typeof page.name !== "string") continue;
      const ig = page.instagram_business_account;
      const encrypted = await encryptToken(page.access_token, config.secretBytes);
      const { error } = await admin.from("restaurant_meta_accounts").upsert({
        restaurant_id: claim.restaurant_id,
        connected_by: claim.user_id,
        page_id: page.id,
        page_name: page.name.slice(0, 200) || "Page Facebook",
        instagram_user_id: numericId(ig?.id) ? ig.id : null,
        instagram_username: typeof ig?.username === "string" ? ig.username.slice(0, 120) : null,
        encrypted_page_token: encrypted,
        enabled: false,
        disconnected_at: null,
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "restaurant_id,page_id" });
      if (error) throw new Error("storage_error");
      count++;
    }
    return redirectResult(count > 0);
  } catch {
    return redirectResult(false);
  }
}
async function readAccounts(actor: RequestActor, restaurantId: string) {
  const { data, error } = await actor.adminClient.from("restaurant_meta_accounts")
    .select("id,page_id,page_name,instagram_user_id,instagram_username,enabled,encrypted_page_token,disconnected_at")
    .eq("restaurant_id", restaurantId).order("connected_at", { ascending: false }).limit(100);
  if (error) throw new HttpError(500, "Comptes Meta indisponibles.");
  return (data || []).map(safeAccount);
}
async function readContent(actor: RequestActor, restaurantId: string, type: string, id: string) {
  if (type === "post") {
    const { data, error } = await actor.adminClient.from("social_posts")
      .select("body,status,published_at").eq("id", id).eq("restaurant_id", restaurantId).maybeSingle();
    if (error || !data || data.status !== "published") {
      throw new HttpError(409, "L'actualité doit d'abord être publiée sur TOK.");
    }
    const { data: media, error: mediaError } = await actor.adminClient.from("social_post_media")
      .select("media_url,media_type").eq("post_id", id).order("sort_order", { ascending: true }).limit(10);
    if (mediaError) throw new HttpError(500, "Médias indisponibles.");
    const image = (media || []).find((item: DataRow) =>
      typeof item.media_type === "string" && item.media_type.startsWith("image"));
    return { caption: buildRestaurantMetaCaption(null, data.body), imageUrl: image?.media_url || null };
  }
  if (type === "campaign") {
    const { data, error } = await actor.adminClient.from("ad_campaigns")
      .select("title,body,image_url,status,payment_status").eq("id", id)
      .eq("restaurant_id", restaurantId).maybeSingle();
    if (error || !data || !isActiveRestaurantMetaCampaign(data.status, data.payment_status)) {
      throw new HttpError(409, "La campagne doit être active et payée sur TOK.");
    }
    return { caption: buildRestaurantMetaCaption(data.title, data.body), imageUrl: data.image_url };
  }
  throw new HttpError(400, "Type de contenu inconnu.");
}
async function sendToMeta(
  channel: RestaurantMetaChannel,
  account: DataRow,
  token: string,
  caption: string,
  imageUrl: string | null,
) {
  if (channel === "facebook") {
    const path = account.page_id + (imageUrl ? "/photos" : "/feed");
    const result = await graphJson(
      path, token,
      imageUrl ? { url: imageUrl, caption } : { message: caption },
      "POST",
    );
    if (typeof result.id !== "string") throw new HttpError(502, "Identifiant de publication Meta manquant.");
    return result.id as string;
  }
  if (!numericId(account.instagram_user_id)) throw new HttpError(409, "Aucun Instagram professionnel lié à cette Page.");
  if (!imageUrl) throw new HttpError(422, "Une image publique TOK est requise pour Instagram.");
  const container = await graphJson(account.instagram_user_id + "/media", token, {
    image_url: imageUrl, caption,
  }, "POST");
  if (typeof container.id !== "string") throw new HttpError(502, "Création Instagram non confirmée.");
  let ready = false;
  for (let attempt = 0; attempt < 6; attempt++) {
    const status = await graphJson(container.id, token, { fields: "status_code" });
    if (status.status_code === "FINISHED") { ready = true; break; }
    if (status.status_code === "ERROR" || status.status_code === "EXPIRED") break;
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
  if (!ready) throw new HttpError(502, "Média Instagram non prêt : vérification manuelle nécessaire.");
  const published = await graphJson(account.instagram_user_id + "/media_publish", token, {
    creation_id: container.id,
  }, "POST");
  if (typeof published.id !== "string") throw new HttpError(502, "Publication Instagram non confirmée.");
  return published.id as string;
}
async function publish(
  actor: RequestActor,
  restaurantId: string,
  sourceType: string,
  sourceId: string,
  channels: RestaurantMetaChannel[],
) {
  if (!uuid(sourceId) || !["post", "campaign"].includes(sourceType) || channels.length === 0) {
    throw new HttpError(400, "Publication invalide.");
  }
  const config = requireMetaConfig();
  const { data: account, error: accountError } = await actor.adminClient.from("restaurant_meta_accounts")
    .select("id,page_id,instagram_user_id,encrypted_page_token,enabled,disconnected_at")
    .eq("restaurant_id", restaurantId).eq("enabled", true).maybeSingle();
  if (accountError || !account || !account.encrypted_page_token || account.disconnected_at) {
    throw new HttpError(409, "Connectez et choisissez votre Page Meta d'abord.");
  }
  const content = await readContent(actor, restaurantId, sourceType, sourceId);
  if (!content.caption) throw new HttpError(422, "Le texte de la publication est vide.");
  const imageUrl = normalizeRestaurantMetaImageUrl(content.imageUrl, config.supabaseUrl);
  if (channels.includes("instagram") && (!numericId(account.instagram_user_id) || !imageUrl)) {
    throw new HttpError(422, "Une image TOK publique et un Instagram professionnel associé sont requis.");
  }
  const token = await decryptToken(account.encrypted_page_token, config.secretBytes);
  const results: Array<Record<string, unknown>> = [];
  for (const channel of channels) {
    // Unique constraint reserves this exact post/channel before any external effect.
    const { data: claim, error: insertError } = await actor.adminClient
      .from("restaurant_meta_publications").insert({
        restaurant_id: restaurantId,
        account_id: account.id,
        source_type: sourceType,
        source_id: sourceId,
        channel,
        requested_by: actor.userId,
      }).select("id").maybeSingle();
    if (insertError?.code === "23505") {
      const { data: previous } = await actor.adminClient.from("restaurant_meta_publications")
        .select("status,external_id").eq("account_id", account.id)
        .eq("source_type", sourceType).eq("source_id", sourceId).eq("channel", channel).maybeSingle();
      results.push({ channel, status: previous?.status || "processing", externalId: previous?.external_id || null });
      continue;
    }
    if (insertError || !claim) throw new HttpError(500, "Réservation de publication impossible.");
    try {
      const externalId = await sendToMeta(channel, account, token, content.caption, imageUrl);
      const { error } = await actor.adminClient.from("restaurant_meta_publications").update({
        status: "published", external_id: externalId, finished_at: new Date().toISOString(),
      }).eq("id", claim.id).eq("status", "processing");
      if (error) throw new Error("db_confirmation_failed");
      results.push({ channel, status: "published", externalId });
    } catch (error) {
      // A provider timeout or DB failure may follow a successful external effect.
      // Never retry without provider-side reconciliation: no accidental duplicate posts.
      await actor.adminClient.from("restaurant_meta_publications").update({
        status: "unknown",
        failure_code: error instanceof HttpError ? "meta_rejected_or_unconfirmed" : "meta_result_uncertain",
        finished_at: new Date().toISOString(),
      }).eq("id", claim.id).eq("status", "processing");
      results.push({ channel, status: "unknown", reason: "Résultat Meta non confirmé ; vérifiez directement votre Page avant toute nouvelle publication." });
    }
  }
  return results;
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, cors);
  if (preflight) return preflight;
  if (req.method === "GET") {
    if (!new URL(req.url).searchParams.has("state")) return redirectResult(false);
    return oauthCallback(req);
  }
  try {
    if (req.method !== "POST" || !isRequestOriginAllowed(req)) {
      throw new HttpError(403, "Requête refusée.");
    }
    const actor = await authenticateRequest(req);
    if (!actor.userId || !actor.roles.includes("restaurateur") && !actor.isAdmin) {
      throw new HttpError(403, "Accès restaurateur requis.");
    }
    const body = await req.json().catch(() => null) as DataRow | null;
    const action = body?.action;
    const restaurantId = body?.restaurantId;
    if (!uuid(restaurantId)) throw new HttpError(400, "Restaurant invalide.");
    await requireRestaurantAccess(actor, restaurantId);
    if (action === "accounts") {
      return jsonResponse({ ok: true, accounts: await readAccounts(actor, restaurantId) }, 200, cors);
    }
    if (action === "start") {
      const config = requireMetaConfig();
      const state = toBase64(crypto.getRandomValues(new Uint8Array(32)))
        .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
      const { error } = await actor.adminClient.from("restaurant_meta_oauth_states").insert({
        state_hash: await hashState(state),
        restaurant_id: restaurantId,
        user_id: actor.userId,
        expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      });
      if (error) throw new HttpError(500, "Initialisation Meta impossible.");
      const url = new URL(OAUTH_BASE);
      url.search = new URLSearchParams({
        client_id: config.appId, redirect_uri: config.redirectUri,
        state, response_type: "code", scope: SCOPES,
      }).toString();
      return jsonResponse({ ok: true, url: url.toString() }, 200, cors);
    }
    if (action === "select") {
      if (!uuid(body?.accountId)) throw new HttpError(400, "Compte invalide.");
      const { data: selected, error: selectedError } = await actor.adminClient
        .from("restaurant_meta_accounts").select("id,encrypted_page_token,disconnected_at")
        .eq("restaurant_id", restaurantId).eq("id", body.accountId).maybeSingle();
      if (selectedError || !selected || !selected.encrypted_page_token || selected.disconnected_at) {
        throw new HttpError(409, "Compte Meta non connecté.");
      }
      const { error: clearError } = await actor.adminClient.from("restaurant_meta_accounts")
        .update({ enabled: false, updated_at: new Date().toISOString() }).eq("restaurant_id", restaurantId);
      if (clearError) throw new HttpError(500, "Activation Meta impossible.");
      const { error } = await actor.adminClient.from("restaurant_meta_accounts")
        .update({ enabled: true, updated_at: new Date().toISOString() })
        .eq("restaurant_id", restaurantId).eq("id", body.accountId);
      if (error) throw new HttpError(500, "Activation Meta impossible.");
      return jsonResponse({ ok: true, accounts: await readAccounts(actor, restaurantId) }, 200, cors);
    }
    if (action === "disconnect") {
      if (!uuid(body?.accountId)) throw new HttpError(400, "Compte invalide.");
      const { error } = await actor.adminClient.from("restaurant_meta_accounts")
        .update({ enabled: false, encrypted_page_token: null, disconnected_at: new Date().toISOString() })
        .eq("restaurant_id", restaurantId).eq("id", body.accountId);
      if (error) throw new HttpError(500, "Déconnexion Meta impossible.");
      return jsonResponse({ ok: true, accounts: await readAccounts(actor, restaurantId) }, 200, cors);
    }
    if (action === "publish") {
      const channels = normalizeMetaChannels(body?.channels);
      return jsonResponse({
        ok: true,
        results: await publish(actor, restaurantId, body?.sourceType, body?.sourceId, channels),
      }, 200, cors);
    }
    throw new HttpError(400, "Action inconnue.");
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof HttpError ? error.message : "Service de réseaux sociaux momentanément indisponible.";
    return jsonResponse({ ok: false, error: message }, status, cors);
  }
});
