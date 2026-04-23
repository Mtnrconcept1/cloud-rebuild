import { afterEach, describe, expect, it, vi } from "vitest";

const originalDeno = (globalThis as Record<string, unknown>).Deno;

function setMockDenoEnv(env: Record<string, string | undefined>) {
  (globalThis as Record<string, unknown>).Deno = {
    env: {
      get(name: string) {
        return env[name];
      },
    },
  };
}

async function loadCorsModule(env: Record<string, string | undefined>) {
  setMockDenoEnv(env);
  vi.resetModules();
  return import("../../supabase/functions/_shared/cors.ts");
}

afterEach(() => {
  vi.resetModules();

  if (typeof originalDeno === "undefined") {
    delete (globalThis as Record<string, unknown>).Deno;
    return;
  }

  (globalThis as Record<string, unknown>).Deno = originalDeno;
});

describe("supabase edge function cors", () => {
  it("allows the public app origin even when ALLOWED_ORIGINS is unset", async () => {
    const { buildCorsHeaders, handleCorsPreflight } = await loadCorsModule({
      PUBLIC_APP_URL: "https://cloud-rebuild.vercel.app",
    });

    const req = new Request("https://example.supabase.co/functions/v1/test", {
      method: "OPTIONS",
      headers: {
        origin: "https://cloud-rebuild.vercel.app",
      },
    });

    const corsHeaders = buildCorsHeaders(req);
    const preflight = handleCorsPreflight(req, corsHeaders);

    expect(corsHeaders["Access-Control-Allow-Origin"]).toBe("https://cloud-rebuild.vercel.app");
    expect(preflight?.status).toBe(204);
    expect(preflight?.headers.get("Access-Control-Allow-Origin")).toBe("https://cloud-rebuild.vercel.app");
  });

  it("allows the production www.thetok.ch origin from defaults", async () => {
    const { buildCorsHeaders, handleCorsPreflight } = await loadCorsModule({});

    const req = new Request("https://example.supabase.co/functions/v1/test", {
      method: "OPTIONS",
      headers: {
        origin: "https://www.thetok.ch",
      },
    });

    const corsHeaders = buildCorsHeaders(req);
    const preflight = handleCorsPreflight(req, corsHeaders);

    expect(corsHeaders["Access-Control-Allow-Origin"]).toBe("https://www.thetok.ch");
    expect(preflight?.status).toBe(204);
    expect(preflight?.headers.get("Access-Control-Allow-Origin")).toBe("https://www.thetok.ch");
  });
});
