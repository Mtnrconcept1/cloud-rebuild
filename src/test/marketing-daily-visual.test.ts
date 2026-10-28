import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { webcrypto } from "node:crypto";
import jpeg from "jpeg-js";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { TOK_MARKETING_REFERENCES } from "../../supabase/functions/_shared/marketing-brand";
import { TOK_MARKETING_GENERATION_SAFE_MARGIN_PERCENT, TOK_MARKETING_REVIEW_SAFE_MARGIN_PERCENT } from "../../supabase/functions/_shared/marketing-brand";
import { buildDailyMarketingBrief } from "../../supabase/functions/_shared/marketing-daily-editorial";
import {
  DAILY_VISUAL_CHECKS,
  dailyMarginsAreSafe,
  measureDailyMargins,
  readDailyJpegDimensions,
} from "../../supabase/functions/_shared/marketing-visual-quality";

const brief = buildDailyMarketingBrief("2026-10-19");
const runId = "33333333-3333-4333-8333-333333333333";
const origin = "https://project.supabase.co";
const imagePath = `marketing-ai/tok-instagram/2026-10-19-${runId}.jpg`;
const imageUrl = `${origin}/storage/v1/object/public/social-post-media/${imagePath}`;
const options = { runId, brief, apiKey: "test-only", reviewModel: "configured-vision-model", supabaseUrl: origin };
let imageBytes: Uint8Array;
beforeAll(() => {
  // A real encoded JPEG fixture, never a marketing asset or a composited deliverable.
  imageBytes = new Uint8Array(jpeg.encode({ width: 1024, height: 1280, data: Buffer.alloc(1024 * 1280 * 4, 255) }, 10).data);
});

type Mode = "created" | "recovered" | "missing400" | "storage500" | "multiple" | "grid" | "typo" | "square" | "review500" | "incomplete" | "malformed" | "missing-master" | "changed-master"
  | "margins" | "recovered-margins" | "contrast" | "missing-margins" | "fractional-box" | "footer-null" | "footer-edge"
  | "model-margins" | "image-quota" | "image-rate" | "review-quota";
