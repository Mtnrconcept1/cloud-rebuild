import { useEffect, useRef, useState, type ComponentType } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  PackageCheck,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  TestTube2,
  Wifi,
  WifiOff,
} from "lucide-react";

import CommercialDemoBrowserGrid from "@/components/commercial/CommercialDemoBrowserGrid";
import CommercialDemoConsoleAi from "@/components/commercial/CommercialDemoConsoleAi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  confirmCommercialDemoCheckout,
  createCommercialDemoSession,
  getCommercialDemoSnapshot,
  resetCommercialDemoSession,
  subscribeToCommercialDemoSession,
  type CommercialDemoSnapshot,
} from "@/lib/commercialDemoJourney";
import { isCommercialDemoFrameMessage, parseCommercialDemoFramePath } from "@/lib/commercialDemoFrame";
import { isStripeTestCheckoutSessionId } from "@/lib/commercialDemoHostSecurity";
import type { CommercialDemoRealtimeStatus } from "@/lib/commercialDemoRealtime";
import { cn } from "@/lib/utils";

const ORDER_STATUS_LABELS: Record<string, string> = {
  awaiting_payment: "Paiement test",
  restaurant_received: "Reçue",
  restaurant_accepted: "Acceptée",
  preparing: "Préparation",
  ready_for_pickup: "Prête",
  picked_up: "Récupérée",
  delivering: "Livraison",
  delivered: "Livrée",
};

const JOURNEY_STEPS = [
  { label: "Commande", statuses: ["awaiting_payment"] },
  { label: "Paiement test", statuses: ["restaurant_received"] },
  { label: "Acceptée", statuses: ["restaurant_accepted"] },
  { label: "Préparation", statuses: ["preparing"] },
  { label: "Prête", statuses: ["ready_for_pickup"] },
  { label: "Récupérée", statuses: ["picked_up"] },
  { label: "Livraison", statuses: ["delivering"] },
  { label: "Livrée", statuses: ["delivered"] },
] as const;

const DEMO_SESSION_STORAGE_KEY = "tok:commercial-demo:active-session";

const REALTIME_PRESENTATION = {
  connecting: { label: "Connexion temps réel…", className: "border-sky-300 text-sky-700", icon: Loader2, animate: true },
  connected: { label: "Temps réel connecté", className: "border-emerald-300 text-emerald-700", icon: Wifi, animate: false },
  reconnecting: { label: "Reconnexion temps réel…", className: "border-amber-300 text-amber-700", icon: RefreshCw, animate: true },
  offline: { label: "Temps réel hors ligne", className: "border-red-300 text-red-700", icon: WifiOff, animate: false },
} satisfies Record<CommercialDemoRealtimeStatus, {
  label: string;
  className: string;
  icon: ComponentType<{ className?: string }>;
  animate: boolean;
}>;

function getInitialCheckoutParams() {
  if (typeof window === "undefined") {
    return { sessionId: "", stripeSessionId: "", returnedFromCheckout: false, checkoutCancelled: false };
  }
  const params = new URLSearchParams(window.location.search);
  let storedSessionId = "";
  try {
    storedSessionId = window.sessionStorage.getItem(DEMO_SESSION_STORAGE_KEY) || "";
  } catch {
    // The demo still works without persistence in restrictive privacy modes.
  }
  const stripeSessionId = params.get("stripe_session_id") || "";
  return {
    sessionId: params.get("demo_session_id") || storedSessionId,
    stripeSessionId: isStripeTestCheckoutSessionId(stripeSessionId) ? stripeSessionId : "",
    returnedFromCheckout: params.get("demo_checkout") === "success"
      && isStripeTestCheckoutSessionId(stripeSessionId),
    checkoutCancelled: params.get("demo_checkout") === "cancelled",
  };
}

function updateDemoSessionUrl(sessionId: string, clearCheckoutParams = true) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(DEMO_SESSION_STORAGE_KEY, sessionId);
  } catch {
    // The in-memory query state remains authoritative for this tab.
  }
  const url = new URL(window.location.href);
  url.searchParams.delete("demo_session_id");
  if (clearCheckoutParams) {
    url.searchParams.delete("stripe_session_id");
    url.searchParams.delete("demo_checkout");
  }
  window.history.replaceState(window.history.state, "", url);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Le scénario de démonstration est momentanément indisponible.";
}

