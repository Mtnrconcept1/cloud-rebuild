import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestPinnedPublicHttp } from "../../supabase/functions/_shared/pinned-public-http";
import { fetchPublicUrl } from "../../supabase/functions/_shared/safe-public-fetch";

const encode = (text: string) => new TextEncoder().encode(text);
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

class FakeConnection {
  closed = false;
  partialWrite = 0;
  stallWhenEmpty = false;
  chunks: Uint8Array[];
  written: Uint8Array[] = [];
  private pendingReads: Array<(error: Error) => void> = [];

  constructor(wire: string | Uint8Array[]) {
    this.chunks = typeof wire === "string" ? [encode(wire)] : [...wire];
  }

  read = vi.fn(async (buffer: Uint8Array): Promise<number | null> => {
    if (this.closed) throw new Error("connection closed");
    const chunk = this.chunks[0];
    if (!chunk) {
      if (this.stallWhenEmpty) return new Promise((_, reject) => { this.pendingReads.push(reject); });
      return null;
    }
    const length = Math.min(buffer.byteLength, chunk.byteLength);
    buffer.set(chunk.subarray(0, length));
    if (length === chunk.byteLength) this.chunks.shift();
    else this.chunks[0] = chunk.subarray(length);
    return length;
  });

  write = vi.fn(async (bytes: Uint8Array) => {
    if (this.closed) throw new Error("connection closed");
    const length = this.partialWrite ? Math.min(bytes.byteLength, this.partialWrite) : bytes.byteLength;
    this.written.push(bytes.slice(0, length));
    return length;
  });

  close = vi.fn(() => {
    this.closed = true;
    for (const reject of this.pendingReads.splice(0)) reject(new Error("connection closed"));
  });

  handshake = vi.fn(async () => ({ alpnProtocol: "http/1.1" }));

  get requestText() { return this.written.map(decode).join(""); }
}

const dns = vi.fn(async (_host: string, type: string) => type === "A" ? ["93.184.216.34"] : []);
const connect = vi.fn<(_options: { hostname: string; port: number; transport: string }) => Promise<FakeConnection>>();
const startTls = vi.fn(async (connection: FakeConnection, _options: { hostname: string; alpnProtocols: string[] }) => connection);
const forbiddenFetch = vi.fn(async () => { throw new Error("native fetch must never be used"); });
const target = (url = "https://images.example/plate.png?version=1") => ({
  url: new URL(url),
  addresses: [{ address: "93.184.216.34", family: 4 as const }],
});
const requestOptions = () => ({ method: "GET" as const, signal: new AbortController().signal });
const ok = (body = "image") => "HTTP/1.1 200 OK\r\nContent-Type: image/png\r\nContent-Length: " + encode(body).byteLength + "\r\n\r\n" + body;

