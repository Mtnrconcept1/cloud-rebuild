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
        const response = await fetch("https://placeholder.supabase.co/functions/v1/paid-tool", {
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
        const client = createClient("https://placeholder.supabase.co", "demo-anon-key", {
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

function RealCommercialAiPage() {
  const [result, setResult] = useState("idle");
  return (
    <button
      type="button"
      onClick={async () => {
        const response = await fetch("https://placeholder.supabase.co/functions/v1/commercial-demo-ai", {
          method: "POST",
          headers: {
            Authorization: "Bearer signed-user-jwt",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "chat",
            request_id: "c130b080-1a64-4f3e-9fd2-4cf2c2bc6490",
            session_id: "efc018a2-0c34-430c-9714-6edc91781af8",
            message: "Présente TOK à ce restaurateur",
          }),
        });
        const payload = await response.json() as { external?: boolean };
        setResult(payload.external ? "edge" : "failed");
      }}
    >
      IA commerciale · {result}
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

  it("protects writes and paid functions while allowing only the commercial AI Edge slug", () => {
    const origin = "https://app.tok.test";
    expect(shouldProtectCommercialDemoRequest("https://placeholder.supabase.co/functions/v1/generate-campaign", "POST", origin)).toBe(true);
    expect(shouldProtectCommercialDemoRequest("https://placeholder.supabase.co/functions/v1/commercial-demo-ai", "POST", origin)).toBe(false);
    expect(shouldProtectCommercialDemoRequest("https://placeholder.supabase.co/functions/v1/commercial-demo-ai", "GET", origin)).toBe(true);
    expect(shouldProtectCommercialDemoRequest("https://evil-project.supabase.co/functions/v1/commercial-demo-ai", "POST", origin)).toBe(true);
    expect(shouldProtectCommercialDemoRequest("https://placeholder.supabase.co/functions/v1/commercial-demo-ai-preview", "POST", origin)).toBe(true);
    expect(shouldProtectCommercialDemoRequest("https://placeholder.supabase.co/functions/v1/ai-image-enhance", "POST", origin)).toBe(true);
    expect(shouldProtectCommercialDemoRequest("https://api.openai.com/v1/responses", "POST", origin)).toBe(true);
    expect(shouldProtectCommercialDemoRequest("https://api.openai.com/v1/images/generations", "POST", origin)).toBe(true);
    expect(shouldProtectCommercialDemoRequest("https://placeholder.supabase.co/rest/v1/restaurants?id=eq.demo", "PATCH", origin)).toBe(true);
    expect(shouldProtectCommercialDemoRequest("https://placeholder.supabase.co/storage/v1/object/images/demo", "POST", origin)).toBe(true);
    expect(shouldProtectCommercialDemoRequest("https://placeholder.supabase.co/rest/v1/rpc/get_restaurant_credit_usage", "POST", origin)).toBe(false);
    expect(shouldProtectCommercialDemoRequest("https://paid.example/rest/v1/rpc/get_restaurant_credit_usage", "POST", origin)).toBe(true);
    expect(shouldProtectCommercialDemoRequest("https://placeholder.supabase.co/rest/v1/restaurant_media?restaurant_id=eq.demo", "GET", origin)).toBe(false);
    expect(shouldProtectCommercialDemoRequest("https://placeholder.supabase.co/auth/v1/token", "POST", origin)).toBe(false);
    expect(shouldProtectCommercialDemoRequest("https://evil.example/auth/v1/token", "POST", origin)).toBe(true);
  });

  it("lets the authenticated commercial AI request reach Supabase without simulation", async () => {
    const externalFetch = window.fetch as ReturnType<typeof vi.fn>;
    render(
      <CommercialDemoSafeEffectsBoundary tool="advisor">
        <RealCommercialAiPage />
      </CommercialDemoSafeEffectsBoundary>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "IA commerciale · idle" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "IA commerciale · edge" })).toBeTruthy());
    expect(externalFetch).toHaveBeenCalledTimes(1);
    expect(externalFetch).toHaveBeenCalledWith(
      "https://placeholder.supabase.co/functions/v1/commercial-demo-ai",
      expect.objectContaining({ method: "POST" }),
    );
    expect(infoToast).not.toHaveBeenCalled();
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
