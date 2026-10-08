export type MetaChannel = "facebook" | "instagram";

export type MetaSocialContent = {
  headline?: unknown;
  body?: unknown;
  call_to_action?: unknown;
  hashtags?: unknown;
  visual_url?: unknown;
};

export type MetaPublishingConfig = {
  graphVersion: string;
  pageId: string;
  instagramUserId?: string | null;
  systemUserToken: string;
  appSecret: string;
};

export type MetaPublishResult = {
  providerExternalId: string;
  graphVersion: string;
  pageId: string;
  instagramUserId?: string;
  containerId?: string;
  usedMedia: boolean;
};

export const META_REQUEST_TIMEOUT_MS = 10_000;

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type SleepLike = (milliseconds: number) => Promise<void>;

type MetaErrorOptions = {
  retryable?: boolean;
  blockedConfiguration?: boolean;
  ambiguous?: boolean;
  httpStatus?: number;
};

export class MetaPublishError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly blockedConfiguration: boolean;
  readonly ambiguous: boolean;
  readonly httpStatus?: number;

  constructor(code: string, options: MetaErrorOptions = {}) {
    super(code);
    this.name = "MetaPublishError";
    this.code = code;
    this.retryable = options.retryable === true;
    this.blockedConfiguration = options.blockedConfiguration === true;
    this.ambiguous = options.ambiguous === true;
    this.httpStatus = options.httpStatus;
  }
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeHashtags(value: unknown) {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const normalized = entry
      .trim()
      .replace(/^#+/, "")
      .replace(/\s+/g, "");
    if (!normalized || seen.has(normalized.toLocaleLowerCase())) continue;
    seen.add(normalized.toLocaleLowerCase());
    tags.push(`#${normalized}`);
    if (tags.length >= 30) break;
  }
  return tags;
}

export function buildMetaCaption(content: MetaSocialContent, channel: MetaChannel) {
  const headline = cleanString(content.headline);
  const body = cleanString(content.body);
  const callToAction = cleanString(content.call_to_action);
  const hashtags = normalizeHashtags(content.hashtags).join(" ");
  const text = [headline, body, callToAction, hashtags].filter(Boolean).join("\n\n");
  if (!text) {
    throw new MetaPublishError("meta_content_empty");
  }
  const maxLength = channel === "instagram" ? 2_200 : 50_000;
  if (text.length > maxLength) {
    throw new MetaPublishError("meta_content_too_long");
  }
  return text;
}

function isPrivateIpv4(hostname: string) {
  const parts = hostname.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  return parts[0] === 10
    || parts[0] === 127
    || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168);
}

export function normalizeMetaMediaUrl(value: unknown) {
  const raw = cleanString(value);
  if (!raw) return "";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new MetaPublishError("meta_media_url_invalid");
  }
  const hostname = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:"
    || url.username
    || url.password
    || hostname === "localhost"
    || hostname === "::1"
    || hostname.endsWith(".local")
    || isPrivateIpv4(hostname)
  ) {
    throw new MetaPublishError("meta_media_url_invalid");
  }
  return url.toString();
}

export function validateMetaPublishingConfig(config: MetaPublishingConfig, channel: MetaChannel) {
  if (!/^v\d{1,3}\.\d+$/.test(config.graphVersion)) {
    throw new MetaPublishError("meta_graph_version_invalid", { blockedConfiguration: true });
  }
  if (!/^\d{5,32}$/.test(config.pageId)) {
    throw new MetaPublishError("meta_page_id_invalid", { blockedConfiguration: true });
  }
  if (channel === "instagram" && !/^\d{5,32}$/.test(config.instagramUserId || "")) {
    throw new MetaPublishError("meta_instagram_user_id_invalid", { blockedConfiguration: true });
  }
  if (config.systemUserToken.trim().length < 20) {
    throw new MetaPublishError("meta_system_user_token_missing", { blockedConfiguration: true });
  }
  if (config.appSecret.trim().length < 16) {
    throw new MetaPublishError("meta_app_secret_missing", { blockedConfiguration: true });
  }
  return config;
}

async function appSecretProof(accessToken: string, appSecret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(accessToken),
  );
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function metaErrorCode(body: Record<string, unknown>) {
  const error = body.error && typeof body.error === "object" && !Array.isArray(body.error)
    ? body.error as Record<string, unknown>
    : {};
  const numeric = Number(error.code);
  return Number.isFinite(numeric) ? numeric : null;
}

