import { deflateSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { marketingAgentHandler, marketingRpcHandler, type MarketingApiRequest, type MarketingApiResponse } from "../../server/marketingBff";
import { MAX_MAILING_IMAGE_BYTES, MailingImageInputError, validateMailingImage } from "../../server/marketingMailingImage";

// Independently encoded RGB fixtures (Pillow/libjpeg), including progressive scans.
const BASELINE_JPEG = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAIAAwDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDh9C+Hn3f3P6V3Nn8PP3C/uf0ooqMJialtzg4fzvGez+I//9k=";
const PROGRESSIVE_JPEG = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wgARCAAIAAwDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAVAQEBAAAAAAAAAAAAAAAAAAACBP/aAAwDAQACEAMQAAABh3Az/wD/xAAYEAACAwAAAAAAAAAAAAAAAAAABQIDIf/aAAgBAQABBQKheQX5/8QAGREAAQUAAAAAAAAAAAAAAAAAAAMEBRIx/9oACAEDAQE/AY96tXT/xAAWEQEBAQAAAAAAAAAAAAAAAAADAAL/2gAIAQIBAT8BJNX/xAAVEAEBAAAAAAAAAAAAAAAAAAAAMf/aAAgBAQAGPwKI/8QAFhABAQEAAAAAAAAAAAAAAAAAACEx/9oACAEBAAE/IcWN/9oADAMBAAIAAwAAABB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxAj/8QAFhEAAwAAAAAAAAAAAAAAAAAAABEx/9oACAECAQE/EFqf/8QAFhABAQEAAAAAAAAAAAAAAAAAAOHx/9oACAEBAAE/EMxGP//Z";
const FAKE_JPEG = Buffer.from("ffd8ffc0000b080001000101011100ffda0008010100003f0000ffd9", "hex");
const actor = "11111111-1111-4111-8111-111111111111";
const itemId = "22222222-2222-4222-8222-222222222222";
const campaignId = "33333333-3333-4333-8333-333333333333";
const revision = "2026-10-18T09:30:00.123456+00:00";
const csrf = "c".repeat(43);
const project = "https://project.supabase.co";

function chunk(kind: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(kind), data]);
  let crc = 0xffffffff;
  for (const byte of body) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, body, checksum]);
}
function png(options: { width?: number; height?: number; raw?: Buffer; padding?: number; extra?: Buffer } = {}) {
  const width = options.width ?? 2; const height = options.height ?? 3;
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = options.raw ?? Buffer.alloc(height * (width * 4 + 1));
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr),
    ...(options.padding ? [chunk("tEXt", Buffer.concat([Buffer.from("Description\0"), Buffer.alloc(options.padding, 120)]))] : []),
    ...(options.extra ? [options.extra] : []), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0)),
  ]);
}
const PNG = png();

function request(body: Record<string, unknown>): MarketingApiRequest {
  return { method: "POST", body, headers: {
    host: "marketing.thetok.ch", origin: "https://marketing.thetok.ch", "sec-fetch-site": "same-origin",
    "content-type": "application/json", "x-forwarded-proto": "https",
    cookie: `__Host-tok_marketing_sid=${"s".repeat(43)}; __Host-tok_marketing_csrf=${csrf}`,
    "x-tok-marketing-csrf": csrf,
  } };
}
function recorder() {
  let output = "";
  const response: MarketingApiResponse = { statusCode: 0, setHeader: vi.fn(), end: (value) => { output = value || ""; } };
  return { response, value: () => JSON.parse(output) };
}
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
const uploadBody = (patch: Record<string, unknown> = {}) => ({ action: "upload_mailing_image", itemId,
  expectedUpdatedAt: revision, contentType: "image/png", imageBase64: PNG.toString("base64"), ...patch });
const item = (patch: Record<string, unknown> = {}) => ({ id: itemId, campaign_id: campaignId, channel: "email",
  status: "draft", approval_status: "pending", updated_at: revision, scheduled_at: "2026-12-01T10:00:00Z",
  title: "Notre proposition", targeting: { audience_kind: "restaurant" },
  content: { mailing_version: "tok-mailing-v1", image_mode: "manual", subject: "Un message", body: "Texte conservé",
    visual_url: "https://project.supabase.co/storage/v1/object/public/social-post-media/shared.jpg" }, ...patch });

