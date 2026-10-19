import {
  MarketingSocialInputError,
  parseMarketingSocialFollowEnvelope,
  SOCIAL_COLLECTION_BUDGET_MS,
  SOCIAL_SITE_BUDGET_MS,
  type MarketingSocialCollectionProgress,
  type MarketingSocialCollectResult,
  type MarketingSocialPlatform,
} from "./marketing-social-follow-contract.ts";
import type { SocialOriginCoordinator, SocialWebsiteCrawlResult, SocialWebsiteCrawlOptions } from "./marketing-social-site-crawler.ts";

type CanonicalProfile = { platform: MarketingSocialPlatform; canonicalKey: string; url: string };
type Candidate = CanonicalProfile & { sourceUrl: string; context: string; sourceKind: "website" | "database" };
type CrawlResult = SocialWebsiteCrawlResult;
type RpcError = { code?: string; message?: string; details?: string };
export type MarketingSocialEdgeActor = {
  authMode: string;
  isServiceRole: boolean;
  rpc: (name: string, args: Record<string, unknown>, signal: AbortSignal) => PromiseLike<{ data: unknown; error: RpcError | null }>;
};
export type MarketingSocialFollowDependencies = {
  authenticate: (request: Request) => Promise<MarketingSocialEdgeActor>;
  canonicalize: (value: unknown, expectedPlatform?: MarketingSocialPlatform) => CanonicalProfile | null;
  crawl: (website: string | null, options: SocialWebsiteCrawlOptions & { signal: AbortSignal; budgetMs: number }) => Promise<CrawlResult>;
  now?: () => number;
};

const BODY_LIMIT_BYTES = 16_384;
const RPC_NAME = "service_execute_marketing_social_follow_operation";
const ERROR_STATUS: Record<string, number> = {
  social_follow_invalid_request: 400,
  social_follow_invalid_profile: 400,
  social_follow_restaurant_not_found: 400,
  authentication_required: 401,
  forbidden: 403,
  social_follow_conflict: 409,
  social_follow_account_changed: 409,
  social_follow_account_unavailable: 409,
  social_follow_identity_required: 409,
  social_follow_collection_busy: 429,
  service_unavailable: 503,
};
const ERROR_MESSAGES: Record<string, string> = {
  social_follow_invalid_request: "Vérifiez les champs de la demande.",
  social_follow_invalid_profile: "Ce lien ne désigne pas un profil Instagram ou Facebook pris en charge.",
  social_follow_restaurant_not_found: "Cette fiche restaurant est indisponible.",
  authentication_required: "Reconnectez-vous au Marketing Studio.",
  forbidden: "Un accès administrateur au Marketing Studio est nécessaire.",
  social_follow_conflict: "Les données ont changé. Rechargez la liste avant de réessayer.",
  social_follow_account_changed: "Le compte TOK configuré a changé. Rechargez la liste.",
  social_follow_account_unavailable: "Configurez le compte TOK de ce réseau dans les connexions marketing.",
  social_follow_identity_required: "Confirmez l’identité du restaurant et le compte TOK utilisé.",
  social_follow_collection_busy: "Une collecte est en cours ou cette fiche doit patienter avant une nouvelle collecte.",
  service_unavailable: "Le service est momentanément indisponible. La progression déjà enregistrée est conservée.",
};

class SocialFollowHttpError extends Error {
  constructor(readonly code: string, readonly retryAfterSeconds?: number) { super(code); }
}

function response(value: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(value), { status, headers: {
    "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extraHeaders,
  } });
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SocialFollowHttpError("service_unavailable");
  return value as Record<string, unknown>;
}

