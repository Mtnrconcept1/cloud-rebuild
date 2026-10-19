import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  crawlRestaurantSocialProfiles,
  parseSocialRobotsPolicy,
  socialRobotsAllows,
  validSocialRobotsPolicy,
  type SocialOriginCoordinator,
  type SocialRobotsPolicy,
  type SocialWebsiteCrawlOptions,
} from "../../supabase/functions/_shared/marketing-social-site-crawler";

const encode = (value: string) => new TextEncoder().encode(value);
const decode = (value: Uint8Array) => new TextDecoder().decode(value);
type Fixture = { wire: string; stall?: boolean };
type Request = { url: string; at: number; headers: string };
const fixtures = new Map<string, Fixture>();
const requests: Request[] = [];
const sockets: FixtureConnection[] = [];
let caseNumber = 0;
let origin: string;

/** Exercise the real resolver and pinned HTTP reader with controlled sockets, never a live network. */
class FixtureConnection {
  private bytes: Uint8Array | null = null;
  private offset = 0;
  private writes: Uint8Array[] = [];
  private stall = false;
  private pendingReads: Array<(error: Error) => void> = [];
  closed = false;

  constructor(private scheme: string) {}

  write = vi.fn(async (bytes: Uint8Array) => { this.writes.push(bytes.slice()); return bytes.byteLength; });
  read = vi.fn(async (buffer: Uint8Array): Promise<number | null> => {
    if (this.closed) throw new Error("connection closed");
    if (this.bytes === null) {
      const headers = this.writes.map(decode).join("");
      const path = headers.match(/^GET (\S+) HTTP\/1\.1\r\n/)?.[1];
      const host = headers.match(/\r\nhost: ([^\r\n]+)\r\n/i)?.[1];
      const url = this.scheme + "://" + host + path;
      requests.push({ url, at: Date.now(), headers });
      const fixture = fixtures.get(url);
      if (!fixture) throw new Error("Unexpected fixture URL: " + url);
      this.bytes = encode(fixture.wire);
      this.stall = fixture.stall === true;
    }
    if (this.offset === this.bytes.byteLength) {
      if (this.stall) return new Promise((_, reject) => { this.pendingReads.push(reject); });
      return null;
    }
    const length = Math.min(buffer.byteLength, this.bytes.byteLength - this.offset);
    buffer.set(this.bytes.subarray(this.offset, this.offset + length));
    this.offset += length;
    return length;
  });
  close = vi.fn(() => { this.closed = true; for (const reject of this.pendingReads.splice(0)) reject(new Error("connection closed")); });
  handshake = vi.fn(async () => ({ alpnProtocol: "http/1.1" }));
}

const dns = vi.fn(async (_host: string, type: string) => type === "A" ? ["93.184.216.34"] : []);
const connect = vi.fn(async (options: { hostname: string; port: number; transport: string }) => {
  const socket = new FixtureConnection(options.port === 80 ? "http" : "https");
  sockets.push(socket);
  return socket;
});
const startTls = vi.fn(async (socket: FixtureConnection, _options: { hostname: string; alpnProtocols: string[] }) => socket);
const forbiddenFetch = vi.fn(async () => { throw new Error("Native fetch must never be used"); });
const wire = (body: string, status = 200, headers = "Content-Type: text/html; charset=utf-8\r\n") => ({
  wire: "HTTP/1.1 " + status + " Fixture\r\n" + headers + "Content-Length: " + encode(body).byteLength + "\r\n\r\n" + body,
});
const robot = (body = "User-agent: *\nDisallow:", status = 200, headers = "") => wire(body, status, "Content-Type: text/plain\r\n" + headers);

async function run(website: string | null, options?: SocialWebsiteCrawlOptions) {
  const pending = crawlRestaurantSocialProfiles(website, options);
  await vi.runAllTimersAsync();
  return await pending;
}