function upstream(options: {
  session?: boolean; admin?: boolean; quota?: boolean; persistentQuota?: boolean; item?: Record<string, unknown> | null;
  campaign?: Record<string, unknown> | null; storageStatus?: number; attachStatus?: number; attachThrows?: boolean;
  prepareStatus?: number; generated?: Record<string, unknown>; invalidAttachment?: boolean; invalidPreparation?: boolean;
} = {}) {
  const quotas = new Map<string, number>();
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input); const args = typeof init?.body === "string" ? JSON.parse(init.body) : {};
    if (url.endsWith("/rpc/service_get_marketing_web_session")) return json(options.session === false ? null : {
      user_id: actor, email: "admin@example.org", expires_at: new Date(Date.now() + 600_000).toISOString(),
    });
    if (url.endsWith(`/admin/users/${actor}`)) return json({ id: actor, email: "admin@example.org" });
    if (url.includes("/user_roles?")) return json(options.admin === false ? [] : [{ user_id: actor }]);
    if (url.endsWith("/rpc/service_consume_marketing_auth_attempt")) {
      const count = (quotas.get(args.p_key_hash) ?? 0) + 1; quotas.set(args.p_key_hash, count);
      return json({ allowed: options.quota !== false && (!options.persistentQuota || count <= 5), retry_after_seconds: 60 });
    }
    if (url.includes("/marketing_calendar_items?")) {
      const id = new URL(url).searchParams.get("id")?.slice(3);
      return json(options.item === null ? [] : [{ ...item(), id, ...options.item }]);
    }
    if (url.includes("/marketing_campaigns?")) return json(options.campaign === null ? [] : [
      { id: campaignId, status: "draft", approved_at: null, ...options.campaign },
    ]);
    if (url.includes("/storage/v1/object/social-post-media")) return json({ Key: "stored" }, options.storageStatus ?? 200);
    if (url.endsWith("/rpc/service_execute_marketing_admin_operation")) {
      if (args.p_operation === "admin_attach_marketing_mailing_image") {
        if (options.attachThrows) throw new DOMException("Timeout", "AbortError");
        const previous = item(options.item ?? {});
        return json(options.invalidAttachment ? {} : { ...previous, id: args.p_args.p_item_id,
          updated_at: "2026-10-18T09:31:00.000001+00:00", content: { ...previous.content,
            image_mode: "manual", visual_status: "ready", visual_source: "upload", visual_required: true,
            visual_url: args.p_args.p_visual_url, visual_width: args.p_args.p_width, visual_height: args.p_args.p_height,
            format: null, visual_format: null } }, options.attachStatus ?? 200);
      }
      if (args.p_operation === "admin_prepare_marketing_mailing_recipients") return json(options.invalidPreparation ? {} : {
        recipient_count: args.p_args.p_emails.length, created_count: args.p_args.p_emails.length, existing_count: 0,
        estimate: { total: args.p_args.p_emails.length, eligible_count: 0, by_channel: { email: { eligible: 0 } } },
      }, options.prepareStatus ?? 200);
      if (args.p_operation === "admin_create_marketing_campaign_bundle") return json({ campaign: { id: campaignId },
        items: args.p_args.p_payload.items.map((entry: Record<string, unknown>, index: number) => ({
          id: `${index}`, content: entry.content, channel: entry.channel, updated_at: revision })) });
    }
    if (url.endsWith("/functions/v1/ai-marketing-agent")) return json(options.generated ?? { sources: [] });
    throw new Error("Unexpected upstream route");
  });
}

beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", project);
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "publishable-key-longer-than-twenty");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_" + "x".repeat(32));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("mailing image decoding", () => {
  it.each([BASELINE_JPEG, PROGRESSIVE_JPEG])("accepts real baseline and progressive JPEGs without re-encoding", (base64) => {
    const value = validateMailingImage("image/jpeg", base64);
    expect(value).toMatchObject({ width: 12, height: 8, extension: "jpg", contentType: "image/jpeg" });
    expect(value.bytes.equals(Buffer.from(base64, "base64"))).toBe(true);
  });
  it("keeps an uploaded portrait's actual dimensions and bytes", () => {
    const result = validateMailingImage("image/png", PNG.toString("base64"));
    expect(result).toMatchObject({ width: 2, height: 3, extension: "png" });
    expect(result.bytes.equals(PNG)).toBe(true);
  });
  it.each([
    ["image/gif", PNG.toString("base64")], ["image/jpeg", PNG.toString("base64")], ["image/png", BASELINE_JPEG],
    ["image/svg+xml", Buffer.from("<svg/>").toString("base64")], ["image/png", "data:image/png;base64," + PNG.toString("base64")],
    ["image/png", ""], ["image/png", "A==="], ["image/png", "AA=A"], ["image/png", "AAAA\n"], ["image/png", 42],
    ["image/jpeg", FAKE_JPEG.toString("base64")], ["image/jpeg", Buffer.from(BASELINE_JPEG, "base64").subarray(0, -2).toString("base64")],
  ])("rejects invalid or undecodable bytes (%s)", (type, bytes) => {
    expect(() => validateMailingImage(type, bytes)).toThrow(MailingImageInputError);
  });
  it("rejects damaged JPEG entropy even with a genuine header and EOI", () => {
    const bytes = Buffer.from(BASELINE_JPEG, "base64");
    const sos = bytes.indexOf(Buffer.from([0xff, 0xda]));
    const end = sos + 2 + bytes.readUInt16BE(sos + 2);
    const damaged = Buffer.concat([bytes.subarray(0, end), Buffer.from([0xff, 0xd9])]);
    expect(() => validateMailingImage("image/jpeg", damaged.toString("base64"))).toThrow(MailingImageInputError);
  });
  it.each([
    png({ raw: Buffer.from([0]) }), png({ raw: Buffer.alloc(27, 5) }), png({ width: 8193, height: 1, raw: Buffer.alloc(1) }),
    png({ width: 8192, height: 8192, raw: Buffer.alloc(1) }), png({ extra: chunk("acTL", Buffer.alloc(8)) }),
    png({ extra: chunk("FAKE", Buffer.alloc(1)) }), Buffer.concat([PNG, Buffer.from([0])]), PNG.subarray(0, -1),
  ])("rejects PNG raster, animation, truncation and dimension violations", (bytes) => {
    expect(() => validateMailingImage("image/png", bytes.toString("base64"))).toThrow(MailingImageInputError);
  });
  it("checks CRC rather than trusting a PNG signature", () => {
    const broken = Buffer.from(PNG); broken[29] ^= 1;
    expect(() => validateMailingImage("image/png", broken.toString("base64"))).toThrow(MailingImageInputError);
  });
  it("bounds compressed upload bytes before decoding", () => {
    expect(() => validateMailingImage("image/png", Buffer.alloc(MAX_MAILING_IMAGE_BYTES + 1).toString("base64"))).toThrow(MailingImageInputError);
  });
});

