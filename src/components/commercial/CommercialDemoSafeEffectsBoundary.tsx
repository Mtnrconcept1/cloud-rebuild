import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";
import { shouldProtectCommercialDemoRequest } from "@/lib/commercialDemoEffects";

export type CommercialDemoProtectedTool =
  | "advisor"
  | "actualites"
  | "billing"
  | "pack"
  | "campaigns"
  | "social"
  | "photos"
  | "support"
  | "tok-connect"
  | "accounting-inflow"
  | "accounting-outflow";

const TOOL_LABELS: Record<CommercialDemoProtectedTool, string> = {
  advisor: "Assistant IA",
  actualites: "Actualités",
  billing: "Facturation",
  pack: "Pack restaurateur",
  campaigns: "Campagnes",
  social: "Réseaux sociaux",
  photos: "Photos",
  support: "Support",
  "tok-connect": "TOK Connect",
  "accounting-inflow": "Recettes",
  "accounting-outflow": "Dépenses",
};

const REAL_OPENAI_DEMO_TOOLS = new Set<CommercialDemoProtectedTool>([
  "advisor",
  "actualites",
  "campaigns",
  "social",
  "photos",
  "support",
]);

type FetchGuardState = {
  count: number;
  originalFetch: typeof window.fetch;
};

let fetchGuardState: FetchGuardState | null = null;

function getRequestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function getRequestMethod(input: RequestInfo | URL, init?: RequestInit) {
  const inputMethod = typeof Request !== "undefined" && input instanceof Request ? input.method : undefined;
  return String(init?.method || inputMethod || "GET").toUpperCase();
}

function getRequestHeader(input: RequestInfo | URL, init: RequestInit | undefined, name: string) {
  const headers = new Headers(
    init?.headers || (typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined),
  );
  return headers.get(name) || "";
}

async function parseRequestBody(input: RequestInfo | URL, init?: RequestInit) {
  const explicitBody = init?.body;
  if (typeof explicitBody === "string") {
    try {
      return JSON.parse(explicitBody) as unknown;
    } catch {
      return null;
    }
  }

  if (typeof Request !== "undefined" && input instanceof Request) {
    try {
      const text = await input.clone().text();
      return text ? JSON.parse(text) as unknown : null;
    } catch {
      return null;
    }
  }

  return null;
}

function buildDemoRow(body: unknown) {
  const now = new Date().toISOString();
  const id = globalThis.crypto?.randomUUID?.() || `demo-${Date.now()}`;
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return { ...(body as Record<string, unknown>), id, created_at: now, updated_at: now };
  }
  return { id, created_at: now, updated_at: now, demo: true };
}

async function buildProtectedResponse(input: RequestInfo | URL, init?: RequestInit) {
  const url = new URL(getRequestUrl(input), window.location.origin);
  const method = getRequestMethod(input, init);
  const body = await parseRequestBody(input, init);
  let payload: unknown = { ok: true, demo: true };

  if (url.pathname.includes("/storage/v1/object")) {
    payload = { Key: "commercial-demo/local-preview", Id: `demo-${Date.now()}` };
  } else if (url.pathname.includes("/rest/v1/") && !url.pathname.includes("/rpc/")) {
    const row = buildDemoRow(body);
    const expectsSingleObject = getRequestHeader(input, init, "accept").includes("application/vnd.pgrst.object+json");
    payload = method === "DELETE" ? [] : expectsSingleObject ? row : [row];
  }

  window.dispatchEvent(new CustomEvent("tok:commercial-demo:effect-simulated", {
    detail: { method, path: url.pathname },
  }));

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "X-TOK-Commercial-Demo": "simulated",
    },
  });
}

function acquireCommercialDemoFetchGuard() {
  if (fetchGuardState) {
    fetchGuardState.count += 1;
    return releaseCommercialDemoFetchGuard;
  }

  const originalFetch = window.fetch.bind(window);
  fetchGuardState = { count: 1, originalFetch };
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = getRequestMethod(input, init);
    const url = getRequestUrl(input);
    if (shouldProtectCommercialDemoRequest(url, method, window.location.origin)) {
      return buildProtectedResponse(input, init);
    }
    return originalFetch(input, init);
  };

  return releaseCommercialDemoFetchGuard;
}

function releaseCommercialDemoFetchGuard() {
  if (!fetchGuardState) return;
  fetchGuardState.count -= 1;
  if (fetchGuardState.count > 0) return;
  window.fetch = fetchGuardState.originalFetch;
  fetchGuardState = null;
}

export default function CommercialDemoSafeEffectsBoundary({
  tool,
  children,
}: {
  tool: CommercialDemoProtectedTool;
  children: ReactNode;
}) {
  const frame = useCommercialDemoFrame();
  const isRestaurantDemo = frame?.surface === "restaurant";
  const usesRealOpenAi = REAL_OPENAI_DEMO_TOOLS.has(tool);
  const [guardReady, setGuardReady] = useState(!isRestaurantDemo);
  const lastNoticeAtRef = useRef(0);

  useLayoutEffect(() => {
    if (!isRestaurantDemo) {
      setGuardReady(true);
      return;
    }

    const release = acquireCommercialDemoFetchGuard();
    const handleSimulatedEffect = () => {
      const now = Date.now();
      if (now - lastNoticeAtRef.current < 1200) return;
      lastNoticeAtRef.current = now;
      toast.info("Action enregistrée dans l’espace Démo", {
        description: usesRealOpenAi
          ? `${TOOL_LABELS[tool]} utilise OpenAI côté serveur ; les données restent rattachées au restaurant Démo.`
          : `${TOOL_LABELS[tool]} est opérationnel dans l’espace Démo, sans toucher aux établissements réels.`,
      });
    };
    window.addEventListener("tok:commercial-demo:effect-simulated", handleSimulatedEffect);
    setGuardReady(true);

    return () => {
      window.removeEventListener("tok:commercial-demo:effect-simulated", handleSimulatedEffect);
      release();
    };
  }, [isRestaurantDemo, tool, usesRealOpenAi]);

  if (isRestaurantDemo && !guardReady) {
    return (
      <div className="flex min-h-[12rem] items-center justify-center text-sm text-muted-foreground">
        Préparation du module de démonstration…
      </div>
    );
  }

  return (
    <>
      {children}
      {isRestaurantDemo ? (
        <div
          className="pointer-events-none fixed bottom-3 right-3 z-[1450] flex max-w-[min(22rem,calc(100vw-1.5rem))] items-center gap-2 rounded-full border border-emerald-300/70 bg-background/95 px-3 py-2 text-xs font-semibold text-emerald-800 shadow-lg backdrop-blur dark:border-emerald-400/30 dark:text-emerald-200"
          data-testid={`commercial-demo-real-tool-${tool}`}
          role="status"
        >
          <ShieldCheck className="h-4 w-4 shrink-0" />
          <span className="truncate">
            {usesRealOpenAi
              ? `${TOOL_LABELS[tool]} · OpenAI serveur · restaurant Démo actif · coût suivi en interne`
              : `${TOOL_LABELS[tool]} · outil opérationnel · données Démo isolées`}
          </span>
        </div>
      ) : null}
    </>
  );
}
