import {
  isUnsafePublicHostname,
  type ResolvedPublicUrl,
} from "./public-url-validation.ts";

export type PinnedPublicHttpOptions = {
  method: "GET" | "HEAD" | "POST";
  headers?: HeadersInit;
  body?: Uint8Array;
  signal: AbortSignal;
  maxResponseBytes?: number;
};

const MAX_HEADER_BYTES = 16_384;
const MAX_REQUEST_BODY_BYTES = 256 * 1024;
const MAX_RESPONSE_BODY_BYTES = 18 * 1024 * 1024;
const MAX_CHUNK_FRAMING_BYTES = 256 * 1024;
const READ_BUFFER_BYTES = 16_384;
const HEADER_NAME = /^[!#$%&'*+\-.^_\x60|~0-9A-Za-z]+$/;

function abortError() { return new Error("request_timeout"); }

/** DNS itself may not be cancellable on older Deno, but a late result cannot dial. */
export function waitForPublicHttpSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(abortError());
    if (signal.aborted) {
      void promise.catch(() => {});
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => { signal.removeEventListener("abort", abort); resolve(value); },
      (error) => { signal.removeEventListener("abort", abort); reject(error); },
    );
  });
}

type Connection = Pick<Deno.Conn, "read" | "write" | "close">;

function closeConnection(connection: Connection | undefined) {
  try { connection?.close(); } catch { /* Already consumed by TLS or closed. */ }
}

/** Fixed-size buffering; neither a header nor a HTTP chunk can force an allocation. */
class HttpReader {
  private readonly buffer = new Uint8Array(READ_BUFFER_BYTES);
  private offset = 0;
  private length = 0;

  constructor(private readonly connection: Connection, private readonly signal: AbortSignal) {}

  private async fill() {
    if (this.signal.aborted) throw abortError();
    if (this.offset < this.length) return true;
    const length = await waitForPublicHttpSignal(this.connection.read(this.buffer), this.signal);
    if (length === null) return false;
    if (!Number.isInteger(length) || length <= 0 || length > this.buffer.byteLength) {
      throw new Error("invalid_http_read");
    }
    this.offset = 0;
    this.length = length;
    return true;
  }

  async line(limit: number) {
    let line = "";
    for (let length = 0; length < limit; length += 1) {
      if (!await this.fill()) throw new Error("truncated_http_response");
      const byte = this.buffer[this.offset++];
      if (byte === 10) {
        if (!line.endsWith("\r")) throw new Error("invalid_http_line");
        return { value: line.slice(0, -1), bytes: length + 1 };
      }
      line += String.fromCharCode(byte);
    }
    throw new Error("http_headers_too_large");
  }

  async take(maxBytes: number) {
    if (!await this.fill()) return null;
    const end = Math.min(this.length, this.offset + maxBytes);
    const chunk = this.buffer.slice(this.offset, end);
    this.offset = end;
    return chunk;
  }

  async crlf() {
    for (const expected of [13, 10]) {
      const byte = await this.take(1);
      if (!byte || byte[0] !== expected) throw new Error("invalid_http_chunk");
    }
  }
}

function parseHeaderLine(line: string): [string, string] {
  const separator = line.indexOf(":");
  const name = line.slice(0, separator);
  const rawValue = line.slice(separator + 1);
  const value = rawValue.replace(/^[\t ]+|[\t ]+$/g, "");
  // No obsolete folding, whitespace before the colon, CR/LF or control bytes.
  // eslint-disable-next-line no-control-regex -- HTTP field values must reject control bytes.
  if (separator < 1 || !HEADER_NAME.test(name) || /[\x00-\x08\x0a-\x1f\x7f]/.test(rawValue)) {
    throw new Error("invalid_http_header");
  }
  return [name.toLowerCase(), value];
}

