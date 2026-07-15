import { useLayoutEffect, useState, type ReactNode } from "react";
import { ShieldCheck } from "lucide-react";

import {
  isCommercialDemoHost,
  shouldBlockCommercialDemoHostRequest,
} from "@/lib/commercialDemoHostSecurity";

type HostGuardState = {
  count: number;
  originalFetch: typeof window.fetch;
};

let hostGuardState: HostGuardState | null = null;

function getRequestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function getRequestMethod(input: RequestInfo | URL, init?: RequestInit) {
  const requestMethod = typeof Request !== "undefined" && input instanceof Request
    ? input.method
    : undefined;
  return String(init?.method || requestMethod || "GET").toUpperCase();
}

function buildBlockedResponse(input: RequestInfo | URL, init?: RequestInit) {
  const requestUrl = new URL(getRequestUrl(input), window.location.origin);
  const method = getRequestMethod(input, init);
  window.dispatchEvent(new CustomEvent("tok:commercial-demo:production-transaction-blocked", {
    detail: { method, path: requestUrl.pathname },
  }));

  return new Response(JSON.stringify({
    code: "COMMERCIAL_DEMO_PRODUCTION_TRANSACTION_BLOCKED",
    message: "Ce domaine utilise exclusivement les commandes, réservations et paiements de démonstration.",
  }), {
    status: 403,
    headers: {
      "Content-Type": "application/json",
      "X-TOK-Commercial-Demo": "production-transaction-blocked",
    },
  });
}

function acquireCommercialDemoHostGuard() {
  if (hostGuardState) {
    hostGuardState.count += 1;
    return releaseCommercialDemoHostGuard;
  }

  const originalFetch = window.fetch.bind(window);
  hostGuardState = { count: 1, originalFetch };
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (shouldBlockCommercialDemoHostRequest({
      rawUrl: getRequestUrl(input),
      method: getRequestMethod(input, init),
      currentOrigin: window.location.origin,
      currentHostname: window.location.hostname,
    })) {
      return buildBlockedResponse(input, init);
    }
    return originalFetch(input, init);
  };

  return releaseCommercialDemoHostGuard;
}

function releaseCommercialDemoHostGuard() {
  if (!hostGuardState) return;
  hostGuardState.count -= 1;
  if (hostGuardState.count > 0) return;
  window.fetch = hostGuardState.originalFetch;
  hostGuardState = null;
}

export default function CommercialDemoHostSecurityBoundary({ children }: { children: ReactNode }) {
  const shouldGuard = typeof window !== "undefined" && isCommercialDemoHost(window.location.hostname);
  const [ready, setReady] = useState(!shouldGuard);

  useLayoutEffect(() => {
    if (!shouldGuard) {
      setReady(true);
      return;
    }

    const release = acquireCommercialDemoHostGuard();
    setReady(true);
    return release;
  }, [shouldGuard]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6 text-center" role="status">
        <div className="rounded-2xl border bg-card p-5 shadow-sm">
          <ShieldCheck className="mx-auto h-6 w-6 text-emerald-600" />
          <p className="mt-3 text-sm font-semibold">Sécurisation de l’environnement de démonstration…</p>
        </div>
      </div>
    );
  }

  return children;
}