function classifyGraphFailure(httpStatus: number, body: Record<string, unknown>, mayPublish: boolean) {
  const providerCode = metaErrorCode(body);
  const credentialFailure = httpStatus === 401
    || httpStatus === 403
    || providerCode === 10
    || providerCode === 102
    || providerCode === 190
    || providerCode === 200;
  if (credentialFailure) {
    return new MetaPublishError("meta_credentials_rejected", {
      blockedConfiguration: true,
      httpStatus,
    });
  }

  const throttled = httpStatus === 429 || [4, 17, 32, 613].includes(providerCode || -1);
  if (throttled) {
    return new MetaPublishError(
      mayPublish ? "meta_publish_outcome_unknown" : "meta_rate_limited",
      { retryable: !mayPublish, ambiguous: mayPublish, httpStatus },
    );
  }

  if (httpStatus >= 500) {
    return new MetaPublishError(mayPublish ? "meta_publish_outcome_unknown" : "meta_provider_unavailable", {
      retryable: !mayPublish,
      ambiguous: mayPublish,
      httpStatus,
    });
  }

  return new MetaPublishError("meta_request_rejected", { httpStatus });
}

async function graphRequest(input: {
  method: "GET" | "POST";
  graphVersion: string;
  path: string;
  params: Record<string, string>;
  accessToken: string;
  appSecret: string;
  fetchImpl: FetchLike;
  mayPublish: boolean;
}) {
  const url = new URL(`https://graph.facebook.com/${input.graphVersion}/${input.path.replace(/^\/+/, "")}`);
  const params = new URLSearchParams(input.params);
  params.set("access_token", input.accessToken);
  params.set("appsecret_proof", await appSecretProof(input.accessToken, input.appSecret));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), META_REQUEST_TIMEOUT_MS);
  try {
    let response: Response;
    if (input.method === "GET") {
      for (const [key, value] of params.entries()) url.searchParams.set(key, value);
      response = await input.fetchImpl(url, { method: "GET", signal: controller.signal });
    } else {
      response = await input.fetchImpl(url, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params,
      });
    }
    const raw = await response.json();
    const body = raw && typeof raw === "object" && !Array.isArray(raw)
      ? raw as Record<string, unknown>
      : {};
    if (!response.ok || body.error) {
      throw classifyGraphFailure(response.status || 500, body, input.mayPublish);
    }
    return body;
  } catch (error) {
    if (error instanceof MetaPublishError) throw error;
    throw new MetaPublishError(input.mayPublish ? "meta_publish_outcome_unknown" : "meta_provider_unreachable", {
      retryable: !input.mayPublish,
      ambiguous: input.mayPublish,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function requiredGraphId(body: Record<string, unknown>, code: string, mayPublish = false) {
  const id = cleanString(body.id);
  if (!/^\d{5,64}(?:_\d{5,64})?$/.test(id)) {
    throw new MetaPublishError(code, { ambiguous: mayPublish });
  }
  return id;
}

async function resolvePageIdentity(
  config: MetaPublishingConfig,
  fetchImpl: FetchLike,
) {
  const body = await graphRequest({
    method: "GET",
    graphVersion: config.graphVersion,
    path: "me/accounts",
    params: {
      fields: "id,name,access_token,tasks,instagram_business_account",
      limit: "100",
    },
    accessToken: config.systemUserToken,
    appSecret: config.appSecret,
    fetchImpl,
    mayPublish: false,
  });

  const pages = Array.isArray(body.data)
    ? body.data.filter((entry): entry is Record<string, unknown> =>
      Boolean(entry) && typeof entry === "object" && !Array.isArray(entry)
    )
    : [];
  const page = pages.find((entry) => cleanString(entry.id) === config.pageId);
  if (!page) {
    throw new MetaPublishError("meta_page_not_assigned", { blockedConfiguration: true });
  }

  const pageAccessToken = cleanString(page.access_token);
  if (pageAccessToken.length < 20) {
    throw new MetaPublishError("meta_page_access_token_missing", { blockedConfiguration: true });
  }
  const tasks = Array.isArray(page.tasks) ? page.tasks.map((task) => cleanString(task)) : [];
  if (tasks.length > 0 && !tasks.includes("CREATE_CONTENT")) {
    throw new MetaPublishError("meta_page_create_content_missing", { blockedConfiguration: true });
  }

  const instagramAccount = page.instagram_business_account
    && typeof page.instagram_business_account === "object"
    && !Array.isArray(page.instagram_business_account)
    ? page.instagram_business_account as Record<string, unknown>
    : {};
  const discoveredInstagramUserId = cleanString(instagramAccount.id);

  return { pageAccessToken, discoveredInstagramUserId };
}

const defaultSleep: SleepLike = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function publishMetaContent(input: {
  channel: MetaChannel;
  content: MetaSocialContent;
  config: MetaPublishingConfig;
  fetchImpl?: FetchLike;
  sleepImpl?: SleepLike;
  beforeExternalPublish?: () => Promise<void>;
}): Promise<MetaPublishResult> {
  const config = validateMetaPublishingConfig(input.config, input.channel);
  const fetchImpl = input.fetchImpl || fetch;
  const sleepImpl = input.sleepImpl || defaultSleep;
  const caption = buildMetaCaption(input.content, input.channel);
  const visualUrl = normalizeMetaMediaUrl(input.content.visual_url);
  const page = await resolvePageIdentity(config, fetchImpl);

  if (input.channel === "facebook") {
    if (input.beforeExternalPublish) await input.beforeExternalPublish();
    const body = await graphRequest({
      method: "POST",
      graphVersion: config.graphVersion,
      path: visualUrl ? `${config.pageId}/photos` : `${config.pageId}/feed`,
      params: visualUrl
        ? { url: visualUrl, caption, published: "true" }
        : { message: caption },
      accessToken: page.pageAccessToken,
      appSecret: config.appSecret,
      fetchImpl,
      mayPublish: true,
    });
    return {
      providerExternalId: requiredGraphId(body, "meta_facebook_post_id_missing", true),
      graphVersion: config.graphVersion,
      pageId: config.pageId,
      usedMedia: Boolean(visualUrl),
    };
  }

  if (!visualUrl) {
    throw new MetaPublishError("instagram_media_required");
  }
  if (!page.discoveredInstagramUserId) {
    throw new MetaPublishError("instagram_account_not_linked", { blockedConfiguration: true });
  }
  if (page.discoveredInstagramUserId !== config.instagramUserId) {
    throw new MetaPublishError("meta_instagram_identity_mismatch", { blockedConfiguration: true });
  }

  const container = await graphRequest({
    method: "POST",
    graphVersion: config.graphVersion,
    path: `${config.instagramUserId}/media`,
    params: { image_url: visualUrl, caption },
    accessToken: page.pageAccessToken,
    appSecret: config.appSecret,
    fetchImpl,
    // Creating an unpublished container is safe to retry; media_publish below
    // is the actual externally visible side effect.
    mayPublish: false,
  });
  const containerId = requiredGraphId(container, "meta_instagram_container_id_missing");

  let ready = false;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const status = await graphRequest({
      method: "GET",
      graphVersion: config.graphVersion,
      path: containerId,
      params: { fields: "status_code,status" },
      accessToken: page.pageAccessToken,
      appSecret: config.appSecret,
      fetchImpl,
      mayPublish: false,
    });
    const statusCode = cleanString(status.status_code).toUpperCase();
    if (statusCode === "FINISHED") {
      ready = true;
      break;
    }
    if (statusCode === "ERROR" || statusCode === "EXPIRED") {
      throw new MetaPublishError("instagram_media_processing_failed");
    }
    if (attempt < 5) await sleepImpl(Math.min(500 * (attempt + 1), 2_000));
  }
  if (!ready) {
    throw new MetaPublishError("instagram_media_processing_pending", { retryable: true });
  }

  if (input.beforeExternalPublish) await input.beforeExternalPublish();
  const published = await graphRequest({
    method: "POST",
    graphVersion: config.graphVersion,
    path: `${config.instagramUserId}/media_publish`,
    params: { creation_id: containerId },
    accessToken: page.pageAccessToken,
    appSecret: config.appSecret,
    fetchImpl,
    mayPublish: true,
  });

  return {
    providerExternalId: requiredGraphId(published, "meta_instagram_media_id_missing", true),
    graphVersion: config.graphVersion,
    pageId: config.pageId,
    instagramUserId: config.instagramUserId || undefined,
    containerId,
    usedMedia: true,
  };
}
