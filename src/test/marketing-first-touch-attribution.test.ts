import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const { invoke, auth } = vi.hoisted(() => {
  const state = { callback: null as null | ((event: string, session: unknown) => void) };
  return {
    invoke: vi.fn(async (_name: string, _options?: { body?: Record<string, unknown> }) => ({ data: { recorded: true }, error: null as unknown })),
    auth: {
      state,
      getSession: vi.fn(async () => ({ data: { session: null } })),
      getUser: vi.fn(async () => ({ data: { user: null } })),
      onAuthStateChange: vi.fn((callback: (event: string, session: unknown) => void) => {
        state.callback = callback;
        return { data: { subscription: { unsubscribe: () => undefined } } };
      }),
    },
  };
});

vi.mock("@/integrations/supabase/client", () => ({
  getSupabase: () => ({
    functions: { invoke },
    auth,
    from: () => ({ insert: async () => ({ error: null }) }),
  }),
}));

import {
  FIRST_TOUCH_FORGET_STORAGE_KEY,
  FIRST_TOUCH_STORAGE_KEY,
  bindFirstTouch,
  captureAcquisitionTouch,
  initAcquisitionAttribution,
  readStoredFirstTouch,
  rememberFirstTouch,
  resetAcquisitionAttributionForTests,
  trackPageView,
} from "@/lib/acquisitionAttribution";
import { DEFAULT_CONSENT, saveConsent } from "@/lib/consent";
import { TRACKER_INVENTORY } from "@/lib/cookieInventory";

const USER = "22222222-2222-4222-8222-222222222222";
const ITEM = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const landing = {
  href: `https://www.thetok.ch/zero-attente?utm_source=Instagram&utm_medium=social&utm_campaign=Guide%20Carouge_202611&utm_content=${ITEM}&email=a%40b.ch#top`,
  referrer: "https://l.instagram.com/?u=https%3A%2F%2Fwww.thetok.ch",
};
const grant = (preferences: Partial<typeof DEFAULT_CONSENT>) => saveConsent({ ...DEFAULT_CONSENT, ...preferences }, "banner");
const bodies = (kind: string) => invoke.mock.calls
  .map(([, options]) => options?.body as Record<string, unknown> | undefined)
  .filter((body): body is Record<string, unknown> => body?.kind === kind);
const flush = () => new Promise((resolveTimer) => setTimeout(resolveTimer, 0));

beforeEach(() => {
  window.localStorage.clear();
  resetAcquisitionAttributionForTests();
  invoke.mockClear();
  invoke.mockImplementation(async () => ({ data: { recorded: true }, error: null }));
  auth.state.callback = null;
});

describe("first-touch capture", () => {
  it("keeps normalized UTMs, the referrer host and the landing pathname only", () => {
    expect(captureAcquisitionTouch({ ...landing, now: Date.parse("2026-11-02T08:00:00Z") })).toEqual({
      utm: {
        utm_source: "instagram",
        utm_medium: "social",
        utm_campaign: "guide-carouge_202611",
        utm_content: ITEM,
      },
      referrerHost: "l.instagram.com",
      landingPath: "/zero-attente",
      touchedAt: "2026-11-02T08:00:00.000Z",
    });
  });

  it.each([
    ["direct visit", { href: "https://www.thetok.ch/recherche", referrer: "" }],
    ["TOK navigation", { href: "https://www.thetok.ch/recherche", referrer: "https://www.thetok.ch/" }],
    ["payment return", { href: "https://www.thetok.ch/commandes", referrer: "https://checkout.stripe.com/" }],
    ["sign-in return", { href: "https://www.thetok.ch/", referrer: "https://accounts.google.com/" }],
    ["campaign without source", { href: "https://www.thetok.ch/?utm_campaign=guide", referrer: "" }],
  ])("ignores a %s", (_label, input) => {
    expect(captureAcquisitionTouch(input)).toBeNull();
  });

  it("records an organic referral without campaign parameters", () => {
    expect(captureAcquisitionTouch({ href: "https://www.thetok.ch/anti-gaspi", referrer: "https://www.google.com/search?q=tok" }))
      .toMatchObject({ utm: {}, referrerHost: "www.google.com", landingPath: "/anti-gaspi" });
  });
});

