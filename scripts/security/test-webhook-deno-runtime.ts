import { postPublicWebhook } from "../../supabase/functions/_shared/tok-connect-webhook-http.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

type Observation = { connects: number; dns: string[]; requests: { method: string; host: string | null; body: string; signature: string | null }[] };

async function withLocalTls(
  hostname: string,
  trusted: boolean,
  run: (url: string, observed: Observation) => Promise<void>,
) {
  const prefix = trusted ? "TOK_WEBHOOK_TLS" : "TOK_WEBHOOK_UNTRUSTED_TLS";
  const certPath = Deno.env.get(prefix + "_CERT");
  const keyPath = Deno.env.get(prefix + "_KEY");
  assert(certPath && keyPath, "Run via scripts/security/run-webhook-deno-runtime.mjs to create disposable TLS fixtures");
  const cert = await Deno.readTextFile(certPath);
  const key = await Deno.readTextFile(keyPath);
  const observed: Observation = { connects: 0, dns: [], requests: [] };
  const server = Deno.serve({ hostname: "127.0.0.1", port: 0, cert, key, onListen() {} }, async (req) => {
    observed.requests.push({ method: req.method, host: req.headers.get("host"), body: await req.text(), signature: req.headers.get("x-tok-signature") });
    return new Response("accepted", { headers: { "content-type": "text/plain" } });
  });
  const port = server.addr.port;
  const originalConnect = Deno.connect;
  const dnsDescriptor = Object.getOwnPropertyDescriptor(Deno, "resolveDns")!;
  const connectDescriptor = Object.getOwnPropertyDescriptor(Deno, "connect")!;
  // Only DNS and the TCP route are replaced. TCP is loopback-only; the real
  // Deno.startTls, handshake, trust store, hostname check and HTTP I/O run.
  Object.defineProperty(Deno, "resolveDns", { ...dnsDescriptor, value: async (host: string, type: string) => {
    assert(host === hostname, "unexpected DNS destination");
    observed.dns.push(type);
    return type === "A" ? ["93.184.216.34"] : [];
  } });
  Object.defineProperty(Deno, "connect", { ...connectDescriptor, value: (options: Deno.ConnectOptions) => {
    assert(options.hostname === "93.184.216.34" && options.port === port, "socket must receive the already checked public IP");
    observed.connects += 1;
    return originalConnect({ hostname: "127.0.0.1", port, transport: "tcp" });
  } });
  try {
    await run("https://" + hostname + ":" + port + "/hook?fixture=1", observed);
  } finally {
    Object.defineProperty(Deno, "resolveDns", dnsDescriptor);
    Object.defineProperty(Deno, "connect", connectDescriptor);
    await server.shutdown();
  }
}

Deno.test("webhook POST uses the pinned TCP connection and validates TLS for the original hostname", async () => {
  await withLocalTls("webhook-runtime.test", true, async (url, observed) => {
    const result = await postPublicWebhook(url, { "X-TOK-Signature": "fixture-signature" }, "{\"fixture\":true}");
    assert(result.ok && result.status === 200 && result.body === "accepted", "the authenticated TLS request must succeed");
    assert(observed.connects === 1 && observed.dns.length === 2, "one pinned connection and no second DNS resolution");
    assert(observed.requests.length === 1, "exactly one HTTP request");
    const request = observed.requests[0];
    assert(request.method === "POST" && request.body === "{\"fixture\":true}", "POST body round trip");
    assert(request.host === new URL(url).host && request.signature === "fixture-signature", "original Host and signature retained");
  });
});

Deno.test("webhook TLS refuses a trusted certificate for the wrong hostname before sending HTTP", async () => {
  await withLocalTls("wrong-webhook-runtime.test", true, async (url, observed) => {
    let rejected = false;
    try { await postPublicWebhook(url, {}, "{}"); } catch (error) {
      rejected = error instanceof Error && error.message === "webhook_request_failed";
    }
    assert(rejected, "hostname mismatch must be rejected");
    assert(observed.connects === 1 && observed.requests.length === 0, "TLS must reject before any POST is sent");
  });
});

Deno.test("webhook TLS refuses an untrusted certificate with the correct hostname", async () => {
  await withLocalTls("webhook-runtime.test", false, async (url, observed) => {
    let rejected = false;
    try { await postPublicWebhook(url, {}, "{}"); } catch (error) {
      rejected = error instanceof Error && error.message === "webhook_request_failed";
    }
    assert(rejected, "untrusted certificate must be rejected");
    assert(observed.connects === 1 && observed.requests.length === 0, "untrusted TLS must not receive the POST");
  });
});
