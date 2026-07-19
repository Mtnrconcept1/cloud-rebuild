import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, LayoutGrid, Loader2, RefreshCw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  createCommercialDemoSession,
  getCommercialDemoSnapshot,
} from "@/lib/commercialDemoJourney";
import { buildCommercialDemoFrameUrl } from "@/lib/commercialDemoFrame";
import {
  DEMO_WORKSPACES,
  type DemoWorkspaceSurface,
} from "@/lib/demoWorkspaces";
import { getCommercialNavigationHref } from "@/lib/commercialDomains";

const DEMO_SESSION_STORAGE_KEY = "tok:commercial-demo:active-session";

const SURFACE_HOME: Record<DemoWorkspaceSurface, string> = {
  client: "/mon-espace",
  restaurant: "/dashboard",
  courier: "/courier",
};

function getStoredSessionId() {
  if (typeof window === "undefined") return "";
  try {
    return window.sessionStorage.getItem(DEMO_SESSION_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function persistSessionId(sessionId: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(DEMO_SESSION_STORAGE_KEY, sessionId);
  } catch {
    // The React Query cache remains authoritative for the current page.
  }
}

function clearStoredSessionId() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(DEMO_SESSION_STORAGE_KEY);
  } catch {
    // Reloading still creates a fresh in-memory bootstrap attempt.
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Cet espace est momentanément indisponible.";
}

export default function CommercialSingleSpaceDemo({
  surface,
}: {
  surface: DemoWorkspaceSurface;
}) {
  const [storedSessionId] = useState(getStoredSessionId);
  const [frameVersion, setFrameVersion] = useState(0);
  const workspace = DEMO_WORKSPACES.find((entry) => entry.surface === surface);

  const bootstrapQuery = useQuery({
    queryKey: ["commercial-demo-single-bootstrap", storedSessionId || "new"],
    queryFn: () => storedSessionId
      ? Promise.resolve({ id: storedSessionId })
      : createCommercialDemoSession(),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });

  const sessionId = bootstrapQuery.data?.id || "";
  const snapshotQuery = useQuery({
    queryKey: ["commercial-demo-single-snapshot", sessionId],
    queryFn: () => getCommercialDemoSnapshot(sessionId),
    enabled: Boolean(sessionId),
    retry: false,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (sessionId) persistSessionId(sessionId);
  }, [sessionId]);

  const frameUrl = useMemo(
    () => sessionId
      ? buildCommercialDemoFrameUrl(surface, sessionId, SURFACE_HOME[surface])
      : "",
    [sessionId, surface],
  );

  const returnHref = getCommercialNavigationHref("/commercial");
  const multiDashboardHref = getCommercialNavigationHref("/commercial/demo-live");
  const error = bootstrapQuery.error || snapshotQuery.error;

  if (!workspace) return null;

  if (bootstrapQuery.isLoading || (sessionId && snapshotQuery.isLoading)) {
    return (
      <main
        className="flex min-h-screen flex-col items-center justify-center bg-background p-8 text-center"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-4 font-semibold">Ouverture de {workspace.shortLabel.toLowerCase()}…</p>
        <p className="mt-2 text-sm text-muted-foreground">Préparation de la session sécurisée.</p>
      </main>
    );
  }

  if (error || !sessionId || !snapshotQuery.data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <section className="w-full max-w-lg rounded-3xl border border-destructive/30 bg-card p-6 text-center shadow-xl" role="alert">
          <h1 className="font-display text-xl font-bold">Impossible d’ouvrir cet espace</h1>
          <p className="mt-2 text-sm text-muted-foreground">{getErrorMessage(error)}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button
              type="button"
              onClick={() => {
                clearStoredSessionId();
                window.location.reload();
              }}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Réessayer
            </Button>
            <Button asChild variant="outline">
              <a href={returnHref}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Retour à l’espace commercial
              </a>
            </Button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="fixed inset-0 z-[1500] flex min-h-0 flex-col overflow-hidden bg-background">
      <header className="flex min-h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-2 shadow-sm backdrop-blur sm:px-4">
        <Button asChild variant="ghost" size="sm" className="shrink-0">
          <a href={returnHref}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Espace commercial</span>
            <span className="sm:hidden">Retour</span>
          </a>
        </Button>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-sm font-bold">{workspace.label}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0"
          onClick={() => setFrameVersion((version) => version + 1)}
          aria-label="Actualiser le dashboard"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
        <Button asChild variant="outline" size="sm" className="shrink-0">
          <a href={multiDashboardHref}>
            <LayoutGrid className="mr-2 h-4 w-4" />
            <span className="hidden md:inline">Vue multi-dashboard</span>
            <span className="md:hidden">Multi</span>
          </a>
        </Button>
      </header>

      <iframe
        key={`${frameUrl}:${frameVersion}`}
        src={frameUrl}
        title={workspace.label}
        className="min-h-0 w-full flex-1 border-0 bg-background"
        loading="eager"
        referrerPolicy="no-referrer"
        data-testid={`commercial-demo-single-frame-${surface}`}
      />
    </main>
  );
}
