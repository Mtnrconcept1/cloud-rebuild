import { createHash, webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildTokMarketingVisualPrompt, buildTokMailingVisualPrompt, TOK_MARKETING_REFERENCES } from "../../supabase/functions/_shared/marketing-brand";

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xd9]);
function setup(mode: "ok" | "missing" | "changed" | "provider" | "invalid-output" | "oversize" = "ok") {
  const upload = vi.fn().mockResolvedValue({ error: null });
  const client = { storage: { from: vi.fn().mockReturnValue({ upload, getPublicUrl: (path: string) => ({ data: { publicUrl: `https://storage.example/${path}` } }) }) } };
  const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
    if (url.startsWith("https://www.thetok.ch/")) {
      if (mode === "missing") return new Response("missing", { status: 404 });
      if (mode === "changed") return new Response("replaced artwork");
      if (mode === "oversize") return new Response("x", { headers: { "content-length": "9999999" } });
      const reference = TOK_MARKETING_REFERENCES.find((item) => url.endsWith(item.path));
      if (!reference) throw new Error("unexpected reference URL");
      expect(options?.redirect).toBe("error");
      expect(options?.headers).toBeUndefined();
      return new Response(readFileSync(resolve(process.cwd(), `public${reference.path}`)));
    }
    expect(url).toBe("https://api.openai.com/v1/images/edits");
    if (mode === "provider") return new Response("unavailable", { status: 503 });
    return Response.json({ data: [{ b64_json: (mode === "invalid-output" ? Buffer.from("not a JPEG") : jpeg).toString("base64") }] });
  });
  vi.stubGlobal("fetch", fetcher);
  // jsdom's ArrayBuffer belongs to another realm than Node's native WebCrypto.
  vi.stubGlobal("crypto", { subtle: { digest: (algorithm: string, bytes: ArrayBuffer) => webcrypto.subtle.digest(algorithm, Buffer.from(new Uint8Array(bytes))) } });
  return { fetcher, client, upload };
}
const options = { prompt: "5 CHF par table. Découvrez TOK.", campaignSlug: "tok-geneve", index: 0, apiKey: "test-only" };
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.resetModules(); });

