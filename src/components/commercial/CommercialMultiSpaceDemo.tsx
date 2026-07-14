import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bike,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock3,
  CreditCard,
  Loader2,
  MapPin,
  PackageCheck,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  TestTube2,
  UserRound,
  Wifi,
  WifiOff,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CommercialDemoApiError,
  confirmCommercialDemoCheckout,
  createCommercialDemoCheckout,
  createCommercialDemoOrder,
  createCommercialDemoSession,
  getCommercialDemoPresetItems,
  getCommercialDemoSnapshot,
  resetCommercialDemoSession,
  subscribeToCommercialDemoSession,
  transitionCommercialDemoOrder,
  type CommercialDemoSnapshot,
  type CommercialDemoSurface,
  type CommercialDemoTransitionAction,
} from "@/lib/commercialDemoJourney";
import type { CommercialDemoRealtimeStatus } from "@/lib/commercialDemoRealtime";
import { cn } from "@/lib/utils";

type DemoAction = CommercialDemoTransitionAction | "create_order" | "reset";

const ORDER_STATUS_LABELS: Record<string, string> = {
  awaiting_payment: "Paiement test attendu",
  paid: "Payée",
  restaurant_received: "Reçue par le restaurant",
  restaurant_accepted: "Acceptée",
  preparing: "En préparation",
  ready_for_pickup: "Prête à récupérer",
  picked_up: "Récupérée par le livreur",
  delivering: "En livraison",
  delivered: "Livrée",
  cancelled: "Annulée",
};

const MISSION_STATUS_LABELS: Record<string, string> = {
  pending: "Mission en attente",
  available: "Mission disponible",
  mission_available: "Mission disponible",
  accepted: "Mission acceptée",
  at_restaurant: "Livreur au restaurant",
  picked_up: "Commande récupérée",
  delivering: "Livraison en cours",
  delivered: "Livraison terminée",
};

const ACTION_LABELS: Record<CommercialDemoTransitionAction, string> = {
  restaurant_accept: "Accepter la commande",
  restaurant_start_preparing: "Démarrer la préparation",
  restaurant_mark_ready: "Marquer prête",
  courier_accept: "Accepter la mission",
  courier_arrived_pickup: "Je suis au restaurant",
  courier_confirm_pickup: "Confirmer la récupération",
  courier_start_delivery: "Démarrer la livraison",
  courier_confirm_delivery: "Confirmer la livraison",
};

const JOURNEY_STEPS = [
  { label: "Commande", statuses: ["awaiting_payment"] },
  { label: "Paiement test", statuses: ["paid", "restaurant_received"] },
  { label: "Acceptée", statuses: ["restaurant_accepted"] },
  { label: "Préparation", statuses: ["preparing"] },
  { label: "Prête", statuses: ["ready_for_pickup"] },
  { label: "Récupérée", statuses: ["picked_up"] },
  { label: "Livraison", statuses: ["delivering"] },
  { label: "Livrée", statuses: ["delivered"] },
] as const;

const REALTIME_PRESENTATION = {
  connecting: {
    label: "Connexion temps réel…",
    className: "border-sky-300 text-sky-700 dark:text-sky-200",
    icon: Loader2,
    animate: true,
  },
  connected: {
    label: "Temps réel connecté",
    className: "border-emerald-300 text-emerald-700 dark:text-emerald-200",
    icon: Wifi,
    animate: false,
  },
  reconnecting: {
    label: "Reconnexion temps réel…",
    className: "border-amber-300 text-amber-700 dark:text-amber-200",
    icon: RefreshCw,
    animate: true,
  },
  offline: {
    label: "Temps réel hors ligne",
    className: "border-red-300 text-red-700 dark:text-red-200",
    icon: WifiOff,
    animate: false,
  },
} satisfies Record<CommercialDemoRealtimeStatus, {
  label: string;
  className: string;
  icon: ComponentType<{ className?: string }>;
  animate: boolean;
}>;

function formatChf(cents: number) {
  return new Intl.NumberFormat("fr-CH", { style: "currency", currency: "CHF" }).format((Number(cents) || 0) / 100);
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("fr-CH", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value));
}