describe("mailing upload service boundary", () => {
  it("does not expose the private attachment RPC through the generic browser route", async () => {
    const mock = upstream(); vi.stubGlobal("fetch", mock); const res = recorder();
    await marketingRpcHandler(request({ operation: "admin_attach_marketing_mailing_image", args: {
      p_item_id: itemId, p_expected_updated_at: revision, p_width: 2, p_height: 3,
      p_visual_url: "https://untrusted.example/storage/v1/object/public/social-post-media/elsewhere.png",
    } }), res.response);
    expect(res.response.statusCode).toBeGreaterThanOrEqual(400);
    expect(mock).not.toHaveBeenCalled();
  });
  it.each(["sb_secret_" + "x".repeat(32), "legacy-service-role-" + "x".repeat(32)])("authenticates every server request with the supported API key format", async (key) => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", key); const mock = upstream(); vi.stubGlobal("fetch", mock);
    const res = recorder(); await marketingAgentHandler(request(uploadBody()), res.response);
    expect(res.response.statusCode).toBe(200);
    for (const [, init] of mock.mock.calls) {
      const headers = new Headers(init?.headers);
      expect(headers.get("apikey")).toBe(key);
      expect(headers.get("authorization")).toBe(key.startsWith("sb_secret_") ? null : `Bearer ${key}`);
    }
  });
  it("uploads original bytes at a unique server path and attaches only that image atomically", async () => {
    const mock = upstream(); vi.stubGlobal("fetch", mock);
    const res = recorder(); await marketingAgentHandler(request(uploadBody()), res.response);
    expect(res.response.statusCode).toBe(200); expect(res.value().ok).toBe(true);
    expect(res.value().item).toMatchObject({ id: itemId, title: "Notre proposition", scheduled_at: "2026-12-01T10:00:00Z",
      content: { body: "Texte conservé", image_mode: "manual", visual_width: 2, visual_height: 3, format: null } });
    const upload = mock.mock.calls.find(([url, init]) => String(url).includes("/storage/") && init?.method === "POST")!;
    expect(String(upload[0])).toMatch(new RegExp(`/marketing-mailing/${actor}/${itemId}/[a-f0-9-]{36}\\.png$`));
    expect(Buffer.from(upload[1]!.body as Uint8Array).equals(PNG)).toBe(true);
    expect(new Headers(upload[1]!.headers).get("x-upsert")).toBe("false");
    const attach = mock.mock.calls.find(([url]) => String(url).includes("service_execute_marketing_admin_operation"))!;
    const rpc = JSON.parse(String(attach[1]!.body));
    expect(rpc.p_operation).toBe("admin_attach_marketing_mailing_image");
    expect(rpc.p_args).toEqual({ p_item_id: itemId, p_expected_updated_at: revision,
      p_visual_url: res.value().visualUrl, p_width: 2, p_height: 3 });
    expect(rpc.p_sid_hash).toMatch(/^[0-9a-f]{64}$/); expect(rpc.p_csrf_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(mock.mock.calls.every(([url]) => !String(url).includes("functions/v1"))).toBe(true);
  });
  it.each(["session", "admin", "csrf", "origin", "method", "quota"])("blocks a failed %s gate before uploading", async (gate) => {
    const mock = upstream({ [gate]: false }); vi.stubGlobal("fetch", mock); const req = request(uploadBody());
    if (gate === "csrf") delete req.headers["x-tok-marketing-csrf"];
    if (gate === "origin") req.headers.origin = "https://evil.example";
    if (gate === "method") req.method = "GET";
    const res = recorder(); await marketingAgentHandler(req, res.response);
    expect(res.response.statusCode).toBeGreaterThanOrEqual(400);
    expect(mock.mock.calls.every(([url]) => !String(url).includes("/storage/") && !String(url).includes("service_execute_marketing_admin_operation"))).toBe(true);
  });
  it.each([{ status: "scheduled" }, { status: "sent" }, { approval_status: "approved" }, { channel: "instagram" },
    { content: { mailing_version: "other" } }, { updated_at: "2026-10-18T09:30:00.123457+00:00" }, null])("checks the current row before storage: %o", async (patch) => {
    const mock = upstream({ item: patch }); vi.stubGlobal("fetch", mock); const res = recorder();
    await marketingAgentHandler(request(uploadBody()), res.response);
    expect(res.response.statusCode).toBe(409); expect(res.value().error.code).toBe("mailing_image_conflict");
    expect(mock.mock.calls.every(([url]) => !String(url).includes("/storage/"))).toBe(true);
  });
  it.each([{ approved_at: revision }, { status: "completed" }, { status: "cancelled" }, { status: "failed" }, null])("blocks an approved or terminal parent before storage: %o", async (campaign) => {
    const mock = upstream({ campaign }); vi.stubGlobal("fetch", mock); const res = recorder();
    await marketingAgentHandler(request(uploadBody()), res.response);
    expect(res.response.statusCode).toBe(409); expect(mock.mock.calls.every(([url]) => !String(url).includes("/storage/"))).toBe(true);
  });
  it.each(["draft", "failed", "blocked_configuration"])("allows a nonapproved %s mail without changing its state", async (status) => {
    const mock = upstream({ item: { status } }); vi.stubGlobal("fetch", mock); const res = recorder();
    await marketingAgentHandler(request(uploadBody()), res.response);
    expect(res.response.statusCode).toBe(200); expect(res.value().item.status).toBe(status);
  });
  it("supports an isolated draft and preserves a real revision with a timezone", async () => {
    const mock = upstream({ item: { campaign_id: null } }); vi.stubGlobal("fetch", mock); const res = recorder();
    await marketingAgentHandler(request(uploadBody({ expectedUpdatedAt: "2026-10-18T11:30:00.123456+02:00" })), res.response);
    expect(res.response.statusCode).toBe(200); expect(mock.mock.calls.every(([url]) => !String(url).includes("/marketing_campaigns?"))).toBe(true);
  });
  it.each([{ itemId: "../elsewhere" }, { expectedUpdatedAt: "now" }, { expectedUpdatedAt: "2026-02-30T09:00:00Z" },
    { expectedUpdatedAt: "2026-10-18T09:30:00.1234567Z" }, { visualUrl: "http://127.0.0.1/image" }, { contentType: "image/svg+xml" }])("rejects invalid upload fields: %o", async (patch) => {
    const mock = upstream(); vi.stubGlobal("fetch", mock); const res = recorder();
    await marketingAgentHandler(request(uploadBody(patch)), res.response);
    expect(res.response.statusCode).toBe(400); expect(res.value().error.code).toBe("mailing_image_invalid");
    expect(mock.mock.calls.every(([url]) => !String(url).includes("/storage/"))).toBe(true);
  });
  it("accepts a real image payload beyond the normal 32 KB string limit", async () => {
    const mock = upstream(); vi.stubGlobal("fetch", mock); const res = recorder();
    await marketingAgentHandler(request(uploadBody({ imageBase64: png({ padding: 80_000 }).toString("base64") })), res.response);
    expect(res.response.statusCode).toBe(200);
  });
  it("does not grant the upload exception to another property", async () => {
    const mock = upstream(); vi.stubGlobal("fetch", mock); const res = recorder();
    await marketingAgentHandler(request(uploadBody({ other: "x".repeat(32_001) })), res.response);
    expect(res.response.statusCode).toBe(400); expect(mock).not.toHaveBeenCalled();
  });
  it("keeps the ordinary agent request limit at 16 KiB", async () => {
    const mock = upstream(); vi.stubGlobal("fetch", mock); const res = recorder();
    await marketingAgentHandler(request({ action: "list_runs", padding: "x".repeat(17_000) }), res.response);
    expect(res.response.statusCode).toBe(413); expect(mock).not.toHaveBeenCalled();
  });
  it("rejects advertised oversize bodies before any upstream request", async () => {
    const mock = upstream(); vi.stubGlobal("fetch", mock); const req = request(uploadBody());
    req.headers["content-length"] = String(4 * 1024 * 1024 + 4097);
    const res = recorder(); await marketingAgentHandler(req, res.response);
    expect(res.response.statusCode).toBe(413); expect(mock).not.toHaveBeenCalled();
  });
  it("allows all twelve distinct mail images but limits retries on one item", async () => {
    const mock = upstream({ persistentQuota: true }); vi.stubGlobal("fetch", mock);
    for (let index = 0; index < 12; index += 1) {
      const res = recorder(); await marketingAgentHandler(request(uploadBody({ itemId: `22222222-2222-4222-8222-${String(index).padStart(12, "0")}` })), res.response);
      expect(res.response.statusCode).toBe(200);
    }
    for (let index = 0; index < 6; index += 1) {
      const res = recorder(); await marketingAgentHandler(request(uploadBody()), res.response);
      expect(res.response.statusCode).toBe(index < 5 ? 200 : 429);
    }
  });
  it.each([400, 403, 409])("cleans up only the new object after an explicit SQL %i rejection", async (attachStatus) => {
    const mock = upstream({ attachStatus }); vi.stubGlobal("fetch", mock); const res = recorder();
    await marketingAgentHandler(request(uploadBody()), res.response);
    expect(res.response.statusCode).toBe(409);
    const cleanup = mock.mock.calls.find(([, init]) => init?.method === "DELETE")!;
    const paths = JSON.parse(String(cleanup[1]!.body)).prefixes;
    expect(paths).toHaveLength(1); expect(paths[0]).toMatch(new RegExp(`^marketing-mailing/${actor}/${itemId}/`));
    expect(paths[0]).not.toContain("shared.jpg");
  });
  it.each([{ attachStatus: 500 }, { attachStatus: 503 }, { attachThrows: true }, { invalidAttachment: true }])("retains the new object when the SQL result is ambiguous: %o", async (options) => {
    const mock = upstream(options); vi.stubGlobal("fetch", mock); const res = recorder();
    await marketingAgentHandler(request(uploadBody()), res.response);
    expect(res.response.statusCode).toBe(503); expect(res.value().error.code).toBe("mailing_image_upload_failed");
    expect(mock.mock.calls.every(([, init]) => init?.method !== "DELETE")).toBe(true);
  });
  it("never attaches an image whose storage upload failed", async () => {
    const mock = upstream({ storageStatus: 503 }); vi.stubGlobal("fetch", mock); const res = recorder();
    await marketingAgentHandler(request(uploadBody()), res.response);
    expect(res.response.statusCode).toBe(503);
    expect(mock.mock.calls.every(([url]) => !String(url).includes("service_execute_marketing_admin_operation"))).toBe(true);
  });
});