describe("TOK brand reference conditioning", () => {
  it("pins the Instagram master first and all supplied artworks byte-for-byte", () => {
    expect(TOK_MARKETING_REFERENCES).toHaveLength(3);
    expect(TOK_MARKETING_REFERENCES[0]).toMatchObject({
      id: "instagram-profile", path: "/marketing/brand/tok-v3/instagram-profile.jpeg",
    });
    for (const reference of TOK_MARKETING_REFERENCES) {
      const bytes = readFileSync(resolve(process.cwd(), `public${reference.path}`));
      expect(bytes.length).toBeLessThan(2_000_000);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(reference.sha256);
    }
  });
  it("sends the master and all identity references to edits for one native image", async () => {
    const { fetcher, client, upload } = setup();
    const { generateCampaignVisual } = await import("../../supabase/functions/_shared/marketing-visual");
    expect(await generateCampaignVisual(client, options)).toMatch(/marketing-ai\/tok-geneve\/.*\.jpg$/);
    const provider = fetcher.mock.calls.find(([url]) => url.includes("api.openai.com"));
    const form = provider?.[1]?.body as FormData;
    expect(form.get("prompt")).toContain(options.prompt);
    expect(form.get("size")).toBe("1024x1280");
    expect(form.get("output_format")).toBe("jpeg");
    expect(form.get("n")).toBe("1");
    expect(form.has("input_fidelity")).toBe(false);
    const files = form.getAll("image[]") as File[];
    expect(files).toHaveLength(3);
    for (let index = 0; index < files.length; index++) {
      expect(files[index].name).toBe(`${TOK_MARKETING_REFERENCES[index].id}.jpg`);
      expect(createHash("sha256").update(Buffer.from(await new Promise<ArrayBuffer>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result as ArrayBuffer); reader.onerror = reject; reader.readAsArrayBuffer(files[index]); }))).digest("hex")).toBe(TOK_MARKETING_REFERENCES[index].sha256);
    }
    expect(provider?.[1]?.headers).toEqual({ Authorization: "Bearer test-only" });
    expect(upload).toHaveBeenCalledWith(expect.stringContaining(".jpg"), new Uint8Array(jpeg), { contentType: "image/jpeg", upsert: false });
    await generateCampaignVisual(client, options);
    expect(fetcher.mock.calls.filter(([url]) => url.startsWith("https://www.thetok.ch/"))).toHaveLength(3);
  });
  it.each([
    ["1:1", "1024x1024"],
    ["9:16", "720x1280"],
    ["16:9", "1280x720"],
  ] as const)("maps the requested %s format to an exact supported image size", async (format, size) => {
    setup();
    const { buildTokMarketingImageForm } = await import("../../supabase/functions/_shared/marketing-visual");
    const form = await buildTokMarketingImageForm(options.prompt, format);
    expect(form.get("size")).toBe(size);
  });
  it.each(["missing", "changed", "oversize"] as const)("fails closed when a reference is %s, and retries loading next time", async (mode) => {
    const { client, upload, fetcher } = setup(mode);
    const { generateCampaignVisual } = await import("../../supabase/functions/_shared/marketing-visual");
    expect(await generateCampaignVisual(client, options)).toBeNull();
    expect(upload).not.toHaveBeenCalled();
    expect(fetcher.mock.calls.every(([url]) => url.startsWith("https://www.thetok.ch/"))).toBe(true);
    setup();
    expect(await generateCampaignVisual(client, options)).not.toBeNull();
  });
  it.each(["provider", "invalid-output"] as const)("never falls back to text-only generation after %s failure", async (mode) => {
    const { client, upload, fetcher } = setup(mode);
    const { generateCampaignVisual } = await import("../../supabase/functions/_shared/marketing-visual");
    expect(await generateCampaignVisual(client, options)).toBeNull();
    expect(upload).not.toHaveBeenCalled();
    expect(fetcher.mock.calls.some(([url]) => url.includes("/generations"))).toBe(false);
  });
  it("handles storage failure and an absent key without creating an asset", async () => {
    const { client, upload, fetcher } = setup();
    const { generateCampaignVisual } = await import("../../supabase/functions/_shared/marketing-visual");
    expect(await generateCampaignVisual(client, { ...options, apiKey: "" })).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
    upload.mockResolvedValue({ error: { message: "unavailable" } });
    expect(await generateCampaignVisual(client, options)).toBeNull();
  });
  it("aborts a stalled provider within the caller budget without retrying unbranded", async () => {
    const { client, upload } = setup();
    const { generateCampaignVisual, buildTokMarketingImageForm } = await import("../../supabase/functions/_shared/marketing-visual");
    await buildTokMarketingImageForm(options.prompt);
    vi.useFakeTimers();
    const fetcher = vi.fn((_url: string, request: RequestInit) => new Promise((_resolve, reject) => {
      request.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    vi.stubGlobal("fetch", fetcher);
    const pending = generateCampaignVisual(client, { ...options, timeoutMs: 25 });
    await vi.advanceTimersByTimeAsync(26);
    expect(await pending).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(upload).not.toHaveBeenCalled();
  });
  it("preserves the complete brand rules even for a maximal brief", () => {
    const prompt = buildTokMarketingVisualPrompt("x".repeat(10_000));
    expect(prompt.length).toBeLessThan(8000);
    expect(prompt).toContain("moustache noire");
    expect(prompt).toContain("Ne reprendre AUCUN prix concurrent");
    expect(prompt).toContain("CONTRÔLE FINAL");
    expect(prompt).not.toContain("x".repeat(4001));
  });
  it("prioritizes the supplied Instagram style without copying its grid or imposing a mascot", () => {
    const prompt = buildTokMarketingVisualPrompt("Titre exact : Vos réservations. Bien organisées.");
    expect(prompt).toContain("la première image jointe, Profil Instagram TOK, est la référence maîtresse");
    expect(prompt).toContain("Ne jamais reproduire la grille");
    expect(prompt).toContain("titres en casse phrase");
    expect(prompt).toContain("CHEF CONDITIONNEL");
    expect(prompt).toContain("PRODUCTION NATIVE");
    expect(prompt).not.toContain("titres en capitales");
    expect(prompt).not.toContain("CTA et thetok.ch en bas");
  });
  it.each([["1:1", "1024x1024"], ["9:16", "720x1280"], ["16:9", "1280x720"], ["4:5", "1024x1280"]] as const)("sends the selected %s ratio to the image provider", async (format, size) => {
    setup();
    const { buildTokMarketingImageForm } = await import("../../supabase/functions/_shared/marketing-visual");
    const form = await buildTokMarketingImageForm(options.prompt, format);
    expect(form.get("size")).toBe(size);
    expect(form.get("prompt")).toContain(`au format ${format}`);
  });
  it("uses the approved TOK mailing editorial system without reproducing the unrelated social grid", () => {
    const prompt = buildTokMailingVisualPrompt("TITRE : Plusieurs adresses. Une vue claire.");
    expect(prompt).toContain("CHARTE DES 10 EXEMPLES EMAIL VALIDÉS");
    expect(prompt).toContain("public/marketing/brand/tok-v3/studio-chef.jpeg");
    expect(prompt).toContain("#FF4B11");
    expect(prompt).toContain("« Pensé pour les restaurateurs. »");
    expect(prompt).toContain("grand bouton noir");
    expect(prompt).toContain("petite bulle Miamz!");
    expect(prompt).toContain("AFFICHE EMAIL TOK");
    expect(prompt).toContain("BRIEF COURANT");
    expect(prompt).toContain("Plusieurs adresses. Une vue claire.");
    expect(prompt).not.toContain("Aucun paragraphe sur l'image");
  });
  it("enforces exact 9:16 dimensions on mailing even when a caller requests a social format", async () => {
    setup();
    const { buildTokMarketingImageForm } = await import("../../supabase/functions/_shared/marketing-visual");
    const form = await buildTokMarketingImageForm("Le message réel d'un restaurant", "16:9", true);
    expect(form.get("size")).toBe("720x1280");
    expect(form.get("output_format")).toBe("jpeg");
    expect((form.getAll("image[]") as File[]).map(file => file.name)).toEqual([
      "studio-chef.jpg", "instagram-profile.jpg", "culinary.jpg",
    ]);
    expect(String(form.get("prompt"))).toContain("en-tête logo+signature");
    expect(String(form.get("prompt"))).toContain("Découvrir TOK");
  });

});
