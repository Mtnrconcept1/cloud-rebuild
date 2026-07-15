import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Bell,
  Bike,
  CheckCircle2,
  ChevronRight,
  Clock3,
  CreditCard,
  Loader2,
  MapPin,
  PackageCheck,
  RefreshCw,
  ShoppingBag,
  Store,
  TestTube2,
  UserRound,
  Wifi,
  WifiOff,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";
import {
  CommercialDemoApiError,
  createCommercialDemoCheckout,
  createCommercialDemoOrder,
  getCommercialDemoPresetItems,
  transitionCommercialDemoOrder,
  type CommercialDemoTransitionAction,
} from "@/lib/commercialDemoJourney";
import { getCommercialDemoNotificationPath, type CommercialDemoActorSurface } from "@/lib/commercialDemoFrame";
import { isStripeTestCheckoutSessionId } from "@/lib/commercialDemoHostSecurity";
import { cn } from "@/lib/utils";

const ORDER_STATUS_LABELS: Record<string, string> = {
  awaiting_payment: "Paiement Stripe Test attendu",
  restaurant_received: "Reçue par le restaurant",
  restaurant_accepted: "Acceptée par le restaurant",
  preparing: "En préparation",
  ready_for_pickup: "Prête à récupérer",
  picked_up: "Récupérée par le livreur",
  delivering: "En cours de livraison",
  delivered: "Livrée",
};

const MISSION_STATUS_LABELS: Record<string, string> = {
  mission_available: "Nouvelle mission disponible",
  accepted: "Mission acceptée",
  at_restaurant: "Arrivé au restaurant",
  picked_up: "Commande récupérée",
  delivering: "Livraison en cours",
  delivered: "Mission terminée",
};

const ACTIONS: Record<CommercialDemoActorSurface, CommercialDemoTransitionAction[]> = {
  client: [],
  restaurant: ["restaurant_accept", "restaurant_start_preparing", "restaurant_mark_ready"],
  courier: ["courier_accept", "courier_arrived_pickup", "courier_confirm_pickup", "courier_start_delivery", "courier_confirm_delivery"],
};

const ACTION_LABELS: Record<CommercialDemoTransitionAction, string> = {
  restaurant_accept: "Accepter la commande",
  restaurant_start_preparing: "Démarrer la préparation",
  restaurant_mark_ready: "Marquer la commande prête",
  courier_accept: "Accepter la mission",
  courier_arrived_pickup: "Je suis arrivé au restaurant",
  courier_confirm_pickup: "Confirmer la récupération",
  courier_start_delivery: "Démarrer la livraison",
  courier_confirm_delivery: "Confirmer la livraison",
};

const SURFACE_META = {
  client: { title: "Mes commandes", eyebrow: "Espace client", icon: UserRound, tone: "text-sky-600" },
  restaurant: { title: "Commandes", eyebrow: "Espace restaurateur", icon: Store, tone: "text-orange-600" },
  courier: { title: "Missions", eyebrow: "Espace livreur", icon: Bike, tone: "text-emerald-600" },
} satisfies Record<CommercialDemoActorSurface, { title: string; eyebrow: string; icon: typeof UserRound; tone: string }>;

function formatChf(cents: number) {
  return new Intl.NumberFormat("fr-CH", { style: "currency", currency: "CHF" }).format((Number(cents) || 0) / 100);
}

function checkoutReturnUrl(sessionId: string) {
  const url = new URL("/commercial/demo-live", window.location.origin);
  url.searchParams.set("demo_session_id", sessionId);
  return url.toString();
}

function sendCheckoutToParent(sessionId: string, checkoutUrl: string, stripeSessionId: string) {
  if (!isStripeTestCheckoutSessionId(stripeSessionId)) {
    throw new CommercialDemoApiError("Session Stripe Test invalide. Ouverture bloquée.", "INVALID_TEST_STRIPE_SESSION");
  }
  const url = new URL(checkoutUrl);
  if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com") {
    throw new CommercialDemoApiError("URL Stripe Test invalide. Ouverture bloquée.", "INVALID_CHECKOUT_URL");
  }
  if (window.parent === window) {
    window.location.assign(url.toString());
    return;
  }
  window.parent.postMessage({
    type: "commercial-demo:open-checkout",
    sessionId,
    stripeSessionId,
    checkoutUrl: url.toString(),
  }, window.location.origin);
}

function RealtimeBadge({ status }: { status: string }) {
  const connected = status === "connected";
  const offline = status === "offline";
  const Icon = offline ? WifiOff : connected ? Wifi : RefreshCw;
  return (
    <Badge variant="outline" className={cn(
      "rounded-full",
      connected && "border-emerald-300 text-emerald-700",
      offline && "border-red-300 text-red-700",
    )}>
      <Icon className={cn("mr-1.5 h-3.5 w-3.5", !connected && !offline && "animate-spin")} />
      {offline ? "Hors ligne" : connected ? "Temps réel" : "Connexion…"}
    </Badge>
  );
}