function getInitialCheckoutParams() {
  if (typeof window === "undefined") {
    return { sessionId: "", stripeSessionId: "", returnedFromCheckout: false, checkoutCancelled: false };
  }
  const params = new URLSearchParams(window.location.search);
  return {
    sessionId: params.get("demo_session_id") || "",
    stripeSessionId: params.get("stripe_session_id") || "",
    returnedFromCheckout: params.get("demo_checkout") === "success",
    checkoutCancelled: params.get("demo_checkout") === "cancelled",
  };
}

function updateDemoSessionUrl(sessionId: string) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("demo_session_id", sessionId);
  url.searchParams.delete("stripe_session_id");
  url.searchParams.delete("demo_checkout");
  window.history.replaceState(window.history.state, "", url);
}

function buildCheckoutReturnUrl(sessionId: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("demo_session_id", sessionId);
  url.searchParams.delete("stripe_session_id");
  url.searchParams.delete("demo_checkout");
  return url.toString();
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Le scénario de démonstration est momentanément indisponible.";
}

function SurfaceShell({
  surface,
  title,
  subtitle,
  icon: Icon,
  tone,
  children,
}: {
  surface: Exclude<CommercialDemoSurface, "system">;
  title: string;
  subtitle: string;
  icon: ComponentType<{ className?: string }>;
  tone: "sky" | "orange" | "emerald";
  children: ReactNode;
}) {
  const tones = {
    sky: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-200",
    orange: "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-400/20 dark:bg-orange-400/10 dark:text-orange-200",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200",
  };

  return (
    <Card data-demo-surface={surface} className="min-w-0 overflow-hidden rounded-[1.75rem] border-border/70 bg-background/95 shadow-[0_18px_52px_rgba(15,23,42,0.09)]">
      <CardHeader className="border-b border-border/60 p-4 sm:p-5">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border", tones[tone])}>
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <CardTitle className="truncate text-lg">{title}</CardTitle>
              <p className="mt-1 truncate text-xs text-muted-foreground">{subtitle}</p>
            </div>
          </div>
          <Badge variant="outline" className="shrink-0 rounded-full text-[10px]">DÉMO</Badge>
        </div>
      </CardHeader>
      <CardContent className="min-w-0 space-y-4 p-4 sm:p-5">{children}</CardContent>
    </Card>
  );
}

function WaitingState({ icon: Icon, title, detail }: { icon: ComponentType<{ className?: string }>; title: string; detail: string }) {
  return (
    <div className="flex min-h-52 flex-col items-center justify-center rounded-2xl border border-dashed bg-muted/20 p-5 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <Icon className="h-5 w-5" />
      </span>
      <p className="mt-4 font-black">{title}</p>
      <p className="mt-2 max-w-xs text-sm leading-6 text-muted-foreground">{detail}</p>
    </div>
  );
}