function durableCoordinator() {
  type State = { token: string | null; leaseUntil: number; nextAllowed: number; policy?: SocialRobotsPolicy; expiresAt: number };
  const states = new Map<string, State>();
  let sequence = 0;
  const reserve = vi.fn<SocialOriginCoordinator["reserve"]>(async ({ origin: key, kind }) => {
    const state = states.get(key) || { token: null, leaseUntil: 0, nextAllowed: 0, expiresAt: 0 };
    states.set(key, state);
    if (kind === "robots" && state.policy && state.expiresAt > Date.now()) return {
      kind: "cached", robotsPolicy: structuredClone(state.policy), robotsExpiresAt: new Date(state.expiresAt).toISOString(),
    };
    const availableAt = Math.max(state.nextAllowed, state.token ? state.leaseUntil : 0);
    if (availableAt > Date.now()) return { kind: "deferred", retryAfter: new Date(availableAt).toISOString() };
    state.token = "00000000-0000-4000-8000-" + String(++sequence).padStart(12, "0");
    state.leaseUntil = Date.now() + 20_000;
    return { kind: "reserved", requestToken: state.token };
  });
  const finish = vi.fn<SocialOriginCoordinator["finish"]>(async ({ origin: key, requestToken, robotsPolicy, retryAfter }) => {
    const state = states.get(key)!;
    if (state.token !== requestToken) throw new Error("stale_origin_lease");
    if (robotsPolicy) {
      state.policy = structuredClone(robotsPolicy);
      state.expiresAt = Date.now() + 1_800_000 + robotsPolicy.crawlDelayMs;
    }
    state.nextAllowed = Math.max(state.nextAllowed, Date.now() + (state.policy?.crawlDelayMs ?? 500), retryAfter ? Date.parse(retryAfter) : 0);
    state.token = null;
    return { nextAllowedAt: new Date(state.nextAllowed).toISOString() };
  });
  return { reserve, finish, states };
}

async function separateInstance() {
  vi.resetModules();
  return (await import("../../supabase/functions/_shared/marketing-social-site-crawler")).crawlRestaurantSocialProfiles;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-19T12:00:00.000Z"));
  origin = "https://restaurant-" + (++caseNumber) + ".example";
  fixtures.clear(); requests.length = 0; sockets.length = 0;
  dns.mockReset().mockImplementation(async (_host, type) => type === "A" ? ["93.184.216.34"] : []);
  connect.mockClear(); startTls.mockClear(); forbiddenFetch.mockClear();
  vi.stubGlobal("Deno", { resolveDns: dns, connect, startTls });
  vi.stubGlobal("fetch", forbiddenFetch);
});

afterEach(() => {
  expect(forbiddenFetch).not.toHaveBeenCalled();
  expect(sockets.every((socket) => socket.closed)).toBe(true);
  vi.unstubAllGlobals(); vi.useRealTimers();
});

describe("robots policy for restaurant discovery", () => {
  it("combines the most specific bot groups and lets equally specific Allow win", () => {
    const policy = parseSocialRobotsPolicy("User-agent: *\nDisallow: /\n\n"
      + "User-agent: TokSocialProfileBot\nDisallow: /private\nCrawl-delay: 3.5\n\n"
      + "User-agent: TokSocialProfileBot\nAllow: /private/public\nDisallow: /same\nAllow: /same\n");
    expect(policy.crawlDelayMs).toBe(3_500);
    expect(socialRobotsAllows(policy, new URL(origin + "/"))).toBe(true);
    expect(socialRobotsAllows(policy, new URL(origin + "/private"))).toBe(false);
    expect(socialRobotsAllows(policy, new URL(origin + "/private/public"))).toBe(true);
    expect(socialRobotsAllows(policy, new URL(origin + "/same"))).toBe(true);
  });

  it("matches wildcards, end anchors, escaped unreserved bytes and Unicode without a remote regex", () => {
    const policy = parseSocialRobotsPolicy("User-agent: *\nDisallow: /*?secret=*\nDisallow: /contact$\nDisallow: /%62locked\nDisallow: /🍽\n");
    expect(socialRobotsAllows(policy, new URL(origin + "/contact"))).toBe(false);
    expect(socialRobotsAllows(policy, new URL(origin + "/contact/team"))).toBe(true);
    expect(socialRobotsAllows(policy, new URL(origin + "/page?secret=token"))).toBe(false);
    expect(socialRobotsAllows(policy, new URL(origin + "/blocked"))).toBe(false);
    expect(socialRobotsAllows(policy, new URL(origin + "/🍽/contact"))).toBe(false);
    const adversarial = parseSocialRobotsPolicy("User-agent: *\nDisallow: /" + "*a".repeat(60) + "b$");
    expect(socialRobotsAllows(adversarial, new URL(origin + "/" + "a".repeat(1_000)))).toBe(true);
  });

  it("never reduces a valid large crawl delay and fails closed on unbounded robots input", () => {
    expect(parseSocialRobotsPolicy("User-agent: *\nCrawl-delay: 120").crawlDelayMs).toBe(120_000);
    expect(parseSocialRobotsPolicy("User-agent: *\nCrawl-delay: " + "9".repeat(400)).denyAll).toBe(true);
    expect(parseSocialRobotsPolicy("x\n".repeat(10_001)).denyAll).toBe(true);
  });
});

