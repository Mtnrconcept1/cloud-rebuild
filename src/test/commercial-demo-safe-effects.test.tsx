// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const frameState = vi.hoisted(() => ({
  current: {
    surface: "restaurant",
    snapshot: {
      active_features: ["dashboard-advisor"],
    },
  } as Record<string, unknown> | null,
}));

vi.mock("@/components/commercial/CommercialDemoFrameProvider", () => ({
  useCommercialDemoFrame: () => frameState.current,
}));

const infoToast = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({
  toast: { info: infoToast },
}));

import CommercialDemoSafeEffectsBoundary from "@/components/commercial/CommercialDemoSafeEffectsBoundary";
import { shouldProtectCommercialDemoRequest } from "@/lib/commercialDemoEffects";

function RealToolPage() {
  const [result, setResult] = useState("idle");
  return (
    <button
      type="button"
      onClick={async () => {
        const response = await fetch("https://demo.supabase.co/functions/v1/paid-tool", {
          method: "POST",
          body: JSON.stringify({ prompt: "test" }),
        });
        const payload = await response.json() as { demo?: boolean };
        setResult(payload.demo ? "simulated" : "external");
      }}
    >
      Vraie page · {result}
    </button>
  );
}

function RealPostgrestPage() {
  const [result, setResult] = useState("idle");
  return (
    <button
      type="button"
      onClick={async () => {
        const client = createClient("https://demo.supabase.co", "demo-anon-key", {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data, error } = await client
          .from("restaurant_media")
          .insert({ alt_text: "Aperçu démo" })
          .select("id,alt_text")
          .single();
        setResult(!error && data?.alt_text === "Aperçu démo" ? "simulated" : "failed");
      }}
    >
      PostgREST réel · {result}
    </button>
  );
}

describe("commercial demo real-page side-effect guard", () => {
  const originalFetch = window.fetch;

  beforeEach(() => {
    frameState.current = {
      surface: "restaurant",
      snapshot: { active_features: ["dashboard-advisor"] },
    };
    infoToast.mockClear();
    window.fetch = vi.fn(async () => new Response(JSON.stringify({ external: true }), { status: 200 }));
  });

  afterEach(() => {
    cleanup();
    window.fetch = originalFetch;
  });

  it("protects writes and paid functions while allowing scoped read RPCs", () => {
    const origin = "https://app.tok.test";
    expect(shouldProtectCommercialDemoRequest("https://demo.supabase.co/functions/v1/generate-campaign", "POST", origin)).toBe(true);
    expect(shouldProtectCommercialDemoRequest("https://demo.supabase.co/rest/v1/restaurants?id=eq.demo", "PATCH", origin)).toBe(true);
    expect(shouldProtectCommercialDemoRequest("https://demo.supabase.co/storage/v1/object/images/demo", "POST", origin)).toBe(true);
    expect(shouldProtectCommercialDemoRequest("https://demo.supabase.co/rest/v1/rpc/get_restaurant_credit_usage", "POST", origin)).toBe(false);
    expect(shouldProtectCommercialDemoRequest("https://paid.example/rest/v1/rpc/get_restaurant_credit_usage", "POST", origin)).toBe(true);
    expect(shouldProtectCommercialDemoRequest("https://demo.supabase.co/rest/v1/restaurant_media?restaurant_id=eq.demo", "GET", origin)).toBe(false);
    expect(shouldProtectCommercialDemoRequest("https://demo.supabase.co/auth/v1/token", "POST", origin)).toBe(false);
  });

  it("mounts the actual page child and returns a successful simulated response", async () => {
    const externalFetch = window.fetch as ReturnType<typeof vi.fn>;
    render(
      <CommercialDemoSafeEffectsBoundary tool="advisor">
        <RealToolPage />
      </CommercialDemoSafeEffectsBoundary>,
    );

    const pageButton = await screen.findByRole("button", { name: "Vraie page · idle" });
    expect(screen.getByTestId("commercial-demo-real-tool-advisor")).toBeTruthy();
    fireEvent.click(pageButton);

    await waitFor(() => expect(screen.getByRole("button", { name: "Vraie page · simulated" })).toBeTruthy());
    expect(externalFetch).not.toHaveBeenCalled();
    expect(infoToast).toHaveBeenCalledTimes(1);
  });

  it("preserves PostgREST select().single() semantics for simulated inserts", async () => {
    const externalFetch = window.fetch as ReturnType<typeof vi.fn>;
    render(
      <CommercialDemoSafeEffectsBoundary tool="photos">
        <RealPostgrestPage />
      </CommercialDemoSafeEffectsBoundary>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "PostgREST réel · idle" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "PostgREST réel · simulated" })).toBeTruthy());
    expect(externalFetch).not.toHaveBeenCalled();
  });
});
