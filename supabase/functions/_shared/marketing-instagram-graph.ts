import { validateMetaPublishingConfig, type MetaPublishingConfig } from "./meta-publishing.ts";
import {
  instagramCount, instagramId, instagramLocalEvidence, instagramPostUrl, instagramRecord,
  instagramText, instagramUsername, parseInstagramResearchRequest, publicEngagementRate,
  rankInstagramPosts, summarizeInstagramAccount,
  type InstagramComment, type InstagramPost, type InstagramResearchResult,
} from "./marketing-instagram-research.ts";
import type { createAdminClient } from "./auth.ts";

export class InstagramResearchError extends Error {
  constructor(readonly code: string, readonly status = 503) { super(code); this.name = "InstagramResearchError"; }
}
type FetchLike = typeof fetch;
type Runtime = { fetchImpl?: FetchLike; now?: () => number };
const MEDIA_FIELDS = "id,caption,permalink,timestamp,like_count,comments_count";
const date = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
const array = (value: unknown) => Array.isArray(value) ? value.slice(0, 50).map(instagramRecord) : [];

function graphReader(config: MetaPublishingConfig, runtime: Runtime) {
  const fetchImpl = runtime.fetchImpl ?? fetch;
  const deadline = Date.now() + 45_000;
  let calls = 0;
  return async (path: string, params: Record<string, string>): Promise<Record<string, unknown>> => {
    if (++calls > 15 || Date.now() >= deadline) throw new InstagramResearchError("instagram_budget_exhausted");
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(config.appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(config.systemUserToken));
    const proof = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    const url = new URL(`https://graph.facebook.com/${config.graphVersion}/${path}`);
    url.search = new URLSearchParams({ ...params, appsecret_proof: proof }).toString();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.max(1, Math.min(8000, deadline - Date.now())));
    try {
      const response = await fetchImpl(url, { method: "GET", redirect: "error", signal: controller.signal,
        headers: { Authorization: `Bearer ${config.systemUserToken}`, Accept: "application/json" } });
      if (!response.body) throw new InstagramResearchError("instagram_response_invalid");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let size = 0, serialized = "";
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > 400_000) { await reader.cancel(); throw new InstagramResearchError("instagram_response_invalid"); }
          serialized += decoder.decode(chunk.value, { stream: true });
        }
        serialized += decoder.decode();
      } finally { reader.releaseLock(); }
      const body = instagramRecord(JSON.parse(serialized));
      if (!response.ok || body.error) {
        const code = instagramCount(instagramRecord(body.error).code);
        if (response.status === 429 || [4, 17, 32, 613].includes(code ?? -1)) throw new InstagramResearchError("instagram_rate_limited", 429);
        if ([10, 190, 200].includes(code ?? -1) || [401, 403].includes(response.status)) throw new InstagramResearchError("instagram_access_required", 403);
        throw new InstagramResearchError("instagram_source_unavailable");
      }
      return body;
    } catch (error) {
      if (error instanceof InstagramResearchError) throw error;
      throw new InstagramResearchError("instagram_response_invalid");
    } finally { clearTimeout(timeout); }
  };
}

