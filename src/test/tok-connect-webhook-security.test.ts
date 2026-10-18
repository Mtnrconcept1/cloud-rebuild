import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { postPublicWebhook } from "../../supabase/functions/_shared/tok-connect-webhook-http.ts";
import { isSafeTokConnectWebhookUrl } from "../../supabase/functions/_shared/tok-connect.ts";

const encoder = new TextEncoder();
let bytes: Uint8Array;
let offset: number;
let closed: boolean;
let writes: string[];
let connect: ReturnType<typeof vi.fn>;
let startTls: ReturnType<typeof vi.fn>;
let resolveDns: ReturnType<typeof vi.fn>;

beforeEach(() => {
  bytes = encoder.encode("HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok");
  offset = 0;
  closed = false;
  writes = [];
  const conn = {
    read: vi.fn(async (target: Uint8Array) => {
      if (offset === bytes.byteLength) return null;
      const count = Math.min(target.byteLength, bytes.byteLength - offset);
      target.set(bytes.subarray(offset, offset + count));
      offset += count;
      return count;
    }),
    write: vi.fn(async (data: Uint8Array) => { writes.push(new TextDecoder().decode(data)); return data.byteLength; }),
    close: vi.fn(() => { closed = true; }),
    handshake: vi.fn(async () => ({ alpnProtocol: "http/1.1" })),
  };
  connect = vi.fn(async () => conn);
  startTls = vi.fn(async () => conn);
  resolveDns = vi.fn(async (_host: string, type: string) => type === "A" ? ["93.184.216.34"] : []);
  vi.stubGlobal("Deno", { connect, startTls, resolveDns });
});

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("public webhook transport", () => {
  it.each([
    "https://127.0.0.1/", "https://2130706433/", "https://0x7f000001/", "https://127.1/",
    "https://0177.0.0.1/", "https://10.0.0.1/", "https://172.16.1.1/", "https://192.168.0.1/",
    "https://169.254.169.254/", "https://100.64.0.1/", "https://[::1]/", "https://[::ffff:127.0.0.1]/",
    "https://[0:0:0:0:0:ffff:7f00:1]/", "https://[fc00::1]/", "https://[fec0::1]/",
    "https://[64:ff9b::a00:1]/", "https://[2002:a00:1::]/", "https://localhost./",
    "https://service.localhost/", "https://service.internal/", "https://service.local/", "https://service/",
    "http://example.com/", "https://user:secret@example.com/", "https://example.com/#secret",
  ])("rejects unsafe destination %s before connecting", async (url) => {
    expect(isSafeTokConnectWebhookUrl(url)).toBe(false);
    await expect(postPublicWebhook(url, {}, "{}")).rejects.toThrow("unsafe_webhook_url");
    expect(connect).not.toHaveBeenCalled();
  });

  it("permits ordinary hostnames beginning with fc and public IPv6 literals", () => {
    expect(isSafeTokConnectWebhookUrl("https://fc-example.com/receive")).toBe(true);
    expect(isSafeTokConnectWebhookUrl("https://[2606:4700:4700::1111]/")).toBe(true);
  });

  it("pins the socket to the checked address and preserves Host, SNI, path and signature", async () => {
    const result = await postPublicWebhook("https://receiver.example.com:8443/hook?x=1", { "X-TOK-Signature": "test-signature" }, "{\"ok\":true}");
    expect(result).toEqual({ ok: true, status: 200, body: "ok", truncated: false });
    expect(connect).toHaveBeenCalledWith({ hostname: "93.184.216.34", port: 8443, transport: "tcp" });
    expect(startTls).toHaveBeenCalledWith(expect.anything(), { hostname: "receiver.example.com", alpnProtocols: ["http/1.1"] });
    expect(resolveDns).toHaveBeenCalledTimes(2);
    expect(writes.join("")).toContain("POST /hook?x=1 HTTP/1.1\r\n");
    expect(writes.join("")).toContain("host: receiver.example.com:8443\r\n");
    expect(writes.join("")).toContain("x-tok-signature: test-signature\r\n");
    expect(writes.join("")).toContain("content-length: 11\r\n");
    expect(closed).toBe(true);
  });

  it("refuses mixed public/private DNS responses including fully expanded mapped IPv6", async () => {
    resolveDns.mockImplementation(async (_host: string, type: string) => type === "A" ? ["93.184.216.34"] : ["0:0:0:0:0:ffff:7f00:1"]);
    await expect(postPublicWebhook("https://receiver.example.com/", {}, "{}")).rejects.toThrow("unsafe_webhook_url");
    expect(connect).not.toHaveBeenCalled();
  });

  it("never follows a redirect or reads its body", async () => {
    bytes = encoder.encode("HTTP/1.1 302 Found\r\nLocation: http://169.254.169.254/\r\nContent-Length: 99999\r\n\r\n");
    expect(await postPublicWebhook("https://receiver.example.com/", {}, "{}")).toEqual({ ok: false, status: 302, body: "", truncated: false });
    expect(connect).toHaveBeenCalledTimes(1);
    expect(closed).toBe(true);
  });

  it("keeps successful status while cancelling a 200 MB response after a 2000-byte diagnostic prefix", async () => {
    bytes = encoder.encode("HTTP/1.1 200 OK\r\nContent-Length: 200000000\r\n\r\n" + "x".repeat(4096));
    const result = await postPublicWebhook("https://receiver.example.com/", {}, "{}");
    expect(result).toEqual({ ok: true, status: 200, body: "x".repeat(2000), truncated: true });
    expect(closed).toBe(true);
  });

  it("bounds the actual POST body before DNS or network", async () => {
    await expect(postPublicWebhook("https://receiver.example.com/", {}, "x".repeat(256 * 1024 + 1))).rejects.toThrow("webhook_payload_too_large");
    expect(resolveDns).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });

  it("includes DNS in the deadline and never connects after a late answer", async () => {
    vi.useFakeTimers();
    let answer: (ips: string[]) => void = () => {};
    resolveDns.mockImplementation((_host: string, type: string) => type === "AAAA" ? Promise.resolve([]) : new Promise<string[]>((resolve) => { answer = resolve; }));
    const pending = expect(postPublicWebhook("https://receiver.example.com/", {}, "{}")).rejects.toThrow("request_timeout");
    await vi.advanceTimersByTimeAsync(10_001);
    await pending;
    answer(["93.184.216.34"]);
    await Promise.resolve();
    await Promise.resolve();
    expect(connect).not.toHaveBeenCalled();
  });

  it("sanitizes TLS/network errors without exposing destination or secrets", async () => {
    startTls.mockRejectedValue(new Error("bad certificate for sensitive-host:secret"));
    await expect(postPublicWebhook("https://receiver.example.com/", {}, "{}")).rejects.toThrow(/^webhook_request_failed$/);
    expect(closed).toBe(true);
  });
});