describe("explicit mailing recipients", () => {
  const generate = (emails?: string[], imageMode = "manual", emailCount = 2) => ({ action: "generate",
    objective: "Faire découvrir TOK aux restaurants", channels: ["email"], itemCount: emailCount,
    startsAt: new Date(Date.now() + 86_400_000).toISOString(), endsAt: new Date(Date.now() + 15 * 86_400_000).toISOString(),
    mailingOptions: { selections: emails ? {} : { city: ["Genève"] }, recipientEmails: emails, emailCount, cadence: "daily", imageMode } });
  const generated = (count = 2, emails?: string[]) => ({ missingVisualCount: count, bundle: {
    campaign: { audience_definition: { audience_kind: "mixed", recipient_emails: emails } },
    items: Array.from({ length: count }, () => ({ channel: "email", scheduled_at: "1999-01-01", targeting: { audience_kind: "mixed", recipient_emails: emails },
      content: { mailing_version: "tok-mailing-v1", subject: "Une invitation", body: "Texte généré", visual_url: "https://wrong.example/ai.jpg",
        visual_prompt: "AI prompt", visual_brand_profile: "old", visual_reference_ids: ["old"],
        brand_profile: "old", brand_profile_version: "old", reference_ids: ["old"] } })),
  } });
  it("normalizes and prepares recipients through the session-bound RPC", async () => {
    const mock = upstream(); vi.stubGlobal("fetch", mock); const res = recorder();
    await marketingAgentHandler(request({ action: "prepare_mailing_recipients", recipientEmails: [" FIRST@EXAMPLE.ORG ", "first@example.org", "second@example.org"] }), res.response);
    expect(res.response.statusCode).toBe(200); expect(res.value()).toMatchObject({ ok: true, recipient_count: 2, created_count: 2, existing_count: 0 });
    const prepare = mock.mock.calls.find(([url]) => String(url).includes("service_execute_marketing_admin_operation"))!;
    expect(JSON.parse(String(prepare[1]!.body))).toMatchObject({ p_operation: "admin_prepare_marketing_mailing_recipients", p_args: { p_emails: ["first@example.org", "second@example.org"] } });
    expect(mock.mock.calls.every(([url]) => !String(url).includes("functions/v1"))).toBe(true);
  });
  it.each([[], ["bad"], ["x@example.org\r\nBcc:a@example.org"], Array.from({ length: 501 }, (_, index) => `x${index}@example.org`), "x@example.org"])("rejects an invalid recipient list", async (recipientEmails) => {
    const mock = upstream(); vi.stubGlobal("fetch", mock); const res = recorder();
    await marketingAgentHandler(request({ action: "prepare_mailing_recipients", recipientEmails }), res.response);
    expect(res.response.statusCode).toBe(400);
    expect(mock.mock.calls.every(([url]) => !String(url).includes("service_execute_marketing_admin_operation"))).toBe(true);
  });
  it.each(["session", "admin", "csrf", "quota"])("protects recipient creation with the %s gate", async (gate) => {
    const mock = upstream({ [gate]: false }); vi.stubGlobal("fetch", mock);
    const req = request({ action: "prepare_mailing_recipients", recipientEmails: ["x@example.org"] });
    if (gate === "csrf") delete req.headers["x-tok-marketing-csrf"];
    const res = recorder(); await marketingAgentHandler(req, res.response);
    expect(res.response.statusCode).toBeGreaterThanOrEqual(400);
    expect(mock.mock.calls.every(([url]) => !String(url).includes("service_execute_marketing_admin_operation"))).toBe(true);
  });
  it.each([{ prepareStatus: 503 }, { invalidPreparation: true }])("blocks generation if recipient preparation is unavailable", async (options) => {
    const mock = upstream(options); vi.stubGlobal("fetch", mock); const res = recorder();
    await marketingAgentHandler(request(generate(["x@example.org"])), res.response);
    expect(res.response.statusCode).toBe(503); expect(res.value().error.code).toBe("mailing_recipients_unavailable");
    expect(mock.mock.calls.every(([url]) => !String(url).includes("functions/v1"))).toBe(true);
  });
  it("binds exact recipients and manual mode to all persisted mails after generation", async () => {
    const emails = ["x@example.org", "y@example.org"]; const mock = upstream({ generated: generated() }); vi.stubGlobal("fetch", mock);
    const res = recorder(); await marketingAgentHandler(request(generate(emails)), res.response);
    expect(res.response.statusCode).toBe(200); expect(res.value().pendingUploadCount).toBe(2); expect(res.value().warnings).toEqual([]);
    const calls = mock.mock.calls.filter(([url]) => String(url).includes("service_execute_marketing_admin_operation"));
    const operations = calls.map(([, init]) => JSON.parse(String(init!.body)));
    expect(operations.map((operation) => operation.p_operation)).toEqual(["admin_prepare_marketing_mailing_recipients", "admin_create_marketing_campaign_bundle"]);
    const bundle = operations[1].p_args.p_payload;
    expect(bundle.campaign.audience_definition).toEqual({ audience_kind: "mixed", recipient_emails: emails });
    for (const mail of bundle.items) {
      expect(mail.targeting).toEqual(bundle.campaign.audience_definition);
      expect(mail.content).toMatchObject({ body: "Texte généré", image_mode: "manual", visual_url: null, visual_source: "upload", visual_status: "pending_upload", visual_required: true, format: null, visual_format: null });
      for (const key of ["visual_prompt", "visual_brand_profile", "visual_reference_ids", "brand_profile", "brand_profile_version", "reference_ids"]) expect(mail.content).not.toHaveProperty(key);
    }
  });
  it("persists 500 maximum-length addresses across a twelve-email Edge response larger than one MiB", async () => {
    const domain = ["d".repeat(63), "e".repeat(63), "f".repeat(57), "org"].join(".");
    const emails = Array.from({ length: 500 }, (_, index) => `${String(index).padStart(4, "0")}${"a".repeat(60)}@${domain}`);
    expect(emails.every((email) => email.length === 254)).toBe(true);
    const agentReply = generated(12, emails); expect(Buffer.byteLength(JSON.stringify(agentReply))).toBeGreaterThan(1024 * 1024);
    const mock = upstream({ generated: agentReply }); vi.stubGlobal("fetch", mock); const res = recorder();
    await marketingAgentHandler(request(generate(emails, "manual", 12)), res.response);
    expect(res.response.statusCode).toBe(200); expect(res.value().items).toHaveLength(12);
    const persisted = mock.mock.calls.map(([, init]) => typeof init?.body === "string" ? JSON.parse(init.body) : {}).find((args) => args.p_operation === "admin_create_marketing_campaign_bundle");
    expect(persisted.p_args.p_payload.campaign.audience_definition.recipient_emails).toEqual(emails);
    expect(persisted.p_args.p_payload.items.every((mail: { targeting: { recipient_emails: string[] } }) => mail.targeting.recipient_emails.length === 500)).toBe(true);
  });
  it("does not enlarge the response limit of ordinary agent actions", async () => {
    const mock = upstream({ generated: { value: "x".repeat(1024 * 1024) } }); vi.stubGlobal("fetch", mock); const res = recorder();
    await marketingAgentHandler(request({ action: "list_runs" }), res.response);
    expect(res.response.statusCode).toBe(503);
  });
});
