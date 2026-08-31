import {
  HttpError,
  authenticateRequest,
  jsonResponse,
  requireRole,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { makeLogger } from "../_shared/logging.ts";

const FIRECRAWL_SEARCH_URL = "https://api.firecrawl.dev/v1/search";
const DEFAULT_BATCH_SIZE = 5;
const MAX_BATCH_SIZE = 10;
const MAX_ERROR_LENGTH = 500;
const MIN_CANDIDATE_SCORE = 6;

const REJECTED_IMAGE_PARTS = [
  "logo",
  "favicon",
  "icon",
  "avatar",
  "sprite",
  "pixel",
  "tracking",
  "emoji",
  "badge",
  "placeholder",
  "default-image",
  "map-marker",
];

const GENERIC_NAME_TOKENS = new Set([
  "restaurant",
  "restaurants",
  "cafe",
  "café",
  "bar",
  "brasserie",
  "auberge",
  "geneve",
  "genève",
  "sarl",
  "sa",
]);

type RestaurantRow = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  image_url: string | null;
  directory_source_reference: string | null;
  is_directory_listing: boolean;
};

type SearchResult = {
  url?: string;
  title?: string;
  description?: string;
  markdown?: string;
};

type ImageCandidate = {
  imageUrl: string;
  pageUrl: string;
  score: number;
};

function boundedBatchSize(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_BATCH_SIZE;
  return Math.min(Math.floor(parsed), MAX_BATCH_SIZE);
}