export async function runInstagramResearch(rawConfig: MetaPublishingConfig, payload: unknown, runtime: Runtime = {}): Promise<InstagramResearchResult> {
  const request = parseInstagramResearchRequest(payload);
  let config: MetaPublishingConfig;
  try { config = validateMetaPublishingConfig(rawConfig, "instagram"); }
  catch { throw new InstagramResearchError("instagram_configuration_required"); }
  const graph = graphReader(config, runtime);
  const observedAt = new Date((runtime.now ?? Date.now)()).toISOString();
  const page = await graph(config.pageId, { fields: "id,instagram_business_account" });
  if (page.id !== config.pageId || instagramRecord(page.instagram_business_account).id !== config.instagramUserId) throw new InstagramResearchError("instagram_identity_mismatch", 403);
  const identity = await graph(config.instagramUserId!, { fields: "id,username,followers_count" });
  if (identity.id !== config.instagramUserId || !instagramUsername(identity.username)) throw new InstagramResearchError("instagram_identity_mismatch", 403);

  if (request.action === "instagram_comments") {
    const media = await graph(request.mediaId, { fields: "id,owner,permalink" });
    if (media.id !== request.mediaId || instagramRecord(media.owner).id !== config.instagramUserId) throw new InstagramResearchError("instagram_external_comments_manual", 403);
    const url = instagramPostUrl(media.permalink);
    if (!url) throw new InstagramResearchError("instagram_response_invalid");
    const body = await graph(`${request.mediaId}/comments`, { fields: "id,username,text,timestamp,like_count", limit: "50", ...(request.after ? { after: request.after } : {}) });
    const comments: InstagramComment[] = array(body.data).flatMap((row) => !instagramId(row.id) || !instagramText(row.text) ? [] : [{
      id: row.id, username: instagramUsername(row.username) ? row.username : null,
      text: instagramText(row.text), timestamp: date(row.timestamp), likes: instagramCount(row.like_count),
    }]);
    comments.sort((a, b) => (b.likes ?? -1) - (a.likes ?? -1) || a.id.localeCompare(b.id));
    const paging = instagramRecord(body.paging), after = instagramRecord(paging.cursors).after;
    return { kind: "comments", observedAt, mediaId: request.mediaId, url, comments,
      nextCursor: paging.next && typeof after === "string" && /^[A-Za-z0-9_=-]{1,1024}$/.test(after) ? after : null };
  }

  const result: Extract<InstagramResearchResult, { kind: "discovery" }> = {
    kind: "discovery", observedAt, accountUsername: identity.username, days: request.days,
    posts: [], accounts: [], warnings: [], truncatedSources: [],
  };
  const cutoff = Date.parse(observedAt) - request.days * 86400_000;
  const seen = new Map<string, InstagramPost>();
  function collect(body: Record<string, unknown>, source: string, username: string | null, followers: number | null, profile = "", hashtag = "") {
    if (!Array.isArray(body.data)) throw new InstagramResearchError("instagram_response_invalid");
    if (instagramRecord(body.paging).next) result.truncatedSources.push(source);
    const posts: InstagramPost[] = [];
    for (const row of array(body.data).slice(0, 25)) {
      const timestamp = date(row.timestamp), url = instagramPostUrl(row.permalink), caption = instagramText(row.caption, 1000);
      const evidence = instagramLocalEvidence(caption, profile, hashtag);
      if (!instagramId(row.id) || !url || !timestamp || Date.parse(timestamp) < cutoff || Date.parse(timestamp) > Date.parse(observedAt) || !evidence) continue;
      const likes = instagramCount(row.like_count), comments = instagramCount(row.comments_count);
      const post: InstagramPost = { id: row.id, url, timestamp, caption, source, username, followers,
        likes, comments, interactions: likes !== null && comments !== null ? likes + comments : null,
        engagementRate: publicEngagementRate(likes, comments, followers), owned: username === identity.username, localEvidence: evidence };
      posts.push(post);
      // Prefer account-level evidence over hashtag-only metadata for duplicates.
      if (!seen.has(post.id) || (!seen.get(post.id)!.username && username)) seen.set(post.id, post);
    }
    return posts;
  }
  async function source(label: string, operation: () => Promise<void>) {
    try { await operation(); }
    catch (error) { result.warnings.push({ source: label, code: error instanceof InstagramResearchError ? error.code : "instagram_source_unavailable" }); }
  }
  await source(`@${identity.username}`, async () => {
    const posts = collect(await graph(`${config.instagramUserId}/media`, { fields: MEDIA_FIELDS, limit: "25" }), `@${identity.username}`, identity.username as string, instagramCount(identity.followers_count));
    if (posts.length) result.accounts.push(summarizeInstagramAccount(identity.username as string, "Compte TOK connecté", instagramCount(identity.followers_count), posts));
  });
  async function collectAccount(username: string) {
    await source(`@${username}`, async () => {
      const row = instagramRecord((await graph(config.instagramUserId!, {
        fields: `business_discovery.username(${username}){id,username,name,biography,followers_count,media.limit(25){${MEDIA_FIELDS}}}`,
      })).business_discovery);
      if (row.username !== username) throw new InstagramResearchError("instagram_source_unavailable");
      const followers = instagramCount(row.followers_count);
      const posts = collect(instagramRecord(row.media), `@${username}`, username, followers, `${instagramText(row.name)} ${instagramText(row.biography)}`);
      if (posts.length) result.accounts.push(summarizeInstagramAccount(username, instagramText(row.name, 150), followers, posts));
    });
  }
  for (const username of request.usernames.filter((name) => name !== identity.username)) await collectAccount(username);
  for (const hashtag of request.hashtags) {
    await source(`#${hashtag}`, async () => {
      const match = array((await graph("ig_hashtag_search", { user_id: config.instagramUserId!, q: hashtag })).data)[0];
      if (!match || !instagramId(match.id)) throw new InstagramResearchError("instagram_source_unavailable");
      collect(await graph(`${match.id}/top_media`, { user_id: config.instagramUserId!, fields: MEDIA_FIELDS, limit: "25" }), `#${hashtag}`, null, null, "", hashtag);
    });
  }
  // Hashtag endpoints do not expose author usernames. Only observed mentions
  // are candidates; Business Discovery must confirm identity and local content.
  const candidates = new Set<string>();
  for (const post of seen.values()) {
    for (const match of post.caption.matchAll(/(?:^|[^a-zA-Z0-9._])@([a-zA-Z0-9._]{1,30})(?=$|[^a-zA-Z0-9._])/g)) {
      const username = match[1].toLowerCase();
      if (instagramUsername(username) && username !== identity.username && !request.usernames.includes(username)) candidates.add(username);
    }
  }
  for (const username of [...candidates].slice(0, 3)) await collectAccount(username);
  result.posts = rankInstagramPosts([...seen.values()], "rate");
  result.accounts.sort((a, b) => (b.medianEngagementRate ?? -1) - (a.medianEngagementRate ?? -1));
  return result;
}

/** Uses only the existing connected integration and Edge secrets. No schema changes. */
export async function loadInstagramResearch(client: ReturnType<typeof createAdminClient>, payload: unknown) {
  parseInstagramResearchRequest(payload);
  const { data, error } = await client.from("marketing_integrations").select("public_configuration")
    .eq("channel", "instagram").eq("status", "connected").order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (error || !data) throw new InstagramResearchError("instagram_configuration_required");
  const row = instagramRecord(data.public_configuration);
  return runInstagramResearch({ graphVersion: instagramText(row.graph_version), pageId: instagramText(row.page_id),
    instagramUserId: instagramText(row.ig_user_id), systemUserToken: Deno.env.get("META_SYSTEM_USER_TOKEN") || "",
    appSecret: Deno.env.get("META_APP_SECRET") || "" }, payload);
}