function abortable<T>(work: PromiseLike<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new SocialFollowHttpError("service_unavailable"));
  return new Promise((resolve, reject) => {
    const abort = () => reject(new SocialFollowHttpError("service_unavailable"));
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve(work).then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

async function readBody(request: Request, signal: AbortSignal): Promise<unknown> {
  if (!/^application\/json(?:;|$)/.test((request.headers.get("content-type") || "").trim().toLowerCase())
    || Number(request.headers.get("content-length") || "0") > BODY_LIMIT_BYTES || !request.body) {
    throw new MarketingSocialInputError();
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await abortable(reader.read(), signal);
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > BODY_LIMIT_BYTES) throw new MarketingSocialInputError();
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
    catch { throw new MarketingSocialInputError(); }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

function rpcFailure(error: RpcError): SocialFollowHttpError {
  const message = error.message || "";
  if (Object.hasOwn(ERROR_STATUS, message)) {
    const retry = Number(error.details);
    return new SocialFollowHttpError(message, message === "social_follow_collection_busy"
      ? (Number.isSafeInteger(retry) && retry >= 1 ? retry : 90) : undefined);
  }
  if (error.code === "42501") return new SocialFollowHttpError("forbidden");
  if (error.code?.startsWith("22") || error.code === "23514") return new SocialFollowHttpError("social_follow_invalid_request");
  return new SocialFollowHttpError("service_unavailable");
}

function databaseCandidates(job: Record<string, unknown>, dependencies: MarketingSocialFollowDependencies) {
  const profiles: Candidate[] = [];
  const diagnostics: string[] = [];
  for (const platform of ["instagram", "facebook"] as const) {
    const raw = job[platform === "instagram" ? "instagramUrl" : "facebookUrl"];
    if (raw === null || raw === undefined || raw === "") continue;
    const profile = dependencies.canonicalize(raw, platform);
    if (profile) profiles.push({ ...profile, sourceUrl: profile.url, sourceKind: "database",
      context: `Lien ${platform === "instagram" ? "Instagram" : "Facebook"} enregistré dans la fiche restaurant ; identité à vérifier.` });
    else diagnostics.push(`database_${platform}_invalid`);
  }
  return { profiles, diagnostics };
}

/** No browser/session JWT can call this function directly. Every SQL operation
 * revalidates the opaque BFF session, CSRF proof, feature gate and current role. */
export function createMarketingSocialFollowHandler(dependencies: MarketingSocialFollowDependencies) {
  const now = dependencies.now || Date.now;
  return async function handle(request: Request): Promise<Response> {
    if (request.method !== "POST") return response({ error: { code: "social_follow_invalid_request", message: "Méthode non prise en charge." } }, 405, { Allow: "POST" });
    const controller = new AbortController();
    const forwardAbort = () => controller.abort();
    request.signal.addEventListener("abort", forwardAbort, { once: true });
    if (request.signal.aborted) controller.abort();
    const startedAt = now();
    const timer = setTimeout(() => controller.abort(), SOCIAL_COLLECTION_BUDGET_MS);
    try {
      if (controller.signal.aborted) throw new SocialFollowHttpError("service_unavailable");
      let actor: MarketingSocialEdgeActor;
      try { actor = await abortable(dependencies.authenticate(request), controller.signal); }
      catch { throw new SocialFollowHttpError("service_unavailable"); }
      if (actor.authMode !== "service_role" || actor.isServiceRole !== true) throw new SocialFollowHttpError("forbidden");
      const envelope = parseMarketingSocialFollowEnvelope(await readBody(request, controller.signal));
      const call = async (operation: string, args: Record<string, unknown>, signal = controller.signal) => {
        if (signal.aborted) throw new SocialFollowHttpError("service_unavailable");
        const result = await abortable(actor.rpc(RPC_NAME, {
          p_sid_hash: envelope.sessionHash, p_csrf_hash: envelope.csrfHash,
          p_operation: operation, p_args: args,
        }, signal), signal);
        if (result.error) throw rpcFailure(result.error);
        if (result.data === null || result.data === undefined) throw new SocialFollowHttpError("service_unavailable");
        return result.data;
      };
      const { action, ...args } = envelope.request;
      if (envelope.request.action === "add") {
        const profile = dependencies.canonicalize(envelope.request.profileUrl);
        if (!profile) throw new SocialFollowHttpError("social_follow_invalid_profile");
        // Manual URL inputs are normalized and stored, never fetched.
        return response(await call("add", { restaurantId: envelope.request.restaurantId,
          candidate: { ...profile, sourceUrl: envelope.request.sourceUrl || profile.url,
            sourceKind: "manual", context: envelope.request.note } }));
      }
      if (action !== "collect") return response(await call(action, args));

      const result: Omit<MarketingSocialCollectResult, "collection" | "hasMore"> = {
        processed: 0, discovered: 0, deduplicated: 0, failed: 0, results: [],
      };
      const collectRequest = envelope.request;
      if (collectRequest.action !== "collect") throw new MarketingSocialInputError();
      for (let index = 0; index < collectRequest.limit; index += 1) {
        const remaining = SOCIAL_COLLECTION_BUDGET_MS - (now() - startedAt);
        if (remaining <= 6_000) break; // Reserve time to persist the result and read progress.
        let claimed: Record<string, unknown>;
        try {
          // One lease at a time keeps unstarted jobs available when the user stops.
          claimed = object(await call("claim", { limit: 1, restaurantId: collectRequest.restaurantId }));
        } catch (error) {
          if (result.processed > 0 && error instanceof SocialFollowHttpError && error.code === "social_follow_collection_busy") break;
          throw error;
        }
        if (!Array.isArray(claimed.jobs) || claimed.jobs.length > 1) throw new SocialFollowHttpError("service_unavailable");
        if (claimed.jobs.length === 0) break;
        const job = object(claimed.jobs[0]);
        if (typeof job.restaurantId !== "string" || typeof job.leaseToken !== "string"
          || (job.websiteUrl !== null && typeof job.websiteUrl !== "string")) throw new SocialFollowHttpError("service_unavailable");
        const database = databaseCandidates(job, dependencies);
        const originCoordinator: SocialOriginCoordinator = {
          reserve: async (input) => await call("reserve_origin", { restaurantId: job.restaurantId, leaseToken: job.leaseToken,
            origin: input.origin, kind: input.kind }, input.signal) as Awaited<ReturnType<SocialOriginCoordinator["reserve"]>>,
          finish: async (input) => await call("finish_origin", { restaurantId: job.restaurantId, leaseToken: job.leaseToken,
            origin: input.origin, requestToken: input.requestToken, robotsPolicy: input.robotsPolicy || null,
            retryAfter: input.retryAfter || null }, input.signal) as Awaited<ReturnType<SocialOriginCoordinator["finish"]>>,
        };
        let crawl: CrawlResult;
        try {
          const budgetMs = Math.min(SOCIAL_SITE_BUDGET_MS, SOCIAL_COLLECTION_BUDGET_MS - (now() - startedAt) - 5_000);
          if (budgetMs < 1_000) throw new Error("budget_exhausted");
          // The crawler owns its bounded cancellation/cleanup; await its origin release before returning.
          crawl = await dependencies.crawl(job.websiteUrl as string | null, { signal: controller.signal, budgetMs, originCoordinator });
        } catch {
          if (controller.signal.aborted) throw new SocialFollowHttpError("service_unavailable");
          crawl = { profiles: [], crawlStatus: "error", visitedUrls: [], diagnostics: ["collection_failed"], networkAttempted: true };
        }
        const profiles = new Map<string, Candidate>();
        for (const candidate of database.profiles) profiles.set(`${candidate.platform}:${candidate.canonicalKey}`, candidate);
        for (const candidate of crawl.profiles.slice(0, 20)) {
          const normalized = dependencies.canonicalize(candidate.url, candidate.platform);
          if (normalized) profiles.set(`${normalized.platform}:${normalized.canonicalKey}`, {
            ...normalized, sourceUrl: candidate.sourceUrl, context: candidate.context.slice(0, 200), sourceKind: "website",
          });
        }
        const completed = object(await call("complete", {
          restaurantId: job.restaurantId, leaseToken: job.leaseToken,
          crawlStatus: crawl.crawlStatus, profiles: [...profiles.values()].slice(0, 22),
          visitedUrls: crawl.visitedUrls.slice(0, 12),
          diagnostics: [...database.diagnostics, ...crawl.diagnostics].slice(0, 10).map((entry) => entry.slice(0, 160)),
          retryAfter: crawl.retryAfter || null,
          networkAttempted: crawl.networkAttempted,
        }));
        if (typeof completed.discovered !== "number" || typeof completed.deduplicated !== "number"
          || typeof completed.profilesFound !== "number") throw new SocialFollowHttpError("service_unavailable");
        result.processed += 1;
        result.discovered += completed.discovered;
        result.deduplicated += completed.deduplicated;
        if (crawl.crawlStatus === "error" && !(crawl.networkAttempted === false && crawl.diagnostics.includes("crawl_delay_deferred"))) result.failed += 1;
        result.results.push({ restaurantId: job.restaurantId, status: crawl.crawlStatus, profilesFound: completed.profilesFound });
        if (collectRequest.restaurantId) break;
      }
      const collection = await call("progress", {}) as MarketingSocialCollectionProgress;
      return response({ ...result, collection, hasMore: collection.hasMore } satisfies MarketingSocialCollectResult);
    } catch (error) {
      let safe: SocialFollowHttpError;
      if (error instanceof SocialFollowHttpError) safe = error;
      else if (error instanceof MarketingSocialInputError) safe = new SocialFollowHttpError("social_follow_invalid_request");
      else if (error && typeof error === "object" && "status" in error && error.status === 401) safe = new SocialFollowHttpError("authentication_required");
      else if (error && typeof error === "object" && "status" in error && error.status === 403) safe = new SocialFollowHttpError("forbidden");
      else safe = new SocialFollowHttpError("service_unavailable");
      return response({ error: { code: safe.code, message: ERROR_MESSAGES[safe.code],
        ...(safe.retryAfterSeconds ? { retryAfterSeconds: safe.retryAfterSeconds } : {}) } }, ERROR_STATUS[safe.code],
      safe.retryAfterSeconds ? { "Retry-After": String(safe.retryAfterSeconds) } : {});
    } finally {
      clearTimeout(timer);
      request.signal.removeEventListener("abort", forwardAbort);
    }
  };
}