function RealtimeConnectionBadge({ status }: { status: CommercialDemoRealtimeStatus }) {
  const current = REALTIME_PRESENTATION[status];
  const Icon = current.icon;
  return (
    <Badge variant="outline" className={cn("rounded-full", current.className)} role="status" aria-live="polite">
      <Icon className={cn("mr-1.5 h-3.5 w-3.5", current.animate && "animate-spin")} />
      {current.label}
    </Badge>
  );
}

function JourneyProgress({ snapshot }: { snapshot: CommercialDemoSnapshot }) {
  const status = snapshot.order?.status || "";
  const currentIndex = JOURNEY_STEPS.findIndex((step) => (step.statuses as readonly string[]).includes(status));
  return (
    <div>
      <p className="sr-only" role="status" aria-live="polite">Étape actuelle : {ORDER_STATUS_LABELS[status] || "Aucune commande"}</p>
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8" aria-label="Progression de la démonstration">
        {JOURNEY_STEPS.map((step, index) => {
          const done = index <= currentIndex;
          const active = index === currentIndex;
          return (
            <li key={step.label} aria-current={active ? "step" : undefined} className={cn(
              "min-w-0 rounded-2xl border px-3 py-2.5 text-center text-xs font-bold",
              done ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-100" : "bg-muted/20 text-muted-foreground",
              active && "ring-2 ring-emerald-500/25",
            )}><span className="block truncate">{step.label}</span></li>
          );
        })}
      </ol>
    </div>
  );
}