function LiveStatus({ label, detail }: { label: string; detail?: string }) {
  return (
    <div className="rounded-2xl border bg-muted/25 p-4" role="status" aria-live="polite" aria-atomic="true">
      <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
        <CircleDot className="h-3.5 w-3.5 text-emerald-600" />
        Statut en direct
      </p>
      <p className="mt-2 break-words text-lg font-black">{label}</p>
      {detail ? <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

function RealtimeConnectionBadge({ status }: { status: CommercialDemoRealtimeStatus }) {
  const current = REALTIME_PRESENTATION[status];
  const Icon = current.icon;

  return (
    <span role="status" aria-live="polite" aria-atomic="true">
      <Badge variant="outline" className={cn("rounded-full", current.className)}>
        <Icon className={cn("mr-1.5 h-3.5 w-3.5", current.animate && "animate-spin")} />
        {current.label}
      </Badge>
    </span>
  );
}

function ActionButton({
  action,
  onAction,
  pending,
  variant = "default",
}: {
  action: CommercialDemoTransitionAction;
  onAction: (action: CommercialDemoTransitionAction) => void;
  pending: boolean;
  variant?: "default" | "outline";
}) {
  return (
    <Button type="button" variant={variant} className="h-auto min-h-11 w-full whitespace-normal rounded-2xl py-3" onClick={() => onAction(action)} disabled={pending}>
      {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ChevronRight className="mr-2 h-4 w-4" />}
      {ACTION_LABELS[action]}
    </Button>
  );
}

function ClientSurface({
  snapshot,
  actionPending,
  checkoutPending,
  confirmPending,
  checkoutError,
  checkoutCancelled,
  onCreateOrder,
  onOpenCheckout,
  onConfirmCheckout,
}: {
  snapshot: CommercialDemoSnapshot;
  actionPending: boolean;
  checkoutPending: boolean;
  confirmPending: boolean;
  checkoutError: unknown;
  checkoutCancelled: boolean;
  onCreateOrder: () => void;
  onOpenCheckout: () => void;
  onConfirmCheckout: () => void;
}) {
  const order = snapshot.order;
  const presetItems = getCommercialDemoPresetItems();
  const paymentPending = order && !["paid", "succeeded", "test_paid"].includes(order.payment_status);
  const stripeConfigMissing = checkoutError instanceof CommercialDemoApiError
    && ["DEMO_STRIPE_NOT_CONFIGURED", "INVALID_TEST_STRIPE_KEY"].includes(checkoutError.code);

  return (
    <SurfaceShell surface="client" title="Espace client" subtitle="Sophie Martin · Genève" icon={UserRound} tone="sky">
      {!order ? (
        <>
          <div className="space-y-3">
            {presetItems.map((item) => (
              <div key={item.name} className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border p-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-bold">{item.quantity}× {item.name}</p>
                  <p className="text-xs text-muted-foreground">Restaurant Démo TOK</p>
                </div>
                <p className="shrink-0 font-black">{formatChf(item.quantity * item.unit_amount_cents)}</p>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between rounded-2xl bg-sky-50 p-4 text-sky-950 dark:bg-sky-400/10 dark:text-sky-100">
            <span className="text-sm font-semibold">Total de démonstration</span>
            <strong>{formatChf(presetItems.reduce((total, item) => total + item.quantity * item.unit_amount_cents, 0))}</strong>
          </div>
          <Button type="button" className="h-12 w-full rounded-2xl" onClick={onCreateOrder} disabled={actionPending}>
            {actionPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShoppingBag className="mr-2 h-4 w-4" />}
            Créer la commande test
          </Button>
        </>
      ) : (
        <>
          <LiveStatus
            label={ORDER_STATUS_LABELS[order.status] || order.status}
            detail={`${order.order_number} · ${formatChf(order.total_amount_cents)}`}
          />
          <div className="rounded-2xl border p-4 text-sm">
            <p className="font-bold">Livraison</p>
            <p className="mt-1 flex min-w-0 items-start gap-2 text-muted-foreground">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="min-w-0 break-words">{order.delivery_address}</span>
            </p>
          </div>
          {paymentPending ? (
            <div className="space-y-3">
              {checkoutCancelled ? (
                <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-100" role="status" aria-live="polite">
                  <p className="font-black">Paiement test annulé</p>
                  <p className="mt-1 leading-5">Aucun débit n'a été effectué. La commande est conservée : vous pouvez relancer le paiement.</p>
                </div>
              ) : null}
              <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-950 dark:border-violet-400/20 dark:bg-violet-400/10 dark:text-violet-100">
                <p className="font-black">Carte Stripe Test à utiliser</p>
                <p className="mt-1 leading-5"><code className="font-mono font-bold">4242 4242 4242 4242</code> · date future · CVC à 3 chiffres au choix.</p>
                <p className="mt-1 text-xs">N'utilisez jamais une vraie carte bancaire dans cette démonstration.</p>
              </div>
              <Button type="button" className="h-12 w-full rounded-2xl bg-[#635bff] text-white hover:bg-[#5148e5]" onClick={onOpenCheckout} disabled={checkoutPending}>
                {checkoutPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
                Payer avec Stripe Test
              </Button>
              <Button type="button" variant="outline" className="h-11 w-full rounded-2xl" onClick={onConfirmCheckout} disabled={confirmPending}>
                {confirmPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Vérifier le paiement test
              </Button>
              <p className="text-center text-[11px] leading-5 text-muted-foreground">
                Seule une session <strong>Stripe Test</strong> confirmée par le serveur débloque la suite.
              </p>
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-100">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
              <div><p className="font-black">Paiement test confirmé</p><p className="mt-1 text-xs">Aucun débit réel n'a été effectué.</p></div>
            </div>
          )}
          {checkoutError ? (
            <div role="alert" aria-live="assertive" className={cn(
              "rounded-2xl border p-4 text-sm",
              stripeConfigMissing
                ? "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-100"
                : "border-red-200 bg-red-50 text-red-800 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-100",
            )}>
              <p className="font-black">{stripeConfigMissing ? "Stripe Test n'est pas encore configuré" : "Paiement test indisponible"}</p>
              <p className="mt-1 leading-5">{errorMessage(checkoutError)}</p>
              {stripeConfigMissing ? <p className="mt-2 text-xs">Action admin : configurer le secret serveur STRIPE_SECRET_KEY_TEST avec une clé sk_test_ ou rk_test_.</p> : null}
            </div>
          ) : null}
        </>
      )}
    </SurfaceShell>
  );
}

function RestaurantSurface({
  snapshot,
  actionPending,
  onAction,
}: {
  snapshot: CommercialDemoSnapshot;
  actionPending: boolean;
  onAction: (action: CommercialDemoTransitionAction) => void;
}) {
  const order = snapshot.order;
  const can = (action: CommercialDemoTransitionAction) => snapshot.allowed_actions.includes(action);
  const actions = (["restaurant_accept", "restaurant_start_preparing", "restaurant_mark_ready"] as const).filter(can);

  return (
    <SurfaceShell surface="restaurant" title="Espace restaurateur" subtitle="Restaurant Démo TOK" icon={Store} tone="orange">
      {!order || !["paid", "succeeded", "test_paid"].includes(order.payment_status) ? (
        <WaitingState icon={Clock3} title="En attente de commande payée" detail="La commande apparaît ici seulement après confirmation Stripe Test côté serveur." />
      ) : (
        <>
          <LiveStatus label={ORDER_STATUS_LABELS[order.status] || order.status} detail={`${order.order_number} · ${order.customer_name}`} />
          <div className="space-y-2 rounded-2xl border p-4 text-sm">
            <p className="font-black">Détail cuisine</p>
            {order.items.map((item) => (
              <div key={item.name} className="flex min-w-0 items-center justify-between gap-3 text-muted-foreground">
                <span className="min-w-0 truncate">{item.quantity}× {item.name}</span>
                <span className="shrink-0">{formatChf(item.quantity * item.unit_amount_cents)}</span>
              </div>
            ))}
          </div>
          {actions.length > 0 ? (
            <div className="space-y-2">
              {actions.map((action) => <ActionButton key={action} action={action} onAction={onAction} pending={actionPending} />)}
            </div>
          ) : (
            <p className="rounded-2xl border border-dashed p-4 text-center text-sm text-muted-foreground">
              {order.status === "delivered"
                ? "Commande livrée : le parcours de démonstration est terminé."
                : "La prochaine action appartient au client ou au livreur."}
            </p>
          )}
        </>
      )}
    </SurfaceShell>
  );
}

function CourierSurface({
  snapshot,
  actionPending,
  onAction,
}: {
  snapshot: CommercialDemoSnapshot;
  actionPending: boolean;
  onAction: (action: CommercialDemoTransitionAction) => void;
}) {
  const mission = snapshot.mission;
  const can = (action: CommercialDemoTransitionAction) => snapshot.allowed_actions.includes(action);
  const actions = ([
    "courier_accept",
    "courier_arrived_pickup",
    "courier_confirm_pickup",
    "courier_start_delivery",
    "courier_confirm_delivery",
  ] as const).filter(can);

  return (
    <SurfaceShell surface="courier" title="Espace livreur" subtitle="Fac-similé sans rôle livreur" icon={Bike} tone="emerald">
      {!mission ? (
        <WaitingState icon={Bike} title="Aucune mission pour le moment" detail="La mission est publiée automatiquement par le scénario lorsque la commande devient éligible." />
      ) : (
        <>
          <LiveStatus label={MISSION_STATUS_LABELS[mission.status] || mission.status} detail={mission.courier_name || "Livreur Démo TOK"} />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <div className="rounded-2xl border p-3 text-sm">
              <p className="text-xs text-muted-foreground">Retrait</p>
              <p className="mt-1 font-bold">Restaurant Démo TOK</p>
            </div>
            <div className="rounded-2xl border p-3 text-sm">
              <p className="text-xs text-muted-foreground">Destination</p>
              <p className="mt-1 break-words font-bold">{snapshot.order?.delivery_address}</p>
            </div>
          </div>
          {actions.length > 0 ? (
            <div className="space-y-2">
              {actions.map((action) => <ActionButton key={action} action={action} onAction={onAction} pending={actionPending} />)}
            </div>
          ) : (
            <p className="rounded-2xl border border-dashed p-4 text-center text-sm text-muted-foreground">
              {mission.status === "delivered"
                ? "Livraison terminée : aucune autre action n'est requise."
                : "En attente de la prochaine étape du restaurant."}
            </p>
          )}
        </>
      )}
    </SurfaceShell>
  );
}

function JourneyProgress({ snapshot }: { snapshot: CommercialDemoSnapshot }) {
  const orderStatus = snapshot.order?.status || "";
  const currentIndex = JOURNEY_STEPS.findIndex((step) => (step.statuses as readonly string[]).includes(orderStatus));
  const completedIndex = currentIndex >= 0 ? currentIndex : -1;
  const currentLabel = currentIndex >= 0 ? JOURNEY_STEPS[currentIndex].label : "Aucune commande créée";

  return (
    <div>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">Étape actuelle : {currentLabel}</p>
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8" aria-label="Progression de la démonstration">
        {JOURNEY_STEPS.map((step, index) => {
          const done = index <= completedIndex;
          const active = index === completedIndex;
          return (
            <li key={step.label} aria-current={active ? "step" : undefined} className={cn(
              "min-w-0 rounded-2xl border px-3 py-2.5 text-center text-xs font-bold transition-colors",
              done ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-100" : "bg-muted/20 text-muted-foreground",
              active && "ring-2 ring-emerald-500/25",
            )}>
              <span className="block truncate">{step.label}</span>
            </li>
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
      <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-lg"><Wifi className="h-5 w-5 text-emerald-600" />Interactions en temps réel</CardTitle></CardHeader>
      <CardContent>
        {events.length > 0 ? (
          <ol className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" role="log" aria-live="polite" aria-relevant="additions text">
            {events.map((event) => (
              <li key={event.id} className="min-w-0 rounded-2xl border bg-muted/20 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="outline" className="max-w-[70%] truncate text-[10px]">{event.actor_surface}</Badge>
                  <time className="shrink-0 text-[10px] text-muted-foreground">{formatTime(event.created_at)}</time>
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
  const [stripeSessionId, setStripeSessionId] = useState(initialParams.stripeSessionId);
  const [checkoutCancelled, setCheckoutCancelled] = useState(initialParams.checkoutCancelled);
  const [realtimeStatus, setRealtimeStatus] = useState<CommercialDemoRealtimeStatus>(() => (
    typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "connecting"
  ));
  const [selectedScenario, setSelectedScenario] = useState("delivery_order");
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
    if (!effectiveSessionId || sessionId) return;
    setSessionId(effectiveSessionId);
    updateDemoSessionUrl(effectiveSessionId);
  }, [effectiveSessionId, sessionId]);

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
    setRealtimeStatus(typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "connecting");
    return subscribeToCommercialDemoSession(effectiveSessionId, () => {
      void queryClient.invalidateQueries({ queryKey: ["commercial-demo-snapshot", effectiveSessionId] });
    }, setRealtimeStatus);
  }, [effectiveSessionId, queryClient]);

  useEffect(() => {
    if (!initialParams.checkoutCancelled || !effectiveSessionId) return;
    updateDemoSessionUrl(effectiveSessionId);
  }, [effectiveSessionId, initialParams.checkoutCancelled]);

  const actionMutation = useMutation({
    mutationFn: async (action: DemoAction) => {
      if (!effectiveSessionId) throw new Error("Session de démonstration introuvable.");
      if (action === "create_order") return createCommercialDemoOrder(effectiveSessionId);
      if (action === "reset") return resetCommercialDemoSession(effectiveSessionId);
      if (!snapshot?.order) throw new Error("Commande de démonstration introuvable.");
      return transitionCommercialDemoOrder({ orderId: snapshot.order.id, action, expectedVersion: snapshot.order.version });
    },
    onSuccess: (nextSnapshot, action) => {
      const nextSessionId = nextSnapshot.session.id;
      const nextQueryKey = ["commercial-demo-snapshot", nextSessionId];
      queryClient.setQueryData(nextQueryKey, nextSnapshot);
      if (action === "reset" && nextSessionId !== effectiveSessionId) {
        setSessionId(nextSessionId);
        updateDemoSessionUrl(nextSessionId);
        queryClient.removeQueries({ queryKey: ["commercial-demo-snapshot", effectiveSessionId], exact: true });
      }
      if (action === "reset") setCheckoutCancelled(false);
      setStripeSessionId("");
    },
  });

  const checkoutMutation = useMutation({
    onMutate: () => setCheckoutCancelled(false),
    mutationFn: async () => {
      if (!snapshot?.session.demo_restaurant_id) throw new Error("Restaurant de démonstration introuvable.");
      const result = await createCommercialDemoCheckout({
        demoRestaurantId: snapshot.session.demo_restaurant_id,
        demoSessionId: snapshot.session.id,
        returnUrl: buildCheckoutReturnUrl(snapshot.session.id),
      });
      setStripeSessionId(result.stripe_session_id);
      const checkoutUrl = new URL(result.checkout_url);
      if (checkoutUrl.protocol !== "https:" || checkoutUrl.hostname !== "checkout.stripe.com") {
        throw new CommercialDemoApiError("URL Stripe Test invalide. Ouverture bloquée.", "INVALID_CHECKOUT_URL");
      }
      window.location.assign(checkoutUrl.toString());
      return result;
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      if (!snapshot?.session.demo_restaurant_id) throw new Error("Restaurant de démonstration introuvable.");
      const checkoutSessionId = stripeSessionId || snapshot.order?.stripe_session_id || "";
      if (!checkoutSessionId) throw new Error("Ouvrez d'abord le paiement Stripe Test pour créer une session.");
      return confirmCommercialDemoCheckout({
        demoRestaurantId: snapshot.session.demo_restaurant_id,
        demoSessionId: snapshot.session.id,
        stripeSessionId: checkoutSessionId,
      });
    },
    onSuccess: (result) => {
      if (result.snapshot) queryClient.setQueryData(["commercial-demo-snapshot", effectiveSessionId], result.snapshot);
      else void queryClient.invalidateQueries({ queryKey: ["commercial-demo-snapshot", effectiveSessionId] });
      if (result.paid) updateDemoSessionUrl(effectiveSessionId);
    },
  });

  useEffect(() => {
    if (!initialParams.returnedFromCheckout || !initialParams.stripeSessionId || !snapshot) return;
    if (automaticConfirmationRef.current === initialParams.stripeSessionId) return;
    automaticConfirmationRef.current = initialParams.stripeSessionId;
    confirmMutation.mutate();
  }, [confirmMutation.mutate, initialParams.returnedFromCheckout, initialParams.stripeSessionId, snapshot]);

  const combinedError = bootstrapQuery.error || snapshotQuery.error || actionMutation.error;

  if (bootstrapQuery.isLoading || (effectiveSessionId && snapshotQuery.isLoading)) {
    return (
      <div className="flex min-h-[56vh] flex-col items-center justify-center rounded-[2rem] border bg-background/80 p-8 text-center" role="status" aria-live="polite" aria-busy="true">
        <Loader2 className="h-8 w-8 animate-spin text-orange-600" />
        <p className="mt-4 font-black">Préparation des trois espaces de démonstration…</p>
        <p className="mt-2 text-sm text-muted-foreground">La session isolée et ses flux temps réel sont en cours d'initialisation.</p>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="rounded-[2rem] border border-red-200 bg-red-50 p-6 text-red-900 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-100" role="alert" aria-live="assertive">
        <p className="font-black">Impossible d'ouvrir la démonstration multi-espace</p>
        <p className="mt-2 text-sm leading-6">{errorMessage(combinedError)}</p>
        <Button
          type="button"
          variant="outline"
          className="mt-4"
          onClick={() => {
            if (effectiveSessionId) void snapshotQuery.refetch();
            else void bootstrapQuery.refetch();
          }}
        >
          <RefreshCw className="mr-2 h-4 w-4" />Réessayer
        </Button>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-5">
      <section className="overflow-hidden rounded-[2rem] border border-white/70 bg-white/90 p-4 shadow-[0_22px_80px_rgba(15,23,42,0.12)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/78 sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="rounded-full bg-orange-100 px-3 py-1 text-orange-700 hover:bg-orange-100"><Sparkles className="mr-1.5 h-3.5 w-3.5" />Démonstration multi-espace</Badge>
              <RealtimeConnectionBadge status={realtimeStatus} />
              <Badge variant="outline" className="rounded-full border-violet-300 text-violet-700"><TestTube2 className="mr-1.5 h-3.5 w-3.5" />Stripe Test uniquement</Badge>
            </div>
            <h1 className="mt-4 break-words font-serif text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">Un parcours complet, trois espaces synchronisés</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
              Créez une commande côté client, pilotez sa préparation côté restaurateur et terminez la livraison côté livreur. Chaque action est isolée dans cette session de démonstration.
            </p>
          </div>
          <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] xl:w-[31rem]">
            <label className="min-w-0 text-sm font-bold">
              Fonctionnalité à présenter
              <select
                value={selectedScenario}
                onChange={(event) => setSelectedScenario(event.target.value)}
                className="mt-2 h-11 w-full min-w-0 rounded-2xl border border-input bg-background px-3 text-sm font-semibold"
              >
                <option value="delivery_order">Commande livrée · parcours complet</option>
                <option value="reservation" disabled>Réservation · bientôt</option>
                <option value="takeaway" disabled>Click & collect · bientôt</option>
              </select>
            </label>
            <Button type="button" variant="outline" className="h-11 self-end rounded-2xl" onClick={() => actionMutation.mutate("reset")} disabled={actionMutation.isPending}>
              <RotateCcw className="mr-2 h-4 w-4" />Réinitialiser
            </Button>
          </div>
        </div>
        <div className="mt-5 flex items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50/80 p-4 text-sm text-sky-950 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-100">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="leading-6"><strong>Environnement isolé.</strong> Les trois panneaux sont des fac-similés synchronisés : aucun rôle livreur n'est accordé au commercial, aucun dashboard réel n'est embarqué et aucune donnée de production n'est modifiée.</p>
        </div>
      </section>

      <JourneyProgress snapshot={snapshot} />

      {combinedError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-100" role="alert" aria-live="assertive">
          <strong>Action non exécutée.</strong> {errorMessage(combinedError)}
        </div>
      ) : null}

      <section className="grid min-w-0 gap-4 xl:grid-cols-3">
        <ClientSurface
          snapshot={snapshot}
          actionPending={actionMutation.isPending}
          checkoutPending={checkoutMutation.isPending}
          confirmPending={confirmMutation.isPending}
          checkoutError={checkoutMutation.error || confirmMutation.error}
          checkoutCancelled={checkoutCancelled}
          onCreateOrder={() => actionMutation.mutate("create_order")}
          onOpenCheckout={() => checkoutMutation.mutate()}
          onConfirmCheckout={() => confirmMutation.mutate()}
        />
        <RestaurantSurface snapshot={snapshot} actionPending={actionMutation.isPending} onAction={(action) => actionMutation.mutate(action)} />
        <CourierSurface snapshot={snapshot} actionPending={actionMutation.isPending} onAction={(action) => actionMutation.mutate(action)} />
      </section>

      <ActivityFeed snapshot={snapshot} />

      {snapshot.order?.status === "delivered" ? (
        <Card className="overflow-hidden rounded-[1.75rem] border-emerald-200 bg-gradient-to-br from-emerald-50 to-sky-50 dark:border-emerald-400/20 dark:from-emerald-400/10 dark:to-sky-400/10">
          <CardContent className="flex flex-col items-center gap-4 p-6 text-center sm:flex-row sm:text-left">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white"><PackageCheck className="h-6 w-6" /></span>
            <div className="min-w-0 flex-1"><p className="text-xl font-black">Démonstration terminée</p><p className="mt-1 text-sm text-muted-foreground">Le client, le restaurant et le livreur affichent tous le statut livré.</p></div>
            <Button type="button" className="rounded-2xl" onClick={() => actionMutation.mutate("reset")}><Play className="mr-2 h-4 w-4" />Rejouer</Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