function mockNetwork(mode: Mode = "created") {
  Object.defineProperty(Blob.prototype, "arrayBuffer", { configurable: true, writable: true, value: function (this: Blob) {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = reject; reader.readAsArrayBuffer(this);
    });
  } });
  vi.stubGlobal("crypto", { subtle: { digest: (algorithm: string, bytes: ArrayBuffer) => webcrypto.subtle.digest(algorithm, Buffer.from(new Uint8Array(bytes))) } });
  const fetcher = vi.fn(async (url: string, request?: RequestInit) => {
    if (url === imageUrl) {
      expect(request?.redirect).toBe("error");
      expect(request?.headers).toBeUndefined();
      if (mode === "recovered" || mode === "recovered-margins") return new Response(imageBytes);
      if (mode === "storage500") return new Response("unavailable", { status: 503 });
      if (mode === "missing400") return Response.json({ statusCode: "404", error: "not_found", code: "NoSuchKey" }, { status: 400 });
      return new Response("missing", { status: 404 });
    }
    if (url.startsWith("https://www.thetok.ch/")) {
      if (mode === "missing-master") return new Response("missing", { status: 404 });
      if (mode === "changed-master") return new Response("changed artwork");
      const reference = TOK_MARKETING_REFERENCES.find((item) => url.endsWith(item.path));
      if (!reference) throw new Error("unexpected reference");
      return new Response(readFileSync(resolve(process.cwd(), `public${reference.path}`)));
    }
    if (url === "https://api.openai.com/v1/images/edits") {
      if (mode === "image-quota") return Response.json({ error: { code: "insufficient_quota", message: "private" } }, { status: 429 });
      if (mode === "image-rate") return Response.json({ error: { code: "rate_limit_exceeded", message: "private" } }, { status: 429 });
      const form = request?.body as FormData;
      expect(form.get("n")).toBe("1");
      expect(form.get("size")).toBe("1024x1280");
      expect(form.getAll("image[]")).toHaveLength(TOK_MARKETING_REFERENCES.length);
      expect(form.get("prompt")).toContain(brief.expectedTitle);
      expect(form.get("prompt")).toContain(`à au moins ${TOK_MARKETING_GENERATION_SAFE_MARGIN_PERCENT} % de chacun des quatre bords`);
      expect(form.get("prompt")).toContain("dans le rectangle x 123–901 px, y 154–1126 px");
      const encoded = mode === "square"
        ? jpeg.encode({ width: 100, height: 100, data: Buffer.alloc(100 * 100 * 4, 255) }, 10).data
        : imageBytes;
      const data = [{ b64_json: Buffer.from(encoded).toString("base64") }];
      return Response.json({ data: mode === "multiple" ? [...data, ...data] : data });
    }
    expect(url).toBe("https://api.openai.com/v1/responses");
    if (mode === "review500") return new Response("provider details must stay private", { status: 503 });
    if (mode === "review-quota") return Response.json({ error: { type: "insufficient_quota" } }, { status: 429 });
    const checks: Record<string, unknown> = Object.fromEntries(DAILY_VISUAL_CHECKS
      .filter((key) => key !== "safe_margins").map((key) => [key, true]));
    if (mode === "grid") checks.single_visual = false;
    if (mode === "contrast") checks.text_legible = false;
    if (mode === "model-margins") checks.safe_margins = true;
    // Measured in pixels of the 1024 x 1280 image; the code applies the 6 % rule.
    const layout: Record<string, unknown> = {
      logo: { left: 140, top: 170, right: 360, bottom: 390 },
      title: { left: 140, top: 420, right: 880, bottom: 640 },
      footer: { left: 440, top: 1080, right: 600, bottom: 1110 },
    };
    // The validated 20 October post: logo 45 px from the left and top edges.
    if (mode === "margins" || mode === "recovered-margins") layout.logo = { left: 45, top: 45, right: 280, bottom: 280 };
    if (mode === "missing-margins") delete layout.title;
    if (mode === "fractional-box") layout.logo = { left: 140.5, top: 170, right: 360, bottom: 390 };
    if (mode === "footer-null") layout.footer = null;
    if (mode === "footer-edge") layout.footer = { left: 440, top: 1230, right: 600, bottom: 1262 };
    const text = mode === "malformed" ? "not JSON" : JSON.stringify({ checks, layout,
      observed_title: mode === "typo" ? "Vos reservation. Bien organisées." : brief.expectedTitle.replace(". ", ".\n"),
      reason: "Composition unique et titre conforme aux références TOK." });
    return Response.json({ status: mode === "incomplete" ? "incomplete" : "completed",
      output: [{ type: "message", content: [{ type: "output_text", text }] }] });
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.resetModules(); });

