// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://www.thetok.ch/"}

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Link } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import MetricoolPageTracker from "@/components/MetricoolPageTracker";
import { CONSENT_EVENT, CONSENT_STORAGE_KEY, CONSENT_VERSION } from "@/lib/consent";
import {
  isMetricoolTrackablePage,
  METRICOOL_TRACKER_HASH,
  METRICOOL_TRACKER_SRC,
} from "@/lib/metricoolTracking";

vi.mock("@/lib/platform", () => ({ isNative: () => false }));

function setAnalytics(allowed: boolean) {
  localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({
    version: CONSENT_VERSION,
    preferences: {
      necessary: true, analytics: allowed, marketing: false,
      personalization: false, geolocation: false,
    },
    recordedAt: new Date().toISOString(),
    source: "settings",
  }));
  act(() => window.dispatchEvent(new Event(CONSENT_EVENT)));
}

describe("Metricool website tracking", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_METRICOOL_TOK_PROPERTY_VERIFIED", "true");
    localStorage.clear();
    document.head.querySelectorAll("script[data-tok-metricool]").forEach((script) => script.remove());
  });
  afterEach(() => {
    delete (window as Window & { beTracker?: unknown }).beTracker;
    vi.unstubAllEnvs();
  });

  it("restricts tracking to public TOK URLs with safe campaign parameters", () => {
    const visit = (pathname: string, extra: Record<string, unknown> = {}) => ({
      hostname: "www.thetok.ch", pathname, ...extra,
    });
    expect(isMetricoolTrackablePage(visit("/"))).toBe(true);
    expect(isMetricoolTrackablePage(visit("/recherche", { search: "?utm_source=instagram&utm_campaign=tok_automne" }))).toBe(true);
    expect(isMetricoolTrackablePage(visit("/restaurant/12345"))).toBe(true);
    expect(isMetricoolTrackablePage(visit("/restaurants/geneve/contact%40example.com"))).toBe(false);
    expect(isMetricoolTrackablePage(visit("/restaurants-pres/%2Fsecret"))).toBe(false);
    expect(isMetricoolTrackablePage(visit("/restaurateurs/geneve"))).toBe(true);
    expect(isMetricoolTrackablePage(visit("/dashboard"))).toBe(false);
    expect(isMetricoolTrackablePage(visit("/auth/callback", { search: "?code=secret" }))).toBe(false);
    expect(isMetricoolTrackablePage(visit("/panier"))).toBe(false);
    expect(isMetricoolTrackablePage(visit("/marketing"))).toBe(false);
    expect(isMetricoolTrackablePage(visit("/admin"))).toBe(false);
    expect(isMetricoolTrackablePage(visit("/commande/confirmation"))).toBe(false);
    expect(isMetricoolTrackablePage(visit("/", { hostname: "admin.thetok.ch" }))).toBe(false);
    expect(isMetricoolTrackablePage(visit("/", { hostname: "cloud-rebuild-recovered.vercel.app" }))).toBe(false);
    expect(isMetricoolTrackablePage(visit("/", { native: true }))).toBe(false);
    expect(isMetricoolTrackablePage(visit("/recherche", { search: "?email=client@example.ch" }))).toBe(false);
    expect(isMetricoolTrackablePage(visit("/recherche", { search: "?utm_source=jane@example.ch" }))).toBe(false);
    expect(isMetricoolTrackablePage(visit("/", { hash: "#access_token=secret" }))).toBe(false);
  });

  it("refuses any tracking while the TOK website property is not verified in Metricool", async () => {
    vi.stubEnv("VITE_METRICOOL_TOK_PROPERTY_VERIFIED", "false");
    render(<MemoryRouter initialEntries={["/"]}><MetricoolPageTracker /></MemoryRouter>);
    setAnalytics(true);
    await Promise.resolve();
    expect(document.querySelector("script[data-tok-metricool]")).toBeNull();
  });

  it("does not load before consent, then counts SPA navigation once without tracking private pages", async () => {
    expect(window.location.hostname).toBe("www.thetok.ch");
    const send = vi.fn();
    render(
      <MemoryRouter initialEntries={["/"]}>
        <MetricoolPageTracker />
        <Link to="/recherche">Recherche</Link>
        <Link to="/auth?code=private">Privé</Link>
        <Link to="/restaurant/abc">Restaurant</Link>
      </MemoryRouter>,
    );

    expect(document.querySelector("script[data-tok-metricool]")).toBeNull();
    setAnalytics(true);
    const script = await waitFor(() => {
      const element = document.querySelector("script[data-tok-metricool]") as HTMLScriptElement | null;
      expect(element?.src).toBe(METRICOOL_TRACKER_SRC);
      return element!;
    });
    (window as Window & { beTracker?: { t: typeof send } }).beTracker = { t: send };
    act(() => script.dispatchEvent(new Event("load")));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send).toHaveBeenLastCalledWith({ hash: METRICOOL_TRACKER_HASH });

    fireEvent.click(screen.getByText("Recherche"));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(document.querySelectorAll("script[data-tok-metricool]")).toHaveLength(1);

    fireEvent.click(screen.getByText("Privé"));
    expect(send).toHaveBeenCalledTimes(2);

    setAnalytics(false);
    fireEvent.click(screen.getByText("Restaurant"));
    expect(send).toHaveBeenCalledTimes(2);

    setAnalytics(true);
    await waitFor(() => expect(send).toHaveBeenCalledTimes(3));
  });

  it("allows the Metricool origin in both script-src and connect-src across all CSP headers", () => {
    const config = JSON.parse(readFileSync(resolve(process.cwd(), "vercel.json"), "utf8"));
    const policies: string[] = config.headers.flatMap((entry: { headers?: Array<{ key: string; value: string }> }) =>
      (entry.headers ?? []).filter((header) => header.key.toLowerCase() === "content-security-policy").map((header) => header.value));
    expect(policies.length).toBeGreaterThan(0);
    policies.forEach((policy) => {
      expect(policy).toMatch(/script-src[^;]*https:\/\/tracker\.metricool\.com/);
      expect(policy).toMatch(/connect-src[^;]*https:\/\/tracker\.metricool\.com/);
      expect(policy).not.toContain("script-src 'unsafe-inline'");
    });
  });
});