describe("consent-gated first-touch storage", () => {
  it("stores nothing before the banner choice, then the landing touch once marketing is accepted", async () => {
    initAcquisitionAttribution(landing);
    expect(window.localStorage.getItem(FIRST_TOUCH_STORAGE_KEY)).toBeNull();
    await grant({ marketing: true });
    expect(readStoredFirstTouch()?.utm.utm_content).toBe(ITEM);
  });

  it("never stores a touch when marketing is refused, and erases one on refusal", async () => {
    await grant({ marketing: true });
    rememberFirstTouch(captureAcquisitionTouch(landing)!);
    expect(readStoredFirstTouch()).not.toBeNull();
    initAcquisitionAttribution(landing);
    await grant({ analytics: true, marketing: false });
    expect(window.localStorage.getItem(FIRST_TOUCH_STORAGE_KEY)).toBeNull();
    expect(rememberFirstTouch(captureAcquisitionTouch(landing)!)).toBe(false);
  });

  it("keeps the first touch until it expires after 90 days", async () => {
    await grant({ marketing: true });
    const now = Date.now();
    const first = captureAcquisitionTouch({ ...landing, now })!;
    const later = captureAcquisitionTouch({ href: "https://www.thetok.ch/?utm_source=facebook", referrer: "", now })!;
    expect(rememberFirstTouch(first, window.localStorage, now)).toBe(true);
    expect(rememberFirstTouch(later, window.localStorage, now)).toBe(false);
    expect(readStoredFirstTouch(window.localStorage, now)?.utm.utm_source).toBe("instagram");
    const expiredAt = now + 91 * 24 * 60 * 60 * 1000;
    expect(readStoredFirstTouch(window.localStorage, expiredAt)).toBeNull();
    expect(rememberFirstTouch(later, window.localStorage, expiredAt)).toBe(true);
  });

  it("declares the storage key as a marketing tracker", () => {
    expect(TRACKER_INVENTORY.find((item) => item.name === FIRST_TOUCH_STORAGE_KEY)).toMatchObject({
      storage: "localStorage", category: "marketing",
    });
  });
});

describe("server-side binding after sign-in", () => {
  it("sends the stored touch once per account, without any account or campaign identifier", async () => {
    await grant({ marketing: true });
    rememberFirstTouch(captureAcquisitionTouch(landing)!);
    initAcquisitionAttribution(null);
    auth.state.callback?.("SIGNED_IN", { user: { id: USER } });
    await flush();
    await flush();
    const [body] = bodies("acquisition");
    expect(body).toMatchObject({ kind: "acquisition", marketingConsent: true, consentVersion: "cookies-2026-07-v3" });
    expect(body.touch).toMatchObject({ referrerHost: "l.instagram.com", landingPath: "/zero-attente" });
    expect(JSON.stringify(body)).not.toContain(USER);
    expect(JSON.stringify(body)).not.toMatch(/campaign_id|user_?id/i);
    expect(readStoredFirstTouch()?.boundUserIds).toEqual([USER]);
    expect(await bindFirstTouch(USER)).toBe(false);
    expect(bodies("acquisition")).toHaveLength(1);
  });

  it("does not bind without marketing consent", async () => {
    await grant({ marketing: true });
    rememberFirstTouch(captureAcquisitionTouch(landing)!);
    await grant({ marketing: false });
    expect(await bindFirstTouch(USER)).toBe(false);
    expect(bodies("acquisition")).toHaveLength(0);
  });

  it("drops a touch the server rejects instead of retrying it", async () => {
    await grant({ marketing: true });
    rememberFirstTouch(captureAcquisitionTouch(landing)!);
    invoke.mockImplementationOnce(async () => ({ data: null, error: { context: { status: 400 } } }));
    expect(await bindFirstTouch(USER)).toBe(false);
    expect(readStoredFirstTouch()).toBeNull();
  });

  it("asks the server to erase the touch when a signed-in visitor withdraws marketing consent", async () => {
    await grant({ marketing: true });
    initAcquisitionAttribution(null);
    auth.state.callback?.("INITIAL_SESSION", { user: { id: USER } });
    await grant({ marketing: false });
    expect(bodies("acquisition_forget")).toHaveLength(1);
  });

  it("erases the server touch at the next sign-in when consent was withdrawn while signed out", async () => {
    await grant({ marketing: true });
    initAcquisitionAttribution(null);
    await grant({ marketing: false });
    expect(bodies("acquisition_forget")).toHaveLength(0);
    expect(window.localStorage.getItem(FIRST_TOUCH_FORGET_STORAGE_KEY)).toBe("1");
    await grant({ marketing: true });
    rememberFirstTouch(captureAcquisitionTouch(landing)!);
    auth.state.callback?.("SIGNED_IN", { user: { id: USER } });
    await flush();
    await flush();
    await flush();
    expect(invoke.mock.calls.map(([, options]) => options?.body?.kind)).toEqual(["acquisition_forget", "acquisition"]);
    expect(window.localStorage.getItem(FIRST_TOUCH_FORGET_STORAGE_KEY)).toBeNull();
  });

  it("declares the withdrawal marker as necessary consent storage", () => {
    expect(TRACKER_INVENTORY.find((item) => item.name === FIRST_TOUCH_FORGET_STORAGE_KEY)).toMatchObject({
      storage: "localStorage", category: "necessary",
    });
  });
});