beforeEach(() => {
  dns.mockReset().mockImplementation(async (_host, type) => type === "A" ? ["93.184.216.34"] : []);
  connect.mockReset();
  startTls.mockReset().mockImplementation(async (connection) => connection);
  forbiddenFetch.mockClear();
  vi.stubGlobal("Deno", { resolveDns: dns, connect, startTls });
  vi.stubGlobal("fetch", forbiddenFetch);
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("pinned public HTTP transport", () => {
  it("connects only to the checked IP, verifies the original TLS name and preserves HTTP Host", async () => {
    const socket = new FakeConnection(ok());
    socket.partialWrite = 7;
    connect.mockResolvedValue(socket);
    const response = await requestPinnedPublicHttp(target(), requestOptions());
    expect(await response.text()).toBe("image");
    expect(connect).toHaveBeenCalledExactlyOnceWith({ hostname: "93.184.216.34", port: 443, transport: "tcp" });
    expect(startTls).toHaveBeenCalledExactlyOnceWith(socket, { hostname: "images.example", alpnProtocols: ["http/1.1"] });
    expect(socket.handshake).toHaveBeenCalledTimes(1);
    expect(socket.requestText).toContain("GET /plate.png?version=1 HTTP/1.1\r\n");
    expect(socket.requestText).toContain("\r\nhost: images.example\r\n");
    expect(socket.requestText).toContain("\r\nconnection: close\r\n");
    expect(socket.requestText).toContain("\r\naccept-encoding: identity\r\n");
    expect(socket.close).toHaveBeenCalledTimes(1);
    expect(forbiddenFetch).not.toHaveBeenCalled();
  });

  it("pins public IPv6 and keeps a nondefault port in the Host header", async () => {
    const socket = new FakeConnection(ok());
    connect.mockResolvedValue(socket);
    const response = await requestPinnedPublicHttp({
      url: new URL("https://[2606:4700:4700::1111]:8443/image"),
      addresses: [{ address: "2606:4700:4700::1111", family: 6 }],
    }, requestOptions());
    await response.body!.cancel();
    expect(connect.mock.calls[0][0]).toEqual({ hostname: "2606:4700:4700::1111", port: 8443, transport: "tcp" });
    expect(startTls.mock.calls[0][1].hostname).toBe("2606:4700:4700::1111");
    expect(socket.requestText).toContain("host: [2606:4700:4700::1111]:8443\r\n");
  });

  it("forces one exact POST length and routing, including when caller headers attempt overrides", async () => {
    const socket = new FakeConnection("HTTP/1.1 204 No Content\r\n\r\n");
    connect.mockResolvedValue(socket);
    const body = encode("événement");
    const response = await requestPinnedPublicHttp(target("https://partner.example:9443/hook"), {
      method: "POST", body, signal: requestOptions().signal,
      headers: { Host: "internal.invalid", "Content-Length": "999999", "Transfer-Encoding": "chunked",
        "Accept-Encoding": "gzip", "X-TOK-Signature": "synthetic-signature", "Proxy-Authorization": "private" },
    });
    expect(response.status).toBe(204);
    expect(socket.requestText).toContain("POST /hook HTTP/1.1\r\n");
    expect(socket.requestText).toContain("host: partner.example:9443\r\n");
    expect(socket.requestText).toContain("content-length: " + body.byteLength + "\r\n");
    expect(socket.requestText).toContain("x-tok-signature: synthetic-signature\r\n");
    expect(socket.requestText.endsWith("\r\n\r\névénement")).toBe(true);
    expect(socket.requestText).not.toMatch(/internal|999999|chunked|gzip|proxy-authorization/i);
  });

  it("does not write HTTP bytes before a valid TLS handshake", async () => {
    const socket = new FakeConnection(ok());
    socket.handshake.mockRejectedValue(new Error("certificate hostname mismatch"));
    connect.mockResolvedValue(socket);
    await expect(requestPinnedPublicHttp(target(), requestOptions())).rejects.toThrow("certificate hostname mismatch");
    expect(socket.write).not.toHaveBeenCalled();
    expect(socket.close).toHaveBeenCalledTimes(1);
  });

  it("does not follow redirects itself or consume their bodies", async () => {
    const socket = new FakeConnection("HTTP/1.1 307 Temporary Redirect\r\nLocation: http://127.0.0.1/private\r\nContent-Length: 100\r\n\r\n");
    socket.stallWhenEmpty = true;
    connect.mockResolvedValue(socket);
    const response = await requestPinnedPublicHttp(target(), requestOptions());
    expect(response.status).toBe(307);
    expect(connect).toHaveBeenCalledTimes(1);
    await response.body!.cancel();
    expect(socket.closed).toBe(true);
  });

  it("streams without reading ahead beyond one 16KiB buffer and cancels the connection", async () => {
    const socket = new FakeConnection([
      encode("HTTP/1.1 200 OK\r\nContent-Length: 100000\r\n\r\n"), new Uint8Array(100000),
    ]);
    connect.mockResolvedValue(socket);
    const response = await requestPinnedPublicHttp(target(), requestOptions());
    expect(socket.read).toHaveBeenCalledTimes(1);
    const reader = response.body!.getReader();
    expect((await reader.read()).value!.byteLength).toBe(16384);
    expect(socket.read).toHaveBeenCalledTimes(2);
    await reader.cancel();
    expect(socket.close).toHaveBeenCalledTimes(1);
  });

  it("decodes chunked framing correctly across byte boundaries and bounds trailers", async () => {
    const wire = "HTTP/1.1 100 Continue\r\n\r\nHTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n"
      + "3;example=value\r\nabc\r\n2\r\nde\r\n0\r\nX-End: yes\r\n\r\n";
    const socket = new FakeConnection([...encode(wire)].map((byte) => new Uint8Array([byte])));
    connect.mockResolvedValue(socket);
    const response = await requestPinnedPublicHttp(target(), requestOptions());
    expect(await response.text()).toBe("abcde");
    expect(response.headers.has("transfer-encoding")).toBe(false);
    expect(socket.close).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["Content-Length: 1\r\nTransfer-Encoding: chunked", "ambiguous_http_framing"],
    ["Content-Length: 1\r\nContent-Length: 1", "ambiguous_http_framing"],
    ["Transfer-Encoding: chunked\r\nTransfer-Encoding: chunked", "ambiguous_http_framing"],
    ["Transfer-Encoding: gzip, chunked", "unsupported_http_transfer"],
    ["Content-Length: -1", "invalid_http_content_length"],
    ["Content-Length: 9007199254740992", "invalid_http_content_length"],
    ["Content-Encoding: gzip", "unsupported_http_content_encoding"],
    ["Content-Encoding: br", "unsupported_http_content_encoding"],
    ["Fold: one\r\n two", "invalid_http_header"],
    ["Name : value", "invalid_http_header"],
    ["Name: \rvalue", "invalid_http_header"],
    ["Huge: " + "a".repeat(17000), "http_headers_too_large"],
  ])("rejects ambiguous or unsafe headers: %s", async (headers, code) => {
    const socket = new FakeConnection("HTTP/1.1 200 OK\r\n" + headers + "\r\n\r\nbody");
    connect.mockResolvedValue(socket);
    await expect(requestPinnedPublicHttp(target(), requestOptions())).rejects.toThrow(code);
    expect(socket.closed).toBe(true);
  });

  it.each([
    ["HTTP/1.1 101 Switching Protocols\r\n\r\n", "unsupported_http_upgrade"],
    ["HTTP/2 200 OK\r\n\r\n", "invalid_http_status"],
    ["HTTP/1.1 200 OK\n\n", "invalid_http_line"],
    ["HTTP/1.1 200 OK\r\nContent-Len", "truncated_http_response"],
  ])("rejects invalid protocol headers before returning a response", async (wire, code) => {
    const socket = new FakeConnection(wire);
    connect.mockResolvedValue(socket);
    await expect(requestPinnedPublicHttp(target(), requestOptions())).rejects.toThrow(code);
    expect(socket.closed).toBe(true);
  });

  it.each([
    ["Content-Length: 5", "ab", "truncated_http_response"],
    ["Transfer-Encoding: chunked", "5\r\nab", "truncated_http_response"],
    ["Transfer-Encoding: chunked", "1\r\naXY0\r\n\r\n", "invalid_http_chunk"],
    ["Transfer-Encoding: chunked", "g\r\n", "invalid_http_chunk"],
    ["Transfer-Encoding: chunked", "0\r\nContent-Length: 0\r\n\r\n", "ambiguous_http_framing"],
    ["Transfer-Encoding: chunked", "0\r\nX-Trailer: " + "a".repeat(17000), "http_headers_too_large"],
  ])("rejects incomplete bodies or malformed chunk framing", async (headers, body, code) => {
    const socket = new FakeConnection("HTTP/1.1 200 OK\r\n" + headers + "\r\n\r\n" + body);
    connect.mockResolvedValue(socket);
    const response = await requestPinnedPublicHttp(target(), requestOptions());
    await expect(response.text()).rejects.toThrow(code);
    expect(socket.closed).toBe(true);
  });

  it("accepts connection-close framing within the streaming byte budget", async () => {
    const socket = new FakeConnection("HTTP/1.0 200 OK\r\n\r\nabc");
    connect.mockResolvedValue(socket);
    const response = await requestPinnedPublicHttp(target(), { ...requestOptions(), maxResponseBytes: 3 });
    expect(await response.text()).toBe("abc");
    expect(socket.closed).toBe(true);
  });

  it.each(["Transfer-Encoding: chunked\r\n\r\n4\r\nabcd\r\n0\r\n\r\n", "\r\nabcd"])(
    "enforces actual body size without trusting Content-Length", async (body) => {
      const socket = new FakeConnection("HTTP/1.1 200 OK\r\n" + body);
      connect.mockResolvedValue(socket);
      const response = await requestPinnedPublicHttp(target(), { ...requestOptions(), maxResponseBytes: 3 });
      await expect(response.text()).rejects.toThrow("http_response_body_too_large");
      expect(socket.closed).toBe(true);
    },
  );

  it("enforces actual bytes even when a response length is announced", async () => {
    const socket = new FakeConnection("HTTP/1.1 200 OK\r\nContent-Length: 4\r\n\r\nabcd");
    connect.mockResolvedValue(socket);
    const response = await requestPinnedPublicHttp(target(), { ...requestOptions(), maxResponseBytes: 3 });
    await expect(response.text()).rejects.toThrow("http_response_body_too_large");
    expect(socket.closed).toBe(true);
  });

  it.each(["Content-Length: 200000000\r\n\r\n", "Transfer-Encoding: chunked\r\n\r\nbebc200\r\n"])(
    "lets a webhook consume only a bounded prefix of an enormous declared response", async (headers) => {
      const socket = new FakeConnection("HTTP/1.1 200 OK\r\n" + headers + "prefix");
      socket.stallWhenEmpty = true;
      connect.mockResolvedValue(socket);
      const response = await requestPinnedPublicHttp(target(), requestOptions());
      const reader = response.body!.getReader();
      expect(decode((await reader.read()).value!)).toBe("prefix");
      await reader.cancel();
      expect(socket.closed).toBe(true);
    },
  );

  it("bounds total chunk framing even when tiny bodies have repeated long extensions", async () => {
    const socket = new FakeConnection("HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n"
      + ("1;" + "x".repeat(1000) + "\r\na\r\n").repeat(270) + "0\r\n\r\n");
    connect.mockResolvedValue(socket);
    const response = await requestPinnedPublicHttp(target(), requestOptions());
    await expect(response.text()).rejects.toThrow("http_chunk_framing_too_large");
    expect(socket.closed).toBe(true);
  });

  it.each(["HEAD", "GET"] as const)("closes responses that cannot have a body", async (method) => {
    const socket = new FakeConnection(method === "HEAD" ? "HTTP/1.1 200 OK\r\nContent-Length: 999999999\r\n\r\n" : "HTTP/1.1 204 No Content\r\n\r\n");
    socket.stallWhenEmpty = true;
    connect.mockResolvedValue(socket);
    const response = await requestPinnedPublicHttp(target(), { ...requestOptions(), method });
    expect(response.body).toBeNull();
    expect(socket.closed).toBe(true);
  });

  it("rejects methods, oversized requests and unvalidated addresses before opening a socket", async () => {
    await expect(requestPinnedPublicHttp(target(), { ...requestOptions(), method: "PUT" as "GET" })).rejects.toThrow("unsafe_method");
    await expect(requestPinnedPublicHttp(target(), { ...requestOptions(), body: encode("body") })).rejects.toThrow("unsafe_request_body");
    await expect(requestPinnedPublicHttp(target(), { ...requestOptions(), method: "POST", body: new Uint8Array(256 * 1024 + 1) })).rejects.toThrow("unsafe_request_body");
    await expect(requestPinnedPublicHttp(target(), { ...requestOptions(), headers: { "X-Huge": "a".repeat(17000) } })).rejects.toThrow("http_request_headers_too_large");
    await expect(requestPinnedPublicHttp({ ...target(), addresses: [{ address: "127.0.0.1", family: 4 }] }, requestOptions())).rejects.toThrow("unsafe_or_private_host");
    await expect(requestPinnedPublicHttp({ ...target(), addresses: [{ address: "attacker.example", family: 4 }] }, requestOptions())).rejects.toThrow("unsafe_or_private_host");
    expect(connect).not.toHaveBeenCalled();
  });

  it("closes a TCP connection that arrives after the deadline without ever starting TLS or sending bytes", async () => {
    const controller = new AbortController();
    let finishDial!: (connection: FakeConnection) => void;
    connect.mockImplementation(() => new Promise((resolve) => { finishDial = resolve; }));
    const result = expect(requestPinnedPublicHttp(target(), { ...requestOptions(), signal: controller.signal })).rejects.toThrow("request_timeout");
    controller.abort();
    await result;
    const socket = new FakeConnection(ok());
    finishDial(socket);
    await Promise.resolve();
    expect(socket.closed).toBe(true);
    expect(startTls).not.toHaveBeenCalled();
    expect(socket.write).not.toHaveBeenCalled();
  });

  it.each(["handshake", "write", "headers"] as const)("closes a stalled %s at the deadline", async (phase) => {
    const socket = new FakeConnection(ok());
    let arrived!: () => void;
    const ready = new Promise<void>((resolve) => { arrived = resolve; });
    const stall = () => { arrived(); return new Promise<never>(() => {}); };
    if (phase === "handshake") socket.handshake.mockImplementation(stall);
    if (phase === "write") socket.write.mockImplementation(stall);
    if (phase === "headers") socket.read.mockImplementation(stall);
    connect.mockResolvedValue(socket);
    const controller = new AbortController();
    const result = expect(requestPinnedPublicHttp(target(), { ...requestOptions(), signal: controller.signal })).rejects.toThrow("request_timeout");
    await ready;
    controller.abort();
    await result;
    expect(socket.closed).toBe(true);
    if (phase === "handshake") expect(socket.write).not.toHaveBeenCalled();
  });
});

describe("safe public image redirects and deadlines", () => {
  it("cannot re-resolve the hostname between the checked DNS answer and the socket", async () => {
    const socket = new FakeConnection(ok());
    connect.mockImplementation(async () => { dns.mockResolvedValue(["127.0.0.1"]); return socket; });
    const response = await fetchPublicUrl("https://images.example/picture");
    expect(await response.text()).toBe("image");
    expect(dns).toHaveBeenCalledTimes(2);
    expect(connect.mock.calls[0][0].hostname).toBe("93.184.216.34");
    expect(forbiddenFetch).not.toHaveBeenCalled();
  });

  it("validates and pins each redirect before opening another connection, preserving only public image headers", async () => {
    const first = new FakeConnection("HTTP/1.1 302 Found\r\nLocation: https://cdn.example/image\r\nContent-Length: 100\r\n\r\n");
    const second = new FakeConnection(ok());
    connect.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    dns.mockImplementation(async (host, kind) => kind === "A" ? [host === "cdn.example" ? "1.1.1.1" : "93.184.216.34"] : []);
    const response = await fetchPublicUrl("https://images.example/picture", { init: { headers: { Accept: "image/*" } } });
    expect(await response.text()).toBe("image");
    expect(first.closed).toBe(true);
    expect(connect.mock.calls.map(([options]) => options.hostname)).toEqual(["93.184.216.34", "1.1.1.1"]);
    expect(startTls.mock.calls.map(([, options]) => options.hostname)).toEqual(["images.example", "cdn.example"]);
    expect(second.requestText).toContain("accept: image/*\r\n");
    expect(second.requestText).not.toMatch(/authorization|cookie|referer/i);
  });

  it.each(["https://127.0.0.1/private", "https://metadata.internal/secret", "https://rebind.example/image"])(
    "blocks unsafe redirects without connecting to their target: %s", async (location) => {
      const socket = new FakeConnection("HTTP/1.1 302 Found\r\nLocation: " + location + "\r\nContent-Length: 0\r\n\r\n");
      connect.mockResolvedValue(socket);
      dns.mockImplementation(async (host, kind) => kind === "A" ? [host === "rebind.example" ? "127.0.0.1" : "93.184.216.34"] : []);
      await expect(fetchPublicUrl("https://images.example/picture")).rejects.toThrow("unsafe_or_private_host");
      expect(connect).toHaveBeenCalledTimes(1);
      expect(socket.closed).toBe(true);
    },
  );

  it("blocks TLS downgrade redirects and excess redirects", async () => {
    const downgrade = new FakeConnection("HTTP/1.1 302 Found\r\nLocation: http://cdn.example/image\r\nContent-Length: 0\r\n\r\n");
    connect.mockResolvedValueOnce(downgrade);
    await expect(fetchPublicUrl("https://images.example/picture")).rejects.toThrow("unsafe_redirect_protocol");
    const excessive = new FakeConnection("HTTP/1.1 302 Found\r\nLocation: https://cdn.example/image\r\nContent-Length: 0\r\n\r\n");
    connect.mockResolvedValueOnce(excessive);
    await expect(fetchPublicUrl("https://images.example/picture", { maxRedirects: 0 })).rejects.toThrow("redirect_limit");
    expect(connect).toHaveBeenCalledTimes(2);
  });

  it("rejects credentials and mutations before DNS resolution", async () => {
    for (const init of [
      { headers: { Authorization: "Bearer private" } },
      { headers: { Cookie: "private" } },
      { headers: { "X-Api-Key": "private" } },
      { credentials: "include" as const },
      { method: "POST" },
      { body: "private" },
    ]) await expect(fetchPublicUrl("https://images.example/picture", { init })).rejects.toThrow(/unsafe_/);
    expect(dns).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });

  it("applies the same deadline to DNS and never dials after a late DNS result", async () => {
    vi.useFakeTimers();
    let finishDns!: (addresses: string[]) => void;
    const pending = new Promise<string[]>((resolve) => { finishDns = resolve; });
    dns.mockReturnValue(pending);
    const result = expect(fetchPublicUrl("https://images.example/picture", { timeoutMs: 1000 })).rejects.toThrow("request_timeout");
    await vi.advanceTimersByTimeAsync(1000);
    await result;
    finishDns(["93.184.216.34"]);
    await Promise.resolve();
    expect(connect).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps the deadline after headers, closes a stalled body and clears its timer", async () => {
    vi.useFakeTimers();
    const socket = new FakeConnection("HTTP/1.1 200 OK\r\nContent-Length: 100\r\n\r\n");
    socket.stallWhenEmpty = true;
    connect.mockResolvedValue(socket);
    const response = await fetchPublicUrl("https://images.example/picture", { timeoutMs: 1000 });
    const result = expect(response.text()).rejects.toThrow("request_timeout");
    await vi.advanceTimersByTimeAsync(1000);
    await result;
    expect(socket.closed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("honors caller cancellation and does not retain the deadline after normal completion", async () => {
    vi.useFakeTimers();
    const socket = new FakeConnection("HTTP/1.1 200 OK\r\nContent-Length: 100\r\n\r\n");
    socket.stallWhenEmpty = true;
    connect.mockResolvedValueOnce(socket);
    const controller = new AbortController();
    const response = await fetchPublicUrl("https://images.example/picture", { init: { signal: controller.signal } });
    const result = expect(response.text()).rejects.toThrow("request_timeout");
    controller.abort();
    await result;
    expect(socket.closed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    connect.mockResolvedValueOnce(new FakeConnection(ok()));
    expect(await (await fetchPublicUrl("https://images.example/picture")).text()).toBe("image");
    expect(vi.getTimerCount()).toBe(0);
  });
});
