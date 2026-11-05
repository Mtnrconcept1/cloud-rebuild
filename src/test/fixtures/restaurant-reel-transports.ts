/** Local-only transports for the browser reel fixture; never contact storage or an AI provider. */
import { normalizeTokVideoOptions, quoteTokVideo, assertConfirmedTokVideoQuote } from "../../../supabase/functions/_shared/higgsfield-video";

declare global {
  interface Window {
    __videoFixtureRequests?: Array<Record<string, unknown>>;
  }
}

export async function loadTokVideoBrandMedia() {
  return {
    media: [
      { id: "30000000-0000-4000-8000-000000000001", media_url: "/__reel_fixture__/photo-a.png", alt_text: "Photo A", media_type: "photo" },
      { id: "30000000-0000-4000-8000-000000000002", media_url: "/__reel_fixture__/photo-b.png", alt_text: "Photo B", media_type: "photo" },
      { id: "30000000-0000-4000-8000-000000000003", media_url: "/__reel_fixture__/logo.png", alt_text: "Logo original", media_type: "marketing_logo" },
    ],
    hasMore: false,
  };
}

export const VIDEO_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";

export async function uploadTokVideoImage(): Promise<never> {
  throw new Error("No remote upload in this fixture");
}

export function getSupabase() {
  return { functions: { invoke: async (_name: string, { body }: { body: Record<string, unknown> }) => {
    window.__videoFixtureRequests ??= [];
    window.__videoFixtureRequests.push(structuredClone(body));
    if (body.action === "list") return { data: { jobs: [] }, error: null };
    if (body.action === "quote") return { data: { quote: quoteTokVideo(normalizeTokVideoOptions(body)) }, error: null };
    // Explicit synthetic receipt: validation and quote match real pure server contracts,
    // but no provider, auth, storage, database or payment endpoint is ever contacted.
    if (body.action === "start" && new URLSearchParams(location.search).get("fixtureStart") === "1") {
      const options = normalizeTokVideoOptions(body);
      const quote = quoteTokVideo(options);
      assertConfirmedTokVideoQuote(body, quote);
      return { data: { job: { ...options, id: "fixture-accepted-job", idempotencyKey: body.idempotencyKey,
        status: "queued", credits: quote.credits, model: quote.model, errorCode: null,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), videoUrl: null } }, error: null };
    }
    if (body.action === "status") throw new Error("Synthetic fixture does not run an AI provider");
    throw new Error("Provider submission is disabled in this local browser fixture");
  } } };
}