function normalizeText(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function meaningfulNameTokens(name: string) {
  return normalizeText(name)
    .split(" ")
    .filter((token) => token.length >= 3 && !GENERIC_NAME_TOKENS.has(token));
}

function hostOf(value: string | null | undefined) {
  try {
    return new URL(String(value || "")).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function looksLikeUsableImageUrl(value: string) {
  const lower = value.toLowerCase();
  if (!/^https?:\/\//i.test(value)) return false;
  if (!/\.(?:jpe?g|png|webp|avif)(?:$|[?#])/i.test(value)) return false;
  return !REJECTED_IMAGE_PARTS.some((part) => lower.includes(part));
}

function extractImageUrls(markdown: string) {
  const matches = markdown.matchAll(
    /!\[[^\]]*\]\((https?:\/\/[^\s)]+?\.(?:jpg|jpeg|png|webp|avif)(?:\?[^\s)]*)?)\)/gi,
  );
  return [...new Set([...matches].map((match) => match[1]).filter(looksLikeUsableImageUrl))].slice(0, 12);
}

function scoreCandidate(
  restaurant: RestaurantRow,
  result: SearchResult,
  imageUrl: string,
  officialWebsite: string | null,
) {
  const officialHost = hostOf(officialWebsite);
  const pageHost = hostOf(result.url);
  const imageHost = hostOf(imageUrl);
  const nameNormalized = normalizeText(restaurant.name);
  const nameTokens = meaningfulNameTokens(restaurant.name);
  const cityNormalized = normalizeText(restaurant.city);
  const addressNormalized = normalizeText(restaurant.address);
  const resultBlob = normalizeText(
    `${result.title || ""} ${result.description || ""} ${result.markdown || ""} ${result.url || ""}`,
  );

  let score = 0;
  if (officialHost && pageHost === officialHost) score += 8;
  if (officialHost && imageHost === officialHost) score += 5;
  if (nameNormalized && resultBlob.includes(nameNormalized)) score += 5;

  if (nameTokens.length > 0) {
    const matches = nameTokens.filter((token) => resultBlob.includes(token)).length;
    const ratio = matches / nameTokens.length;
    if (ratio >= 0.75) score += 4;
    else if (ratio >= 0.5) score += 2;
  }

  if (cityNormalized && resultBlob.includes(cityNormalized)) score += 1;

  const addressTokens = addressNormalized.split(" ").filter((token) => token.length >= 4).slice(0, 4);
  if (addressTokens.some((token) => resultBlob.includes(token))) score += 2;

  return score;
}

async function validateImageUrl(imageUrl: string) {
  try {
    const response = await fetch(imageUrl, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(8_000),
      headers: {
        Range: "bytes=0-1023",
        "User-Agent": "TOK-Directory-Image-Validator/1.0 (+https://www.thetok.ch)",
        Accept: "image/avif,image/webp,image/png,image/jpeg;q=0.9,*/*;q=0.1",
      },
    });
    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    const valid = response.ok && contentType.startsWith("image/") && !contentType.includes("svg");
    await response.body?.cancel().catch(() => undefined);
    return valid ? response.url || imageUrl : null;
  } catch {
    return null;
  }
}

async function getOfficialWebsite(supabase: any, sourceReference: string | null) {
  if (!sourceReference) return null;

  const byReference = await supabase
    .from("marketing_contacts")
    .select("website")
    .eq("source_system", "commercial_prospect_catalog")
    .eq("source_reference", sourceReference)
    .not("website", "is", null)
    .limit(1)
    .maybeSingle();
  if (!byReference.error && byReference.data?.website) return String(byReference.data.website);

  if (/^\d+$/.test(sourceReference)) {
    const byObjectId = await supabase
      .from("marketing_contacts")
      .select("website")
      .eq("source_system", "commercial_prospect_catalog")
      .eq("source_objectid", Number(sourceReference))
      .not("website", "is", null)
      .limit(1)
      .maybeSingle();
    if (!byObjectId.error && byObjectId.data?.website) return String(byObjectId.data.website);
  }

  return null;
}

async function findBestImage(
  restaurant: RestaurantRow,
  officialWebsite: string | null,
  firecrawlApiKey: string,
): Promise<ImageCandidate | null> {
  const queryParts = [
    `"${restaurant.name.replace(/"/g, "")}"`,
    restaurant.address ? `"${restaurant.address.replace(/"/g, "")}"` : "",
    restaurant.city || "Genève",
    "restaurant photo",
  ].filter(Boolean);
  if (officialWebsite) queryParts.push(hostOf(officialWebsite));

  const response = await fetch(FIRECRAWL_SEARCH_URL, {
    method: "POST",
    signal: AbortSignal.timeout(20_000),
    headers: {
      Authorization: `Bearer ${firecrawlApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: queryParts.join(" ").slice(0, 480),
      limit: 4,
      lang: "fr",
      country: "ch",
      scrapeOptions: { formats: ["markdown"] },
    }),
  });

  if (!response.ok) {
    throw new Error(`firecrawl_search_${response.status}`);
  }

  const payload = await response.json().catch(() => ({}));
  const results = Array.isArray(payload?.data) ? payload.data as SearchResult[] : [];
  const candidates: ImageCandidate[] = [];

  for (const result of results) {
    const pageUrl = String(result.url || "");
    for (const imageUrl of extractImageUrls(String(result.markdown || ""))) {
      const score = scoreCandidate(restaurant, result, imageUrl, officialWebsite);
      if (score >= MIN_CANDIDATE_SCORE) {
        candidates.push({ imageUrl, pageUrl, score });
      }
    }
  }

  candidates.sort((left, right) => right.score - left.score);
  for (const candidate of candidates.slice(0, 6)) {
    const validated = await validateImageUrl(candidate.imageUrl);
    if (validated) return { ...candidate, imageUrl: validated };
  }

  return null;
}

function retryDelayIso(kind: "not_found" | "error") {
  const delayMs = kind === "not_found" ? 24 * 60 * 60 * 1_000 : 6 * 60 * 60 * 1_000;
  return new Date(Date.now() + delayMs).toISOString();
}

async function updateJob(supabase: any, restaurantId: string, values: Record<string, unknown>) {
  const { error } = await supabase
    .from("restaurant_directory_image_jobs")
    .update({
      ...values,
      locked_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("restaurant_id", restaurantId);
  if (error) throw new Error(`job_update_failed:${error.message}`);
}

async function getStatus(supabase: any) {
  const statuses = ["pending", "processing", "success", "not_found", "error"] as const;
  const entries = await Promise.all(statuses.map(async (status) => {
    const { count, error } = await supabase
      .from("restaurant_directory_image_jobs")
      .select("restaurant_id", { count: "exact", head: true })
      .eq("status", status);
    if (error) throw new Error(error.message);
    return [status, count || 0] as const;
  }));
  return Object.fromEntries(entries);
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  const log = makeLogger("enrich-directory-images");
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;

  try {
    actor = await authenticateRequest(req, {
      allowServiceRole: true,
      allowSchedulerSecret: true,
    });
    requireRole(actor, ["admin"]);
    const supabase = actor.adminClient;
    const body = req.method === "GET" ? {} : await req.json().catch(() => ({}));
    const mode = String(body?.mode || "process_batch");

    if (mode === "status") {
      return jsonResponse({ success: true, jobs: await getStatus(supabase) }, 200, corsHeaders);
    }
    if (mode !== "process_batch") {
      throw new HttpError(400, "Invalid mode");
    }

    const firecrawlApiKey = Deno.env.get("FIRECRAWL_API_KEY")?.trim() || "";
    if (!firecrawlApiKey) {
      throw new HttpError(503, "FIRECRAWL_API_KEY not configured");
    }

    const limit = boundedBatchSize(body?.limit);
    const { data: claimed, error: claimError } = await supabase.rpc(
      "service_claim_directory_image_jobs",
      { p_limit: limit },
    );
    if (claimError) throw new Error(`claim_failed:${claimError.message}`);

    const restaurantIds = (claimed || []).map((row: { restaurant_id: string }) => row.restaurant_id);
    let successCount = 0;
    let notFoundCount = 0;
    let errorCount = 0;

    for (const restaurantId of restaurantIds) {
      try {
        const { data: restaurant, error: restaurantError } = await supabase
          .from("restaurants")
          .select("id, name, address, city, image_url, directory_source_reference, is_directory_listing")
          .eq("id", restaurantId)
          .maybeSingle();
        if (restaurantError) throw new Error(restaurantError.message);
        if (!restaurant || restaurant.is_directory_listing !== true) {
          await updateJob(supabase, restaurantId, { status: "error", last_error: "directory_listing_missing", next_attempt_at: null });
          errorCount++;
          continue;
        }

        const row = restaurant as RestaurantRow;
        if (String(row.image_url || "").trim()) {
          await updateJob(supabase, restaurantId, { status: "success", next_attempt_at: null, last_error: null });
          successCount++;
          continue;
        }

        const officialWebsite = await getOfficialWebsite(supabase, row.directory_source_reference);
        const candidate = await findBestImage(row, officialWebsite, firecrawlApiKey);
        if (!candidate) {
          await updateJob(supabase, restaurantId, {
            status: "not_found",
            next_attempt_at: retryDelayIso("not_found"),
            last_error: null,
          });
          notFoundCount++;
          continue;
        }

        const { data: updatedRestaurant, error: updateError } = await supabase
          .from("restaurants")
          .update({ image_url: candidate.imageUrl, updated_at: new Date().toISOString() })
          .eq("id", restaurantId)
          .eq("is_directory_listing", true)
          .or("image_url.is.null,image_url.eq.")
          .select("id")
          .maybeSingle();
        if (updateError) throw new Error(`restaurant_image_update_failed:${updateError.message}`);

        if (!updatedRestaurant) {
          const { data: current } = await supabase
            .from("restaurants")
            .select("image_url")
            .eq("id", restaurantId)
            .maybeSingle();
          if (!String(current?.image_url || "").trim()) {
            throw new Error("restaurant_image_update_lost_race");
          }
        }

        const { data: currentCover } = await supabase
          .from("restaurant_media")
          .select("id")
          .eq("restaurant_id", restaurantId)
          .eq("is_cover", true)
          .limit(1)
          .maybeSingle();

        if (!currentCover) {
          const { error: mediaError } = await supabase.from("restaurant_media").insert({
            restaurant_id: restaurantId,
            media_url: candidate.imageUrl,
            media_type: "photo",
            alt_text: `Photo de ${row.name}`,
            is_cover: true,
            position: 0,
            metadata: {
              source: "internet_directory_enrichment",
              source_page_url: candidate.pageUrl || null,
              source_image_url: candidate.imageUrl,
              official_website: officialWebsite,
              confidence_score: candidate.score,
              collected_at: new Date().toISOString(),
            },
          });
          if (mediaError) {
            log.warn("media_insert_failed", { restaurant_id: restaurantId, message: mediaError.message });
          }
        }

        await updateJob(supabase, restaurantId, {
          status: "success",
          next_attempt_at: null,
          last_error: null,
          source_page_url: candidate.pageUrl || null,
          source_image_url: candidate.imageUrl,
        });
        successCount++;
      } catch (error) {
        const message = (error instanceof Error ? error.message : "unknown").slice(0, MAX_ERROR_LENGTH);
        errorCount++;
        try {
          await updateJob(supabase, restaurantId, {
            status: "error",
            next_attempt_at: retryDelayIso("error"),
            last_error: message,
          });
        } catch (jobError) {
          log.error("job_failure_persist_failed", {
            restaurant_id: restaurantId,
            message: jobError instanceof Error ? jobError.message : "unknown",
          });
        }
        log.warn("restaurant_image_enrichment_failed", { restaurant_id: restaurantId, message });
      }
    }

    const result = {
      success: true,
      claimed: restaurantIds.length,
      enriched: successCount,
      not_found: notFoundCount,
      errors: errorCount,
      jobs: await getStatus(supabase),
    };

    await writeAuditLog({
      adminClient: supabase,
      actor,
      request: req,
      functionName: "enrich-directory-images",
      action: "directory_image_enrichment_batch",
      status: "success",
      targetEntityType: "restaurants",
      metadata: {
        source: String(body?.source || "manual"),
        claimed: restaurantIds.length,
        enriched: successCount,
        not_found: notFoundCount,
        errors: errorCount,
      },
    });

    return jsonResponse(result, 200, corsHeaders);
  } catch (error) {
    log.error("request_failed", { message: error instanceof Error ? error.message : "unknown" });
    return jsonResponse(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      error instanceof HttpError ? error.status : 500,
      corsHeaders,
    );
  }
});