describe("bounded public restaurant website crawler", () => {
  it("reads at most the homepage and two useful pages, deduplicates profiles and never visits Meta", async () => {
    fixtures.set(origin + "/robots.txt", robot());
    fixtures.set(origin + "/", wire('<a href="https://instagram.com/La_Table?ref=footer">Instagram</a>'
      + '<a href="/contact">Contact</a><a href="/about">À propos</a><a href="/restaurant">Restaurant</a>'));
    fixtures.set(origin + "/contact", wire('<a href="https://instagram.com/la_table/">IG doublon</a>'
      + '<a href="https://facebook.com/La.Table/">Facebook</a><a href="/contact/team">Autre page</a>'));
    fixtures.set(origin + "/about", wire('<script type="application/ld+json">{"sameAs":"https://facebook.com/profile.php?id=100063123456789","name":"La Table"}</script>'));
    const result = await run(origin);
    expect(result.crawlStatus).toBe("success");
    expect(result.visitedUrls).toEqual([origin + "/", origin + "/contact", origin + "/about"]);
    expect(result.profiles.map((profile) => [profile.canonicalKey, profile.sourceUrl])).toEqual([
      ["la_table", origin + "/"], ["slug:la.table", origin + "/contact"], ["id:100063123456789", origin + "/about"],
    ]);
    expect(requests.map((request) => request.url)).toEqual([origin + "/robots.txt", ...result.visitedUrls]);
    expect(requests.every((request) => /user-agent: TokSocialProfileBot\/1\.0/.test(request.headers))).toBe(true);
    expect(requests.every((request) => !/\r\n(?:cookie|authorization|proxy-authorization):/i.test(request.headers))).toBe(true);
    expect(connect.mock.calls.every(([options]) => options.hostname === "93.184.216.34" && options.port === 443)).toBe(true);
    expect(startTls.mock.calls.every(([, options]) => options.hostname === new URL(origin).hostname)).toBe(true);
    expect(requests.slice(1).every((request, index) => request.at - requests[index].at >= 500)).toBe(true);
  });

  it("returns twenty candidates at most and stops requesting additional pages once that bound is reached", async () => {
    fixtures.set(origin + "/robots.txt", robot("", 404));
    fixtures.set(origin + "/", wire(Array.from({ length: 25 }, (_, index) => '<a href="https://instagram.com/resto' + index + '/">IG</a>').join("")
      + '<a href="/contact">Contact</a>'));
    const result = await run(origin);
    expect(result.profiles).toHaveLength(20);
    expect(result.visitedUrls).toEqual([origin + "/"]);
    expect(requests).toHaveLength(2);
  });

  it("handles missing websites and direct profile links without opening any socket", async () => {
    expect((await run(null)).crawlStatus).toBe("no_website");
    const result = await run("https://instagram.com/resto/");
    expect(result.crawlStatus).toBe("success");
    expect(result.diagnostics).toEqual(["social_url_provided_as_website"]);
    expect(result.visitedUrls).toEqual([]);
    expect(dns).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });

  it("does not request a page disallowed by robots and defers a delay exceeding the site budget", async () => {
    fixtures.set(origin + "/robots.txt", robot("User-agent: *\nDisallow: /"));
    const blocked = await run(origin);
    expect(blocked.crawlStatus).toBe("robots_blocked");
    expect(blocked.diagnostics).toContain("robots_disallowed");
    expect(requests.map((request) => request.url)).toEqual([origin + "/robots.txt"]);

    const delayed = origin.replace("restaurant-", "delayed-");
    fixtures.set(delayed + "/robots.txt", robot("User-agent: *\nCrawl-delay: 30"));
    const deferred = await run(delayed);
    expect(deferred.crawlStatus).toBe("error");
    expect(deferred.diagnostics).toContain("crawl_delay_deferred");
    expect(deferred.retryAfter).toBe("2026-10-19T12:00:30.000Z");
    expect(requests.map((request) => request.url)).toEqual([origin + "/robots.txt", delayed + "/robots.txt"]);
  });

  it("shares robots caching and request spacing across concurrent restaurants on the same origin", async () => {
    fixtures.set(origin + "/robots.txt", robot("User-agent: *\nCrawl-delay: 2"));
    fixtures.set(origin + "/", wire("<html>Aucun lien</html>"));
    const first = crawlRestaurantSocialProfiles(origin);
    const second = crawlRestaurantSocialProfiles(origin);
    await vi.runAllTimersAsync();
    expect((await first).crawlStatus).toBe("no_profiles");
    expect((await second).crawlStatus).toBe("no_profiles");
    expect(requests.map((request) => request.url)).toEqual([origin + "/robots.txt", origin + "/", origin + "/"]);
    expect(requests[1].at - requests[0].at).toBeGreaterThanOrEqual(2_000);
    expect(requests[2].at - requests[1].at).toBeGreaterThanOrEqual(2_000);
  });

  it("checks destination robots before requesting a redirected page", async () => {
    const destination = origin.replace("restaurant-", "destination-");
    fixtures.set(origin + "/robots.txt", robot());
    fixtures.set(origin + "/", wire("", 302, "Location: " + destination + "/private\r\n"));
    fixtures.set(destination + "/robots.txt", robot("User-agent: *\nDisallow: /private"));
    const result = await run(origin);
    expect(result.crawlStatus).toBe("robots_blocked");
    expect(requests.map((request) => request.url)).toEqual([origin + "/robots.txt", origin + "/", destination + "/robots.txt"]);
    expect(result.visitedUrls).toEqual([]);
  });

  it.each([
    ["https://www.instagram.com/resto/", "social_or_redirector_host_not_crawled"],
    ["http://127.0.0.1/private", "unsafe_or_private_host"],
    ["http://public.example/", "unsafe_redirect_protocol"],
    ["https://user:pass@public.example/", "unsafe_website_url"],
  ])("blocks a redirect before connecting to its unsafe destination: %s", async (location, diagnostic) => {
    fixtures.set(origin + "/robots.txt", robot());
    fixtures.set(origin + "/", wire("", 302, "Location: " + location + "\r\n"));
    const result = await run(origin);
    expect(result.crawlStatus).toBe("error");
    expect(result.diagnostics).toContain(diagnostic);
    expect(requests.map((request) => request.url)).toEqual([origin + "/robots.txt", origin + "/"]);
    expect(dns.mock.calls.every(([host]) => host === new URL(origin).hostname)).toBe(true);
  });

  it("rejects private DNS records and validates DNS again before every request", async () => {
    let resolutions = 0;
    dns.mockImplementation(async (_host, type) => type === "AAAA" ? [] : ++resolutions === 1 ? ["93.184.216.34"] : ["127.0.0.1"]);
    fixtures.set(origin + "/robots.txt", robot());
    const result = await run(origin);
    expect(result.crawlStatus).toBe("error");
    expect(result.diagnostics).toContain("unsafe_or_private_host");
    expect(requests.map((request) => request.url)).toEqual([origin + "/robots.txt"]);
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it("honors Retry-After across later calls without shortening the origin cooldown", async () => {
    fixtures.set(origin + "/robots.txt", robot("", 429, "Retry-After: 120\r\n"));
    const first = await run(origin);
    expect(first.crawlStatus).toBe("robots_blocked");
    expect(first.retryAfter).toBe("2026-10-19T12:02:00.000Z");
    const second = await run(origin);
    expect(second.diagnostics).toContain("crawl_delay_deferred");
    expect(second.retryAfter).toBe(first.retryAfter);
    expect(requests).toHaveLength(1);
  });

  it("rejects non-HTML bodies, oversized streaming responses and access challenges", async () => {
    for (const [suffix, fixture, diagnostic] of [
      ["pdf", wire("file", 200, "Content-Type: application/pdf\r\n"), "non_html_response"],
      ["huge", { wire: "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n" + "x".repeat(1_048_577) }, "http_response_body_too_large"],
      ["challenge", wire("<title>Just a moment...</title>"), "website_access_challenge"],
    ] as const) {
      const site = origin.replace("restaurant-", suffix + "-");
      fixtures.set(site + "/robots.txt", robot());
      fixtures.set(site + "/", fixture);
      const result = await run(site);
      expect(result.crawlStatus).toBe("error");
      expect(result.diagnostics).toContain(diagnostic);
      expect(result.profiles).toEqual([]);
    }
  });

  it("cancels a stalled response within the shared deadline and closes its socket", async () => {
    fixtures.set(origin + "/robots.txt", robot());
    fixtures.set(origin + "/", { wire: "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: 1000\r\n\r\n", stall: true });
    const startedAt = Date.now();
    const result = await run(origin, { budgetMs: 1_500 });
    expect(result.crawlStatus).toBe("error");
    expect(result.diagnostics).toContain("crawl_timeout");
    expect(Date.now() - startedAt).toBeLessThanOrEqual(1_500);
    expect(sockets.every((socket) => socket.closed)).toBe(true);
  });

  it("does not start network work after a caller cancellation or late DNS resolution", async () => {
    const parent = new AbortController();
    parent.abort();
    expect((await run(origin, { signal: parent.signal })).diagnostics).toContain("crawl_cancelled");
    expect(connect).not.toHaveBeenCalled();

    let resolveLate: (records: string[]) => void = () => undefined;
    dns.mockImplementation(async (_host, type) => type === "AAAA" ? [] : new Promise<string[]>((resolve) => { resolveLate = resolve; }));
    const result = await run(origin.replace("restaurant-", "late-"), { budgetMs: 500 });
    expect(result.diagnostics).toContain("crawl_timeout");
    resolveLate(["93.184.216.34"]);
    await Promise.resolve(); await Promise.resolve();
    expect(connect).not.toHaveBeenCalled();
  });

  it("keeps an Instagram candidate but schedules the failed contact page for retry after a 429", async () => {
    fixtures.set(origin + "/robots.txt", robot());
    fixtures.set(origin + "/", wire('<a href="https://instagram.com/resto/">Instagram</a><a href="/contact">Contact</a>'));
    fixtures.set(origin + "/contact", wire("", 429, "Retry-After: 120\r\n"));
    const result = await run(origin);
    expect(result.crawlStatus).toBe("error");
    expect(result.profiles.map((profile) => profile.canonicalKey)).toEqual(["resto"]);
    expect(result.diagnostics).toContain("website_http_429");
    expect(result.retryAfter).toBe("2026-10-19T12:02:01.000Z");
    expect(result.networkAttempted).toBe(true);
  });
});

describe("durable origin coordination across Edge instances", () => {
  it("reserves and finishes every physical request, publishing robots before the next HTML read", async () => {
    const coordinator = durableCoordinator();
    fixtures.set(origin + "/robots.txt", robot("User-agent: *\nCrawl-delay: 1"));
    fixtures.set(origin + "/", wire('<a href="/contact">Contact</a><a href="/about">À propos</a>'));
    fixtures.set(origin + "/contact", wire('<a href="https://instagram.com/resto/">Instagram</a>'));
    fixtures.set(origin + "/about", wire("<html>À propos</html>"));
    const result = await run(origin, { originCoordinator: coordinator });
    expect(result.crawlStatus).toBe("success");
    expect(coordinator.reserve).toHaveBeenCalledTimes(4);
    expect(coordinator.finish).toHaveBeenCalledTimes(4);
    expect(coordinator.finish.mock.calls[0][0].robotsPolicy?.crawlDelayMs).toBe(1_000);
    expect(coordinator.reserve.mock.calls.every(([input]) => input.origin === origin)).toBe(true);
    expect(requests.slice(1).every((request, index) => request.at - requests[index].at >= 1_000)).toBe(true);
    expect(coordinator.states.get(origin)?.token).toBeNull();
  });

  it("prevents two separate instances from concurrently reading the same origin", async () => {
    const coordinator = durableCoordinator();
    const otherCrawler = await separateInstance();
    fixtures.set(origin + "/robots.txt", robot());
    fixtures.set(origin + "/", wire('<a href="https://instagram.com/resto/">IG</a>'));
    const first = crawlRestaurantSocialProfiles(origin, { originCoordinator: coordinator });
    const second = otherCrawler(origin, { originCoordinator: coordinator });
    await vi.runAllTimersAsync();
    const results = await Promise.all([first, second]);
    expect(results.map((result) => result.crawlStatus).sort()).toEqual(["error", "success"]);
    expect(results.find((result) => result.crawlStatus === "error")).toMatchObject({ networkAttempted: false, diagnostics: ["crawl_delay_deferred"] });
    expect(requests.map((request) => request.url)).toEqual([origin + "/robots.txt", origin + "/"]);
  });

  it("resumes after a long delay in a fresh instance using durable robots without requesting them again", async () => {
    const coordinator = durableCoordinator();
    fixtures.set(origin + "/robots.txt", robot("User-agent: *\nCrawl-delay: 3600"));
    fixtures.set(origin + "/", wire('<a href="https://facebook.com/resto/">FB</a>'));
    const first = await run(origin, { originCoordinator: coordinator });
    expect(first.diagnostics).toContain("crawl_delay_deferred");
    expect(first.retryAfter).toBe("2026-10-19T13:00:00.000Z");
    expect(first.networkAttempted).toBe(true);
    vi.setSystemTime(new Date(first.retryAfter!));
    const resumedCrawler = await separateInstance();
    const pending = resumedCrawler(origin, { originCoordinator: coordinator });
    await vi.runAllTimersAsync();
    const resumed = await pending;
    expect(resumed.crawlStatus).toBe("success");
    expect(resumed.profiles[0].platform).toBe("facebook");
    expect(requests.map((request) => request.url)).toEqual([origin + "/robots.txt", origin + "/"]);
    expect(coordinator.finish).toHaveBeenCalledTimes(2);
  });

  it("halts the entire crawl when finishing a physical request is unconfirmed", async () => {
    const coordinator = durableCoordinator();
    const normalFinish = coordinator.finish.getMockImplementation()!;
    coordinator.finish.mockImplementation(async (input) => {
      if (requests.at(-1)?.url === origin + "/contact") throw new Error("RPC response lost after commit");
      return normalFinish(input);
    });
    fixtures.set(origin + "/robots.txt", robot());
    fixtures.set(origin + "/", wire('<a href="https://instagram.com/resto/">IG</a><a href="/contact">Contact</a><a href="/about">À propos</a>'));
    fixtures.set(origin + "/contact", wire('<a href="https://facebook.com/resto/">FB</a>'));
    const result = await run(origin, { originCoordinator: coordinator });
    expect(result.crawlStatus).toBe("error");
    expect(result.diagnostics).toContain("origin_coordination_failed");
    expect(result.profiles.map((profile) => profile.platform)).toEqual(["instagram"]);
    expect(requests.map((request) => request.url)).toEqual([origin + "/robots.txt", origin + "/", origin + "/contact"]);
  });

  it("publishes Retry-After and keeps it across a later instance without making an early request", async () => {
    const coordinator = durableCoordinator();
    fixtures.set(origin + "/robots.txt", robot());
    fixtures.set(origin + "/", wire("", 503, "Retry-After: 1209600\r\n"));
    const result = await run(origin, { originCoordinator: coordinator });
    expect(result.retryAfter).toBe("2026-11-02T12:00:00.500Z");
    expect(coordinator.states.get(origin)?.nextAllowed).toBe(Date.parse(result.retryAfter!));
    const otherCrawler = await separateInstance();
    const pending = otherCrawler(origin, { originCoordinator: coordinator });
    await vi.runAllTimersAsync();
    expect(await pending).toMatchObject({ crawlStatus: "error", networkAttempted: false, retryAfter: result.retryAfter });
    expect(requests).toHaveLength(2);
  });

  it("rejects malformed or oversized shared robots data before opening a socket", async () => {
    const coordinator = durableCoordinator();
    coordinator.reserve.mockResolvedValue({ kind: "cached", robotsPolicy: {
      rules: [{ allow: true, path: "/" + "x".repeat(2_048) }], crawlDelayMs: 500, denyAll: false,
    }, robotsExpiresAt: "2026-10-19T13:00:00Z" });
    const result = await run(origin, { originCoordinator: coordinator });
    expect(result.diagnostics).toContain("origin_coordination_failed");
    expect(result.networkAttempted).toBe(false);
    expect(connect).not.toHaveBeenCalled();
    expect(coordinator.finish).not.toHaveBeenCalled();
    expect(validSocialRobotsPolicy({ rules: [], denyAll: false, crawlDelayMs: 0 })).toBe(false);
    const oversized = parseSocialRobotsPolicy("User-agent: *\n" + "Disallow: /long/path\n".repeat(1_001));
    expect(oversized.denyAll).toBe(true);
    expect(oversized.rules).toEqual([]);
  });

  it("coordinates redirected HTML on each origin and refuses ambiguous cross-origin robots redirects", async () => {
    const coordinator = durableCoordinator();
    const destination = origin.replace("restaurant-", "destination-");
    fixtures.set(origin + "/robots.txt", robot());
    fixtures.set(origin + "/", wire("", 302, "Location: " + destination + "/menu\r\n"));
    fixtures.set(destination + "/robots.txt", robot());
    fixtures.set(destination + "/menu", wire('<a href="https://instagram.com/resto/">IG</a>'));
    expect((await run(origin, { originCoordinator: coordinator })).crawlStatus).toBe("success");
    expect(coordinator.reserve.mock.calls.map(([input]) => [input.origin, input.kind])).toEqual([
      [origin, "robots"], [origin, "html"], [destination, "robots"], [destination, "html"],
    ]);
    const ambiguous = origin.replace("restaurant-", "ambiguous-");
    fixtures.set(ambiguous + "/robots.txt", wire("", 302, "Location: " + destination + "/rules\r\n"));
    const result = await run(ambiguous, { originCoordinator: coordinator });
    expect(result.crawlStatus).toBe("robots_blocked");
    expect(result.diagnostics).toContain("robots_redirect_origin_unsupported");
    expect(requests.at(-1)?.url).toBe(ambiguous + "/robots.txt");
  });

  it("finishes a cancelled read with a separate bounded cleanup signal", async () => {
    const coordinator = durableCoordinator();
    const parent = new AbortController();
    fixtures.set(origin + "/robots.txt", robot());
    fixtures.set(origin + "/", { wire: "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: 1000\r\n\r\n", stall: true });
    const cleanupWasUsable: boolean[] = [];
    const normalFinish = coordinator.finish.getMockImplementation()!;
    coordinator.finish.mockImplementation(async (input) => { cleanupWasUsable.push(!input.signal.aborted); return normalFinish(input); });
    setTimeout(() => parent.abort(), 1_000);
    const result = await run(origin, { originCoordinator: coordinator, signal: parent.signal });
    expect(result.diagnostics).toContain("crawl_cancelled");
    expect(cleanupWasUsable).toEqual([true, true]);
    expect(coordinator.states.get(origin)?.token).toBeNull();
    expect(Date.now()).toBeLessThanOrEqual(Date.parse("2026-10-19T12:00:12.000Z"));
  });
});