async function readHeaders(reader: HttpReader) {
  let totalBytes = 0;
  for (let informational = 0; informational <= 4; informational += 1) {
    const statusLine = await reader.line(MAX_HEADER_BYTES - totalBytes);
    totalBytes += statusLine.bytes;
    const match = /^HTTP\/1\.[01] ([1-5][0-9]{2})(?: ([\t\x20-\x7e\x80-\xff]*))?$/.exec(statusLine.value);
    if (!match) throw new Error("invalid_http_status");
    const status = Number(match[1]);
    const headers = new Headers();
    while (true) {
      const line = await reader.line(MAX_HEADER_BYTES - totalBytes);
      totalBytes += line.bytes;
      if (line.value === "") break;
      const [name, value] = parseHeaderLine(line.value);
      if ((name === "content-length" || name === "transfer-encoding") && headers.has(name)) {
        throw new Error("ambiguous_http_framing");
      }
      headers.append(name, value);
    }
    if (status === 101) throw new Error("unsupported_http_upgrade");
    if (status < 200) continue;
    const transfer = headers.get("transfer-encoding");
    const length = headers.get("content-length");
    if (transfer !== null && length !== null) throw new Error("ambiguous_http_framing");
    if (transfer !== null && transfer.toLowerCase() !== "chunked") throw new Error("unsupported_http_transfer");
    if (length !== null && (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)))) {
      throw new Error("invalid_http_content_length");
    }
    const encoding = headers.get("content-encoding");
    if (encoding && encoding.toLowerCase() !== "identity") throw new Error("unsupported_http_content_encoding");
    return { status, statusText: match[2] || "", headers, length: length === null ? null : Number(length), chunked: transfer !== null };
  }
  throw new Error("too_many_http_informational_responses");
}

function requestBytes(url: URL, options: PinnedPublicHttpOptions) {
  if (!["GET", "HEAD", "POST"].includes(options.method)) throw new Error("unsafe_method");
  const body = options.body;
  if ((options.method !== "POST" && body !== undefined) || (body && body.byteLength > MAX_REQUEST_BODY_BYTES)) {
    throw new Error("unsafe_request_body");
  }
  const headers = new Headers(options.headers);
  // The caller cannot change routing, inject another message or negotiate a
  // compressed response that bypasses the consumer's byte budget.
  for (const name of ["host", "connection", "content-length", "transfer-encoding", "trailer", "upgrade", "expect", "proxy-authorization", "proxy-connection"]) {
    headers.delete(name);
  }
  headers.set("host", url.host);
  headers.set("connection", "close");
  headers.set("accept-encoding", "identity");
  if (options.method === "POST") headers.set("content-length", String(body?.byteLength || 0));
  let head = options.method + " " + (url.pathname || "/") + url.search + " HTTP/1.1\r\n";
  for (const [name, value] of headers) {
    // eslint-disable-next-line no-control-regex -- Emit ASCII HTTP fields with no control bytes.
    if (!HEADER_NAME.test(name) || /[\x00-\x1f\x7f-\uffff]/.test(value)) throw new Error("invalid_request_header");
    head += name + ": " + value + "\r\n";
  }
  const encoded = new TextEncoder().encode(head + "\r\n");
  if (encoded.byteLength > MAX_HEADER_BYTES) throw new Error("http_request_headers_too_large");
  return { head: encoded, body };
}

/**
 * One HTTP/1.1 exchange on one already validated IP. Never uses native fetch or
 * node:http (Deno 2.1.4 rejects its lookup option). TLS consumes that same TCP
 * connection and verifies the ORIGINAL hostname with the runtime's normal CAs.
 * Redirects remain ordinary responses. The caller owns one deadline that also
 * covers DNS; cancellation, failure, EOF and a complete body close the socket.
 */