function ActivityFeed({ snapshot }: { snapshot: CommercialDemoSnapshot }) {
  const events = snapshot.events.slice(-8).reverse();
  return (
    <Card className="rounded-[1.75rem] border-border/70">
      <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-lg"><Wifi className="h-5 w-5 text-emerald-600" />Interactions partagées</CardTitle></CardHeader>
      <CardContent>
        {events.length > 0 ? (
          <ol className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" role="log" aria-live="polite" aria-relevant="additions text">
            {events.map((event) => (
              <li key={event.id} className="min-w-0 rounded-2xl border bg-muted/20 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="outline" className="max-w-[70%] truncate text-[10px]">{event.actor_surface}</Badge>
                  <time className="shrink-0 text-[10px] text-muted-foreground">{new Date(event.created_at).toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>
                </div>
                <p className="mt-2 break-words font-semibold">{event.label}</p>
              </li>
            ))}
          </ol>
        ) : <p className="rounded-2xl border border-dashed p-5 text-center text-sm text-muted-foreground">Les interactions apparaîtront ici au lancement du parcours.</p>}
      </CardContent>
    </Card>
  );
}

export default function CommercialMultiSpaceDemo() {
  const [initialParams] = useState(getInitialCheckoutParams);
  const [sessionId, setSessionId] = useState(initialParams.sessionId);
  const [realtimeStatus, setRealtimeStatus] = useState<CommercialDemoRealtimeStatus>(() => (
    typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "connecting"
  ));
  const queryClient = useQueryClient();
  const automaticConfirmationRef = useRef("");

  const bootstrapQuery = useQuery({
    queryKey: ["commercial-demo-bootstrap", sessionId || "new"],
    queryFn: () => sessionId ? Promise.resolve({ id: sessionId }) : createCommercialDemoSession(),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  const effectiveSessionId = sessionId || bootstrapQuery.data?.id || "";

  useEffect(() => {
    if (!effectiveSessionId) return;
    if (!sessionId) setSessionId(effectiveSessionId);
    updateDemoSessionUrl(effectiveSessionId, !initialParams.returnedFromCheckout);
  }, [effectiveSessionId, initialParams.returnedFromCheckout, sessionId]);

  const snapshotQuery = useQuery({
    queryKey: ["commercial-demo-snapshot", effectiveSessionId],
    queryFn: () => getCommercialDemoSnapshot(effectiveSessionId),
    enabled: Boolean(effectiveSessionId),
    refetchOnWindowFocus: true,
    retry: 1,
  });
  const snapshot = snapshotQuery.data;

  useEffect(() => {
    if (!effectiveSessionId) return;
    return subscribeToCommercialDemoSession(effectiveSessionId, () => {
      void queryClient.invalidateQueries({ queryKey: ["commercial-demo-snapshot", effectiveSessionId] });
    }, setRealtimeStatus);
  }, [effectiveSessionId, queryClient]);

  const resetMutation = useMutation({
    mutationFn: () => resetCommercialDemoSession(effectiveSessionId),
    onSuccess: (nextSnapshot) => {
      const nextSessionId = nextSnapshot.session.id;
      setSessionId(nextSessionId);
      updateDemoSessionUrl(nextSessionId);
      queryClient.setQueryData(["commercial-demo-snapshot", nextSessionId], nextSnapshot);
      if (nextSessionId !== effectiveSessionId) {
        queryClient.removeQueries({ queryKey: ["commercial-demo-snapshot", effectiveSessionId], exact: true });
      }
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      if (!snapshot?.session.demo_restaurant_id || !initialParams.stripeSessionId) {
        throw new Error("Session Stripe Test de retour introuvable.");
      }
      return confirmCommercialDemoCheckout({
        demoRestaurantId: snapshot.session.demo_restaurant_id,
        demoSessionId: snapshot.session.id,
        stripeSessionId: initialParams.stripeSessionId,
      });
    },
    onSuccess: (result) => {
      queryClient.setQueryData(["commercial-demo-snapshot", effectiveSessionId], result.snapshot);
      updateDemoSessionUrl(effectiveSessionId);
    },
  });
  const confirmCheckout = confirmMutation.mutate;

  useEffect(() => {
    if (!initialParams.returnedFromCheckout || !initialParams.stripeSessionId || !snapshot) return;
    if (automaticConfirmationRef.current === initialParams.stripeSessionId) return;
    automaticConfirmationRef.current = initialParams.stripeSessionId;
    confirmCheckout();
  }, [confirmCheckout, initialParams.returnedFromCheckout, initialParams.stripeSessionId, snapshot]);

  useEffect(() => {
    if (!effectiveSessionId) return;
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source === window || !isCommercialDemoFrameMessage(event.data)) return;
      if (event.data.sessionId !== effectiveSessionId) return;
      let sourceFrame;
      try {
        sourceFrame = parseCommercialDemoFramePath((event.source as Window | null)?.location.pathname || "");
      } catch {
        return;
      }
      if (!sourceFrame || sourceFrame.surface !== "client" || sourceFrame.sessionId !== effectiveSessionId) return;
      let checkoutUrl: URL;
      try {
        checkoutUrl = new URL(event.data.checkoutUrl);
      } catch {
        return;
      }
      if (checkoutUrl.protocol !== "https:" || checkoutUrl.hostname !== "checkout.stripe.com") return;
      window.location.assign(checkoutUrl.toString());
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [effectiveSessionId]);

  const combinedError = bootstrapQuery.error || snapshotQuery.error || resetMutation.error || confirmMutation.error;
  const startFreshSession = () => {
    try {
      window.sessionStorage.removeItem(DEMO_SESSION_STORAGE_KEY);
    } catch {
      // A fresh URL is sufficient when storage is unavailable.
    }
    window.location.replace(new URL("/commercial/demo-live", window.location.origin).toString());
  };

  if (bootstrapQuery.isLoading || (effectiveSessionId && snapshotQuery.isLoading)) {
    return (
      <div className="flex min-h-[56vh] flex-col items-center justify-center rounded-[2rem] border bg-background/80 p-8 text-center" role="status" aria-live="polite" aria-busy="true">
        <Loader2 className="h-8 w-8 animate-spin text-orange-600" />
        <p className="mt-4 font-black">Ouverture des trois vrais dashboards…</p>
        <p className="mt-2 text-sm text-muted-foreground">Chaque fenêtre initialise son propre routeur, son historique et sa connexion temps réel.</p>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="rounded-[2rem] border border-red-200 bg-red-50 p-6 text-red-900 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-100" role="alert">
        <p className="font-black">Impossible d'ouvrir la démonstration multi-dashboard</p>
        <p className="mt-2 text-sm">{errorMessage(combinedError)}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button type="button" variant="outline" onClick={() => void snapshotQuery.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Réessayer</Button>
          <Button type="button" onClick={startFreshSession}><Play className="mr-2 h-4 w-4" />Nouvelle session</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-3">
      <section className="overflow-hidden rounded-2xl border border-white/70 bg-white/90 p-3 shadow-[0_16px_50px_rgba(15,23,42,0.1)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/78 sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 max-w-4xl">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="rounded-full bg-orange-100 px-3 py-1 text-orange-700 hover:bg-orange-100"><Sparkles className="mr-1.5 h-3.5 w-3.5" />Console commerciale</Badge>
              <RealtimeConnectionBadge status={realtimeStatus} />
              <Badge variant="outline" className="rounded-full border-violet-300 text-violet-700"><TestTube2 className="mr-1.5 h-3.5 w-3.5" />Stripe Test uniquement</Badge>
            </div>
            <h1 className="mt-2 break-words font-serif text-2xl font-black tracking-tight sm:text-3xl">Contrôle à distance des trois comptes</h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">La console pilote simultanément les véritables interfaces Client, Restaurateur et Livreur. Tous les outils actifs dans l’Admin restent disponibles ; seul le paiement utilise Stripe Test.</p>
          </div>
          <Button type="button" variant="outline" className="h-10 shrink-0 rounded-xl" onClick={() => resetMutation.mutate()} disabled={resetMutation.isPending}>
            {resetMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}Réinitialiser
          </Button>
        </div>
        <details className="mt-2 text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none font-semibold text-sky-700"><ShieldCheck className="mr-1.5 inline h-3.5 w-3.5" />Isolation de la démonstration</summary>
          <p className="mt-2 rounded-xl border border-sky-200 bg-sky-50/80 p-3 leading-5 text-sky-950 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-100">Chaque fenêtre charge sa propre SPA et son propre historique. Les actions métier restent confinées au restaurant Démo et à ses tables dédiées ; OpenAI fonctionne côté serveur et les paiements utilisent exclusivement Stripe Test.</p>
        </details>
        {initialParams.checkoutCancelled ? <div className="mt-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" role="status"><strong>Paiement test annulé.</strong> Aucun débit n'a eu lieu ; relancez-le depuis la fenêtre client.</div> : null}
        {confirmMutation.isPending ? <div className="mt-3 flex items-center gap-2 rounded-2xl border bg-muted/30 p-4 text-sm" role="status"><Loader2 className="h-4 w-4 animate-spin" />Vérification serveur du paiement Stripe Test…</div> : null}
      </section>

      {combinedError ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-100" role="alert"><strong>Action non exécutée.</strong> {errorMessage(combinedError)}</div> : null}

      <CommercialDemoBrowserGrid sessionId={snapshot.session.id} />

      <CommercialDemoConsoleAi
        sessionId={snapshot.session.id}
        restaurantName={snapshot.demo_restaurant.name}
      />

      <details className="group rounded-2xl border border-border/70 bg-background/80 p-3 shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-2 py-1 font-semibold marker:hidden">
          <span className="flex items-center gap-2"><Wifi className="h-4 w-4 text-emerald-600" />Progression et journal partagé</span>
          <Badge variant="outline" className="rounded-full">{ORDER_STATUS_LABELS[snapshot.order?.status || ""] || "En attente"}</Badge>
        </summary>
        <div className="mt-4 space-y-4 border-t pt-4">
          <JourneyProgress snapshot={snapshot} />
          <ActivityFeed snapshot={snapshot} />
        </div>
      </details>

      {snapshot.order?.status === "delivered" ? (
        <Card className="overflow-hidden rounded-[1.75rem] border-emerald-200 bg-gradient-to-br from-emerald-50 to-sky-50 dark:border-emerald-400/20 dark:from-emerald-400/10 dark:to-sky-400/10">
          <CardContent className="flex flex-col items-center gap-4 p-6 text-center sm:flex-row sm:text-left">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white"><PackageCheck className="h-6 w-6" /></span>
            <div className="min-w-0 flex-1"><p className="text-xl font-black">Démonstration terminée</p><p className="mt-1 text-sm text-muted-foreground">Les vrais dashboards concernés affichent le statut livré et leur notification correspondante.</p></div>
            <Button type="button" className="rounded-2xl" onClick={() => resetMutation.mutate()}><Play className="mr-2 h-4 w-4" />Rejouer</Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}