describe("page views", () => {
  it("waits for the banner choice and counts each path once with analytics consent", async () => {
    initAcquisitionAttribution(landing);
    trackPageView("/zero-attente");
    expect(bodies("page_view")).toHaveLength(0);
    await grant({ analytics: true });
    trackPageView("/zero-attente");
    trackPageView("/recherche");
    expect(bodies("page_view")).toEqual([
      { kind: "page_view", path: "/zero-attente" },
      { kind: "page_view", path: "/recherche" },
    ]);
  });

  it("adds campaign fields to the landing page view only with marketing consent", async () => {
    await grant({ analytics: true, marketing: true });
    initAcquisitionAttribution(landing);
    trackPageView("/zero-attente");
    trackPageView("/recherche");
    const [first, second] = bodies("page_view");
    expect(first).toMatchObject({ path: "/zero-attente", referrerHost: "l.instagram.com", utm: { utm_source: "instagram" } });
    expect(second).toEqual({ kind: "page_view", path: "/recherche" });
  });

  it("sends nothing when analytics is refused", async () => {
    await grant({ marketing: true });
    initAcquisitionAttribution(landing);
    trackPageView("/");
    expect(bodies("page_view")).toHaveLength(0);
  });
});

describe("attribution database contract", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20261027220000_marketing_first_touch_attribution.sql"),
    "utf8",
  );

  it("keeps touches deny-by-default and service functions definer-only", () => {
    expect(migration).toContain("ALTER TABLE public.marketing_acquisition_touches FORCE ROW LEVEL SECURITY;");
    expect(migration).toMatch(/REVOKE ALL ON TABLE public\.marketing_acquisition_touches\s+FROM PUBLIC, anon, authenticated, service_role;/);
    expect(migration.match(/SECURITY DEFINER\nSET search_path = ''/g)).toHaveLength(4);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.marketing_record_first_touch_facts\(uuid, text, uuid\)\s+FROM PUBLIC, anon, authenticated, service_role;/);
    expect(migration.match(/PERFORM public\.marketing_require_service_role\(\);/g)).toHaveLength(2);
  });

  it("produces campaign-identified, idempotent facts without blocking or rewriting transactions", () => {
    expect(migration.match(/ON CONFLICT \(source_system, source_fact_id\) DO NOTHING/g)).toHaveLength(4);
    expect(migration).toContain("WHERE t.user_id = p_user_id AND t.campaign_id IS NOT NULL");
    expect(migration).toContain("round(o.total_amount * 100)::bigint");
    expect(migration).toContain("EXCEPTION WHEN OTHERS THEN\n    -- Attribution is observational");
    expect(migration).not.toMatch(/UPDATE public\.(reservations|orders|signup_applications)/);
    expect(migration).not.toMatch(/acquisition_source\s*:=/);
    expect(migration).not.toContain("'user_id'");
    for (const trigger of ["reservations", "orders", "signup_applications"]) {
      expect(migration).toContain(`CREATE TRIGGER marketing_first_touch_on_${trigger}`);
    }
  });
});