export async function requestPinnedPublicHttp(
  target: ResolvedPublicUrl,
  options: PinnedPublicHttpOptions,
): Promise<Response> {
  const url = new URL(target.url);
  const address = target.addresses[0];
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("unsafe_protocol");
  if (url.username || url.password) throw new Error("unsafe_credentials");
  if (isUnsafePublicHostname(host) || !address
    || !/^(?:[0-9]{1,3}(?:\.[0-9]{1,3}){3}|[0-9a-fA-F:]+)$/.test(address.address)
    || isUnsafePublicHostname(address.address)) throw new Error("unsafe_or_private_host");
  if (options.signal.aborted) throw abortError();
  const maxResponseBytes = options.maxResponseBytes ?? MAX_RESPONSE_BODY_BYTES;
  if (!Number.isSafeInteger(maxResponseBytes) || maxResponseBytes < 1 || maxResponseBytes > MAX_RESPONSE_BODY_BYTES) {
    throw new Error("invalid_response_byte_limit");
  }
  const outgoing = requestBytes(url, options);
  let connection: Connection | undefined;
  let closed = false;
  let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
  const close = () => {
    if (closed) return;
    closed = true;
    options.signal.removeEventListener("abort", abort);
    closeConnection(connection);
  };
  const abort = () => {
    close();
    streamController?.error(abortError());
  };
  options.signal.addEventListener("abort", abort, { once: true });
  try {
    const tcp = await waitForPublicHttpSignal(Deno.connect({
      hostname: address.address,
      port: Number(url.port || (url.protocol === "https:" ? 443 : 80)),
      transport: "tcp",
    }).then((socket) => {
      // Deno 2.1.4 connect cannot be aborted. Close a late connection without
      // ever writing to it, even if the request timed out during the dial.
      if (options.signal.aborted || closed) { closeConnection(socket); throw abortError(); }
      connection = socket;
      return socket;
    }), options.signal);
    if (url.protocol === "https:") {
      const tls = await waitForPublicHttpSignal(Deno.startTls(tcp, {
        hostname: host,
        alpnProtocols: ["http/1.1"],
      }).then((socket) => {
        if (options.signal.aborted || closed) { closeConnection(socket); throw abortError(); }
        connection = socket;
        return socket;
      }), options.signal);
      const handshake = await waitForPublicHttpSignal(tls.handshake(), options.signal);
      if (handshake.alpnProtocol && handshake.alpnProtocol !== "http/1.1") throw new Error("unsupported_http_protocol");
    }
    const activeConnection = connection!;
    for (const bytes of [outgoing.head, outgoing.body]) {
      if (!bytes) continue;
      let offset = 0;
      while (offset < bytes.byteLength) {
        if (options.signal.aborted) throw abortError();
        const written = await waitForPublicHttpSignal(activeConnection.write(bytes.subarray(offset)), options.signal);
        if (!Number.isInteger(written) || written <= 0 || written > bytes.byteLength - offset) throw new Error("invalid_http_write");
        offset += written;
      }
    }
    const reader = new HttpReader(activeConnection, options.signal);
    const parsed = await readHeaders(reader);
    const headers = new Headers(parsed.headers);
    for (const name of ["connection", "keep-alive", "transfer-encoding", "trailer", "upgrade", "proxy-authenticate", "proxy-authorization"]) {
      headers.delete(name);
    }
    if (options.method === "HEAD" || [204, 205, 304].includes(parsed.status) || parsed.length === 0) {
      close();
      return new Response(null, { status: parsed.status, statusText: parsed.statusText, headers });
    }
    // A prefix consumer (webhooks) may cancel after 2KiB even when a server
    // announces a larger body. Image consumers reject the advertised length
    // themselves. The actual streamed-byte cap below always applies.
    let remaining = parsed.length;
    let chunkRemaining = 0;
    let needsChunkCrlf = false;
    let totalBytes = 0;
    let framingBytes = 0;
    const body = new ReadableStream<Uint8Array>({
      start(controller) { streamController = controller; },
      async pull(controller) {
        try {
          if (options.signal.aborted) throw abortError();
          if (parsed.chunked && chunkRemaining === 0) {
            if (needsChunkCrlf) { await reader.crlf(); framingBytes += 2; }
            const chunkLine = await reader.line(1024);
            framingBytes += chunkLine.bytes;
            if (framingBytes > MAX_CHUNK_FRAMING_BYTES) throw new Error("http_chunk_framing_too_large");
            const chunkMatch = /^([0-9a-fA-F]{1,16})(?:;[\t\x20-\x7e]*)?$/.exec(chunkLine.value);
            if (!chunkMatch) throw new Error("invalid_http_chunk");
            chunkRemaining = Number.parseInt(chunkMatch[1], 16);
            if (!Number.isSafeInteger(chunkRemaining)) {
              throw new Error("http_response_body_too_large");
            }
            needsChunkCrlf = true;
            if (chunkRemaining === 0) {
              let trailerBytes = 0;
              while (true) {
                const line = await reader.line(MAX_HEADER_BYTES - trailerBytes);
                trailerBytes += line.bytes;
                if (line.value === "") break;
                const [name] = parseHeaderLine(line.value);
                if (["content-length", "transfer-encoding", "host"].includes(name)) throw new Error("ambiguous_http_framing");
              }
              close(); controller.close(); return;
            }
          }
          const chunk = await reader.take(Math.min(READ_BUFFER_BYTES, parsed.chunked ? chunkRemaining : remaining ?? READ_BUFFER_BYTES));
          if (chunk === null) {
            if (parsed.chunked || (remaining !== null && remaining > 0)) throw new Error("truncated_http_response");
            close(); controller.close(); return;
          }
          totalBytes += chunk.byteLength;
          if (totalBytes > maxResponseBytes) throw new Error("http_response_body_too_large");
          if (parsed.chunked) chunkRemaining -= chunk.byteLength;
          if (remaining !== null) remaining -= chunk.byteLength;
          controller.enqueue(chunk);
          if (remaining === 0) { close(); controller.close(); }
        } catch (error) {
          close();
          controller.error(error);
        }
      },
      cancel() { close(); },
    }, { highWaterMark: 0 });
    return new Response(body, { status: parsed.status, statusText: parsed.statusText, headers });
  } catch (error) {
    close();
    throw options.signal.aborted ? abortError() : error;
  }
}