describe("daily native image and pixel review", () => {
  it("sends the actual JPEG and all pinned masters to strict vision review before one deterministic upload", async () => {
    const fetcher = mockNetwork();
    const upload = vi.fn().mockResolvedValue({ error: null });
    const client = { storage: { from: () => ({ upload, getPublicUrl: () => ({ data: { publicUrl: imageUrl } }) }) } };
    const { generateDailyMarketingVisual } = await import("../../supabase/functions/_shared/marketing-daily-visual");
    const result = await generateDailyMarketingVisual(client, options);
    expect(result).toMatchObject({ imageUrl, source: "created", quality: { status: "validated", dimensions: { width: 1024, height: 1280 }, reviewer_model: options.reviewModel } });
    expect(upload).toHaveBeenCalledExactlyOnceWith(imagePath, imageBytes, { contentType: "image/jpeg", upsert: false });
    const reviewCall = fetcher.mock.calls.find(([url]) => url.endsWith("/responses"));
    const review = JSON.parse(reviewCall![1]!.body as string);
    expect(review.store).toBe(false);
    expect(review.text.format).toMatchObject({ type: "json_schema", strict: true });
    const images = review.input[1].content.filter((item: { type: string }) => item.type === "input_image");
    expect(images).toHaveLength(TOK_MARKETING_REFERENCES.length + 1);
    expect(images.at(-1).image_url).toBe(`data:image/jpeg;base64,${Buffer.from(imageBytes).toString("base64")}`);
    const instructions = review.input[1].content.find((item: { type: string }) => item.type === "input_text").text;
    expect(instructions).toContain(`La marge minimale de ${TOK_MARKETING_REVIEW_SAFE_MARGIN_PERCENT} %`);
    const marginRule = instructions.split("\n").find((line: string) => line.startsWith("layout ="));
    expect(marginRule).not.toContain(`${TOK_MARKETING_GENERATION_SAFE_MARGIN_PERCENT} %`);
    expect(marginRule).not.toContain("contraste");
    expect(marginRule).toContain("de cette image de 1024 × 1280 px");
    expect(marginRule).toContain("62 px à gauche et à droite");
    expect(marginRule).toContain("77 px en haut et en bas");
    expect(marginRule).toContain("footer = pied thetok.ch, ou null s'il est absent");
    expect(marginRule).toContain("son liseré et sa bulle Miamz!");
    expect(marginRule).toContain("vérifiée par le code à partir de ces boîtes");
    expect(marginRule).toContain("Les fonds, photographies, arches et filets décoratifs ne sont pas mesurés");
    expect(review.text.format.schema.required).toEqual(["checks", "layout", "observed_title", "reason"]);
    expect(review.text.format.schema.properties.checks.required).not.toContain("safe_margins");
    expect(result.quality.checks.safe_margins).toBe(true);
    expect(result.quality.margins).toEqual({ left: 140, top: 170, right: 144, bottom: 170 });
    expect(instructions).toContain("text_legible = lisible à taille de téléphone, bon contraste, aucun mot corrompu");
    // The reviewer must permit the exact brand elements requested from generation,
    // while still transcribing only the headline for the strict title comparison.
    expect(instructions).toContain("intact et non coupé avec sa bulle Miamz!");
    expect(instructions).toContain("sans inclure le logo, sa bulle Miamz! ni le pied thetok.ch dans observed_title");
    expect(instructions).toContain("Textes de marque autorisés hors titre : TOK et sa bulle Miamz!");
    expect(instructions).toContain("aucun accent jaune");
  });

  it("recovers an uploaded image after a lost completion acknowledgement without another image generation", async () => {
    const fetcher = mockNetwork("recovered");
    const upload = vi.fn();
    const client = { storage: { from: () => ({ upload, getPublicUrl: () => ({ data: { publicUrl: imageUrl } }) }) } };
    const { generateDailyMarketingVisual } = await import("../../supabase/functions/_shared/marketing-daily-visual");
    expect(await generateDailyMarketingVisual(client, options)).toMatchObject({ source: "recovered", imageUrl });
    expect(upload).not.toHaveBeenCalled();
    expect(fetcher.mock.calls.filter(([url]) => url.endsWith("/images/edits"))).toHaveLength(0);
    expect(fetcher.mock.calls.filter(([url]) => url.endsWith("/responses"))).toHaveLength(1);
  });

  it.each([
    ["storage500", "marketing_daily_storage_unavailable"], ["multiple", "marketing_daily_image_count_invalid"],
    ["grid", "marketing_daily_quality_single_visual"], ["typo", "marketing_daily_quality_title_mismatch"],
    ["square", "marketing_daily_image_dimensions"], ["review500", "marketing_daily_review_http_503"],
    ["incomplete", "marketing_daily_review_incomplete"], ["malformed", "marketing_daily_review_invalid"],
    ["missing-master", "marketing_image_response_invalid"], ["changed-master", "marketing_brand_reference_changed"],
    ["margins", "marketing_daily_quality_safe_margins"], ["recovered-margins", "marketing_daily_quality_safe_margins"],
    ["contrast", "marketing_daily_quality_text_legible"], ["missing-margins", "marketing_daily_review_invalid"],
    ["fractional-box", "marketing_daily_review_invalid"], ["footer-edge", "marketing_daily_quality_safe_margins"],
    ["model-margins", "marketing_daily_review_invalid"],
    ["image-quota", "marketing_daily_image_quota_exhausted"], ["image-rate", "marketing_daily_image_rate_limited"],
    ["review-quota", "marketing_daily_review_quota_exhausted"],
  ] as const)("rejects %s without uploading or silently accepting a fallback", async (mode, error) => {
    const fetcher = mockNetwork(mode);
    const upload = vi.fn();
    const client = { storage: { from: () => ({ upload, getPublicUrl: () => ({ data: { publicUrl: imageUrl } }) }) } };
    const { generateDailyMarketingVisual } = await import("../../supabase/functions/_shared/marketing-daily-visual");
    await expect(generateDailyMarketingVisual(client, options)).rejects.toThrow(error);
    expect(upload).not.toHaveBeenCalled();
    if (mode === "recovered-margins") {
      expect(fetcher.mock.calls.filter(([url]) => url.endsWith("/images/edits"))).toHaveLength(0);
      expect(fetcher.mock.calls.filter(([url]) => url.endsWith("/responses"))).toHaveLength(1);
    } else if (mode === "margins" || mode === "contrast") {
      expect(fetcher.mock.calls.filter(([url]) => url.endsWith("/images/edits"))).toHaveLength(1);
      expect(fetcher.mock.calls.filter(([url]) => url.endsWith("/responses"))).toHaveLength(1);
    }
  });

  it("accepts a post without the optional thetok.ch footer when the logo and title keep their margins", async () => {
    mockNetwork("footer-null");
    const client = { storage: { from: () => ({ upload: vi.fn().mockResolvedValue({ error: null }), getPublicUrl: () => ({ data: { publicUrl: imageUrl } }) }) } };
    const { generateDailyMarketingVisual } = await import("../../supabase/functions/_shared/marketing-daily-visual");
    expect(await generateDailyMarketingVisual(client, options)).toMatchObject({ source: "created",
      quality: { checks: { safe_margins: true }, margins: { left: 140, top: 170, right: 144, bottom: 640 } } });
  });

  it("applies the 6 % rule to the measured boxes, exactly at the 62 px and 77 px limits", () => {
    const dimensions = { width: 1024, height: 1280 };
    const margins = measureDailyMargins([
      { left: 62, top: 77, right: 300, bottom: 300 },
      { left: 100, top: 400, right: 962, bottom: 1203 },
    ], dimensions);
    expect(margins).toEqual({ left: 62, top: 77, right: 62, bottom: 77 });
    expect(dailyMarginsAreSafe(margins, dimensions)).toBe(true);
    expect(dailyMarginsAreSafe({ ...margins, left: 61 }, dimensions)).toBe(false);
    expect(dailyMarginsAreSafe({ ...margins, bottom: 76 }, dimensions)).toBe(false);
  });

  it("recognizes Supabase's explicit missing-key response, without treating other storage errors as absence", async () => {
    mockNetwork("missing400");
    const client = { storage: { from: () => ({ upload: vi.fn().mockResolvedValue({ error: null }), getPublicUrl: () => ({ data: { publicUrl: imageUrl } }) }) } };
    const { generateDailyMarketingVisual } = await import("../../supabase/functions/_shared/marketing-daily-visual");
    expect(await generateDailyMarketingVisual(client, options)).toMatchObject({ source: "created" });
  });

  it.each([{ apiKey: "" }, { reviewModel: "" }, { reviewModel: "x".repeat(121) }, { runId: "../another-path" }, { supabaseUrl: "https://elsewhere.test/" }])("checks prerequisites before any paid generation (%j)", async (override) => {
    const fetcher = mockNetwork();
    const client = { storage: { from: () => ({ upload: vi.fn(), getPublicUrl: () => ({ data: { publicUrl: imageUrl } }) }) } };
    const { generateDailyMarketingVisual } = await import("../../supabase/functions/_shared/marketing-daily-visual");
    await expect(generateDailyMarketingVisual(client, { ...options, ...override })).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects a failed/ambiguous upload so that the next lease recovers instead of overwriting", async () => {
    mockNetwork();
    const upload = vi.fn().mockResolvedValue({ error: { message: "already exists" } });
    const client = { storage: { from: () => ({ upload, getPublicUrl: () => ({ data: { publicUrl: imageUrl } }) }) } };
    const { generateDailyMarketingVisual } = await import("../../supabase/functions/_shared/marketing-daily-visual");
    await expect(generateDailyMarketingVisual(client, options)).rejects.toThrow("marketing_daily_storage_upload_failed");
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it("bounds JPEG geometry and rejects a truncated file before vision review", () => {
    expect(readDailyJpegDimensions(imageBytes)).toEqual({ width: 1024, height: 1280 });
    expect(() => readDailyJpegDimensions(imageBytes.slice(0, -1))).toThrow("marketing_daily_image_invalid");
    expect(() => readDailyJpegDimensions(new Uint8Array(8_000_001))).toThrow("marketing_daily_image_invalid");
    expect(() => readDailyJpegDimensions(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).toThrow("marketing_daily_image_invalid");
  });
});