function DemoBanner({ surface }: { surface: CommercialDemoActorSurface }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-violet-200 bg-violet-50/80 p-4 text-violet-950 sm:flex-row sm:items-center dark:border-violet-400/20 dark:bg-violet-400/10 dark:text-violet-100" role="status">
      <TestTube2 className="h-5 w-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Vrai dashboard · données de démonstration isolées</p>
        <p className="mt-1 text-xs leading-5 opacity-80">Vous pouvez utiliser les onglets de cet espace. Les commandes, notifications et actions visibles ici ne touchent jamais la production.</p>
      </div>
      <Button asChild variant="outline" size="sm" className="shrink-0 bg-background/70">
        <Link to={getCommercialDemoNotificationPath(surface)}><Bell className="mr-2 h-4 w-4" />Notifications</Link>
      </Button>
    </div>
  );
}

function ClientWorkspace({ pending, onCreate, onCheckout, checkoutError }: {
  pending: boolean;
  onCreate: () => void;
  onCheckout: () => void;
  checkoutError: unknown;
}) {
  const frame = useCommercialDemoFrame()!;
  const order = frame.snapshot.order;
  const items = order?.items || getCommercialDemoPresetItems(frame.snapshot.catalog_items);
  const paid = order?.payment_status === "test_paid";
  const stripeConfigMissing = checkoutError instanceof CommercialDemoApiError
    && ["DEMO_STRIPE_NOT_CONFIGURED", "INVALID_TEST_STRIPE_KEY"].includes(checkoutError.code);

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(18rem,0.75fr)]">
      <Card>
        <CardHeader>
          <CardTitle>{order ? `Commande ${order.order_number}` : "Créer une commande de démonstration"}</CardTitle>
          <CardDescription>Restaurant Démo TOK · livraison à Genève</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.name} className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm">
                <span className="min-w-0 truncate font-medium">{item.quantity}× {item.name}</span>
                <span className="shrink-0 font-semibold">{formatChf(item.quantity * item.unit_amount_cents)}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between rounded-xl bg-muted/50 p-4">
            <span className="font-medium">Total</span>
            <strong>{formatChf(order?.total_amount_cents || items.reduce((sum, item) => sum + item.quantity * item.unit_amount_cents, 0))}</strong>
          </div>
          {!order ? (
            <Button type="button" className="min-h-11 w-full" onClick={onCreate} disabled={pending}>
              {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShoppingBag className="mr-2 h-4 w-4" />}
              Créer la commande
            </Button>
          ) : !paid ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-sm dark:border-violet-400/20 dark:bg-violet-400/10">
                <p className="font-semibold">Carte Stripe Test</p>
                <p className="mt-1"><code className="font-mono font-bold">4242 4242 4242 4242</code> · date future · CVC libre</p>
              </div>
              <Button type="button" className="min-h-11 w-full bg-[#635bff] text-white hover:bg-[#5148e5]" onClick={onCheckout} disabled={pending}>
                {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
                Payer avec Stripe Test
              </Button>
            </div>
          ) : (
            <div className="flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-100">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              <div><p className="font-semibold">Paiement test confirmé</p><p className="mt-1 text-xs">Aucun débit réel. La commande est visible chez le restaurateur.</p></div>
            </div>
          )}
          {checkoutError ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm" role="alert">
              <p className="font-semibold">{stripeConfigMissing ? "Stripe Test doit être configuré" : "Paiement test indisponible"}</p>
              <p className="mt-1 text-muted-foreground">{checkoutError instanceof Error ? checkoutError.message : "Réessayez dans un instant."}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Suivi en direct</CardTitle><CardDescription>Les actions des deux autres dashboards apparaissent ici.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Statut</p>
            <p className="mt-2 text-lg font-bold">{order ? ORDER_STATUS_LABELS[order.status] || order.status : "Aucune commande"}</p>
          </div>
          {order ? <div className="flex gap-2 text-sm text-muted-foreground"><MapPin className="mt-0.5 h-4 w-4 shrink-0" /><span>{order.delivery_address}</span></div> : null}
        </CardContent>
      </Card>
    </div>
  );
}

function OperationalWorkspace({ surface, pending, onAction }: {
  surface: "restaurant" | "courier";
  pending: boolean;
  onAction: (action: CommercialDemoTransitionAction) => void;
}) {
  const frame = useCommercialDemoFrame()!;
  const { order, mission, allowed_actions: allowedActions } = frame.snapshot;
  const paid = order?.payment_status === "test_paid";
  const candidateActions = ACTIONS[surface].filter((action) => allowedActions.includes(action));
  const waiting = surface === "restaurant" ? !order || !paid : !mission;

  if (waiting) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex min-h-80 flex-col items-center justify-center p-8 text-center">
          {surface === "restaurant" ? <Clock3 className="h-10 w-10 text-muted-foreground" /> : <Bike className="h-10 w-10 text-muted-foreground" />}
          <h2 className="mt-4 text-xl font-bold">{surface === "restaurant" ? "En attente d'une commande payée" : "En attente d'une mission"}</h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">Cette page se met à jour automatiquement dès que l'étape précédente est réalisée dans un autre dashboard.</p>
        </CardContent>
      </Card>
    );
  }

  const status = surface === "restaurant" ? order!.status : mission!.status;
  const label = surface === "restaurant" ? ORDER_STATUS_LABELS[status] || status : MISSION_STATUS_LABELS[status] || status;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><CardTitle>{surface === "restaurant" ? `Commande ${order!.order_number}` : "Mission de livraison"}</CardTitle><CardDescription>{surface === "restaurant" ? order!.customer_name : `${order!.order_number} · Restaurant Démo TOK`}</CardDescription></div>
            <Badge>{label}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 rounded-xl border p-4">
            {order!.items.map((item) => <div key={item.name} className="flex justify-between gap-3 text-sm"><span>{item.quantity}× {item.name}</span><span>{formatChf(item.quantity * item.unit_amount_cents)}</span></div>)}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Retrait</p><p className="mt-1 font-semibold">Restaurant Démo TOK</p></div>
            <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Livraison</p><p className="mt-1 font-semibold">{order!.delivery_address}</p></div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Actions disponibles</CardTitle><CardDescription>Chaque action est transmise aux autres fenêtres en temps réel.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          {candidateActions.length > 0 ? candidateActions.map((action) => (
            <Button key={action} type="button" className="min-h-11 w-full whitespace-normal" onClick={() => onAction(action)} disabled={pending}>
              {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ChevronRight className="mr-2 h-4 w-4" />}
              {ACTION_LABELS[action]}
            </Button>
          )) : (
            <div className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">
              {status === "delivered" ? "Parcours terminé." : "La prochaine action appartient à un autre espace."}
            </div>
          )}
          {status === "delivered" ? <div className="flex items-center gap-3 rounded-xl bg-emerald-50 p-4 text-emerald-900 dark:bg-emerald-400/10 dark:text-emerald-100"><PackageCheck className="h-5 w-5" /><span className="font-semibold">Livraison terminée</span></div> : null}
        </CardContent>
      </Card>
    </div>
  );
}

export default function CommercialDemoActorWorkspace({ surface }: { surface: CommercialDemoActorSurface }) {
  const frame = useCommercialDemoFrame();
  const queryClient = useQueryClient();
  const meta = SURFACE_META[surface];
  const Icon = meta.icon;

  const snapshotKey = useMemo(() => ["commercial-demo-frame-snapshot", frame?.config.sessionId || ""], [frame?.config.sessionId]);
  const syncSnapshot = async (next?: unknown) => {
    if (next) queryClient.setQueryData(snapshotKey, next);
    await frame?.refresh();
  };

  const actionMutation = useMutation({
    mutationFn: async (action: "create" | CommercialDemoTransitionAction) => {
      if (!frame) throw new Error("Session de démonstration indisponible.");
      if (action === "create") return createCommercialDemoOrder(frame.config.sessionId);
      if (!frame.snapshot.order) throw new Error("Commande de démonstration introuvable.");
      return transitionCommercialDemoOrder({ orderId: frame.snapshot.order.id, action, expectedVersion: frame.snapshot.order.version });
    },
    onSuccess: (next) => void syncSnapshot(next),
  });

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      if (!frame) throw new Error("Session de démonstration indisponible.");
      const result = await createCommercialDemoCheckout({
        demoRestaurantId: frame.snapshot.session.demo_restaurant_id,
        demoSessionId: frame.config.sessionId,
        returnUrl: checkoutReturnUrl(frame.config.sessionId),
      });
      sendCheckoutToParent(frame.config.sessionId, result.checkout_url, result.stripe_session_id);
      return result;
    },
  });

  if (!frame || frame.surface !== surface) return null;
  const combinedError = actionMutation.error;

  return (
    <div className="space-y-6" data-testid={`commercial-demo-real-dashboard-${surface}`}>
      <DemoBanner surface={surface} />
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className={cn("flex items-center gap-2 text-sm font-semibold", meta.tone)}><Icon className="h-4 w-4" />{meta.eyebrow}</p>
          <h1 className="mt-1 font-display text-3xl font-bold">{meta.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">Session synchronisée avec les deux autres dashboards.</p>
        </div>
        <RealtimeBadge status={frame.realtimeStatus} />
      </header>

      {combinedError ? <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm" role="alert"><strong>Action non exécutée.</strong> {combinedError instanceof Error ? combinedError.message : "Réessayez."}</div> : null}

      {surface === "client" ? (
        <ClientWorkspace
          pending={actionMutation.isPending || checkoutMutation.isPending}
          onCreate={() => actionMutation.mutate("create")}
          onCheckout={() => checkoutMutation.mutate()}
          checkoutError={checkoutMutation.error}
        />
      ) : (
        <OperationalWorkspace
          surface={surface}
          pending={actionMutation.isPending}
          onAction={(action) => actionMutation.mutate(action)}
        />
      )}
    </div>
  );
}

