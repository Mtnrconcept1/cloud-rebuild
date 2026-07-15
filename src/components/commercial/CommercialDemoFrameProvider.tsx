import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, ShieldAlert } from "lucide-react";
import { useLocation, useNavigate, useNavigationType } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { AuthContext, useAuth, type AuthContextType } from "@/lib/auth-context";
import {
  getCommercialDemoSnapshot,
  subscribeToCommercialDemoSession,
  type CommercialDemoEvent,
  type CommercialDemoSnapshot,
} from "@/lib/commercialDemoJourney";
import type { CommercialDemoRealtimeStatus } from "@/lib/commercialDemoRealtime";
import {
  getCommercialDemoFrameRole,
  getCommercialDemoNotificationPath,
  isCommercialDemoFrameNavigateMessage,
  type CommercialDemoFrameConfig,
  type CommercialDemoFrameStateMessage,
  type CommercialDemoFrameSurface,
} from "@/lib/commercialDemoFrame";

type CommercialDemoFrameContextValue = {
  config: CommercialDemoFrameConfig;
  surface: CommercialDemoFrameSurface;
  snapshot: CommercialDemoSnapshot;
  realtimeStatus: CommercialDemoRealtimeStatus;
  readNotificationIds: ReadonlySet<string>;
  markNotificationRead: (notificationId: string) => void;
  markAllNotificationsRead: () => void;
  refresh: () => Promise<unknown>;
};

const CommercialDemoFrameContext = createContext<CommercialDemoFrameContextValue | null>(null);

const EVENT_RECIPIENTS: Record<string, CommercialDemoFrameSurface[]> = {
  order_created: ["client"],
  test_payment_confirmed: ["client", "restaurant"],
  restaurant_accepted: ["client"],
  preparation_started: ["client", "courier"],
  order_ready: ["client", "courier"],
  courier_accepted: ["client", "restaurant"],
  courier_at_restaurant: ["restaurant"],
  order_picked_up: ["client", "restaurant"],
  delivery_started: ["client"],
  order_delivered: ["client", "restaurant", "courier"],
  reservation_created: ["client", "restaurant"],
  reservation_confirmed: ["client"],
  reservation_arrived: ["client", "restaurant"],
  reservation_no_show: ["client", "restaurant"],
  reservation_cancelled: ["client", "restaurant"],
  session_reset: ["client", "restaurant", "courier"],
};

const EVENT_TITLES: Record<string, Partial<Record<CommercialDemoFrameSurface, string>>> = {
  order_created: { client: "Commande créée" },
  test_payment_confirmed: { client: "Paiement test confirmé", restaurant: "Nouvelle commande payée" },
  restaurant_accepted: { client: "Commande acceptée" },
  preparation_started: { client: "Préparation démarrée", courier: "Nouvelle mission disponible" },
  order_ready: { client: "Commande prête", courier: "Commande prête au retrait" },
  courier_accepted: { client: "Livreur trouvé", restaurant: "Mission acceptée" },
  courier_at_restaurant: { restaurant: "Livreur arrivé" },
  order_picked_up: { client: "Commande récupérée", restaurant: "Commande remise au livreur" },
  delivery_started: { client: "Livraison en cours" },
  order_delivered: { client: "Commande livrée", restaurant: "Livraison terminée", courier: "Mission terminée" },
  reservation_created: { client: "Réservation envoyée", restaurant: "Nouvelle réservation" },
  reservation_confirmed: { client: "Réservation confirmée" },
  reservation_arrived: { client: "Arrivée enregistrée", restaurant: "Client arrivé" },
  reservation_no_show: { client: "Réservation marquée absente", restaurant: "Client absent" },
  reservation_cancelled: { client: "Réservation annulée", restaurant: "Annulation client" },
  session_reset: { client: "Démo réinitialisée", restaurant: "Démo réinitialisée", courier: "Démo réinitialisée" },
};

function notificationStorageKey(config: CommercialDemoFrameConfig) {
  return `commercial-demo-read:${config.sessionId}:${config.surface}`;
}

function readStoredNotificationIds(config: CommercialDemoFrameConfig) {
  if (typeof window === "undefined") return new Set<string>();
  try {
    const value = JSON.parse(window.sessionStorage.getItem(notificationStorageKey(config)) || "[]");
    return new Set(Array.isArray(value) ? value.filter((entry) => typeof entry === "string") : []);
  } catch {
    return new Set<string>();
  }
}

function persistNotificationIds(config: CommercialDemoFrameConfig, ids: ReadonlySet<string>) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(notificationStorageKey(config), JSON.stringify(Array.from(ids)));
  } catch {
    // Embedded privacy modes can disable sessionStorage. Read state remains in memory.
  }
}

export function commercialDemoEventRecipients(event: CommercialDemoEvent) {
  return EVENT_RECIPIENTS[event.event_type] || [];
}

export function commercialDemoEventNotificationId(surface: CommercialDemoFrameSurface, eventId: string) {
  return `commercial-demo:${surface}:${eventId}`;
}

export function commercialDemoEventToNotification(event: CommercialDemoEvent, surface: CommercialDemoFrameSurface) {
  if (!commercialDemoEventRecipients(event).includes(surface)) return null;
  return {
    id: commercialDemoEventNotificationId(surface, event.id),
    title: EVENT_TITLES[event.event_type]?.[surface] || "Mise à jour de la commande",
    body: event.label,
    type: event.event_type,
    category: "transactional",
    data: {
      commercial_demo: true,
      surface,
      url: getCommercialDemoNotificationPath(surface),
    },
    created_at: event.created_at,
  };
}

export function useCommercialDemoFrame() {
  return useContext(CommercialDemoFrameContext);
}

export function CommercialDemoFrameAuthBoundary({
  config,
  children,
}: {
  config: CommercialDemoFrameConfig;
  children: ReactNode;
}) {
  const auth = useAuth();
  const forcedRole = getCommercialDemoFrameRole(config.surface);
  const value = useMemo<AuthContextType>(() => ({
    ...auth,
    role: forcedRole,
    // The presentation role unlocks the matching real dashboard UI. Server
    // authorization still derives the actor and ownership from the JWT.
    roles: [...auth.roles, forcedRole],
    canSwitchRole: false,
    switchRole: () => undefined,
    // Signing out one same-origin frame would terminate all three windows and
    // the parent commercial workspace. Frame layouts hide the control; this is
    // a final no-op guard for any overlooked sign-out action.
    signOut: async () => undefined,
  }), [auth, forcedRole]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export default function CommercialDemoFrameProvider({
  config,
  children,
}: {
  config: CommercialDemoFrameConfig;
  children: ReactNode;
}) {
  const { user, loading: authLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const queryClient = useQueryClient();
  const [realtimeStatus, setRealtimeStatus] = useState<CommercialDemoRealtimeStatus>(() => (
    typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "connecting"
  ));
  const [readNotificationIds, setReadNotificationIds] = useState<Set<string>>(() => readStoredNotificationIds(config));
  const knownEventIdsRef = useRef<Set<string> | null>(null);

  const queryKey = useMemo(() => ["commercial-demo-frame-snapshot", config.sessionId] as const, [config.sessionId]);
  const snapshotQuery = useQuery({
    queryKey,
    queryFn: () => getCommercialDemoSnapshot(config.sessionId),
    enabled: Boolean(user?.id && !authLoading),
    retry: false,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    knownEventIdsRef.current = null;
    setReadNotificationIds(readStoredNotificationIds(config));
  }, [config.basename, config.sessionId, config.surface]);

  useEffect(() => {
    if (!snapshotQuery.data) return;
    const nextIds = new Set(snapshotQuery.data.events.map((event) => event.id));
    const previousIds = knownEventIdsRef.current;
    knownEventIdsRef.current = nextIds;
    if (!previousIds) return;

    for (const event of snapshotQuery.data.events) {
      if (previousIds.has(event.id)) continue;
      const notification = commercialDemoEventToNotification(event, config.surface);
      if (!notification) continue;
      toast(notification.title, { description: notification.body });
    }
  }, [config.surface, snapshotQuery.data]);

  useEffect(() => {
    if (!user?.id || !config.sessionId) return;
    return subscribeToCommercialDemoSession(
      config.sessionId,
      () => void queryClient.invalidateQueries({ queryKey }),
      setRealtimeStatus,
    );
  }, [config.sessionId, queryClient, queryKey, user?.id]);

  useEffect(() => {
    document.documentElement.dataset.commercialDemoFrame = config.surface;
    document.documentElement.dataset.commercialDemoSessionId = config.sessionId;
    return () => {
      if (document.documentElement.dataset.commercialDemoFrame === config.surface) {
        delete document.documentElement.dataset.commercialDemoFrame;
      }
      if (document.documentElement.dataset.commercialDemoSessionId === config.sessionId) {
        delete document.documentElement.dataset.commercialDemoSessionId;
      }
    };
  }, [config.sessionId, config.surface]);

  useEffect(() => {
    if (window.parent === window) return;
    const relayEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      window.parent.postMessage({
        type: "commercial-demo:escape",
        sessionId: config.sessionId,
        surface: config.surface,
      }, window.location.origin);
    };
    window.addEventListener("keydown", relayEscape);
    return () => window.removeEventListener("keydown", relayEscape);
  }, [config.sessionId, config.surface]);

  useEffect(() => {
    if (window.parent === window) return;
    const handleParentNavigation = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== window.parent) return;
      if (!isCommercialDemoFrameNavigateMessage(event.data)) return;
      if (event.data.sessionId !== config.sessionId || event.data.surface !== config.surface) return;
      navigate(event.data.path);
    };
    window.addEventListener("message", handleParentNavigation);
    return () => window.removeEventListener("message", handleParentNavigation);
  }, [config.sessionId, config.surface, navigate]);

  const unreadCount = useMemo(() => (snapshotQuery.data?.events || [])
    .map((event) => commercialDemoEventToNotification(event, config.surface))
    .filter((notification): notification is NonNullable<typeof notification> => Boolean(notification))
    .filter((notification) => !readNotificationIds.has(notification.id))
    .length, [config.surface, readNotificationIds, snapshotQuery.data?.events]);

  useEffect(() => {
    if (window.parent === window || !snapshotQuery.data) return;
    const rawHistoryIndex = window.history.state && typeof window.history.state.idx === "number"
      ? window.history.state.idx
      : 0;
    const message: CommercialDemoFrameStateMessage = {
      type: "commercial-demo:frame-state",
      sessionId: config.sessionId,
      surface: config.surface,
      path: location.pathname,
      search: location.search,
      historyIndex: Math.max(0, Math.trunc(rawHistoryIndex)),
      navigationType,
      unreadCount,
      realtimeStatus,
    };
    window.parent.postMessage(message, window.location.origin);
  }, [
    config.sessionId,
    config.surface,
    location.pathname,
    location.search,
    navigationType,
    realtimeStatus,
    snapshotQuery.data,
    unreadCount,
  ]);

  const markNotificationRead = useCallback((notificationId: string) => {
    setReadNotificationIds((current) => {
      const next = new Set(current);
      next.add(notificationId);
      persistNotificationIds(config, next);
      return next;
    });
  }, [config]);

  const markAllNotificationsRead = useCallback(() => {
    const notifications = (snapshotQuery.data?.events || [])
      .map((event) => commercialDemoEventToNotification(event, config.surface))
      .filter((notification): notification is NonNullable<typeof notification> => Boolean(notification));
    setReadNotificationIds((current) => {
      const next = new Set(current);
      for (const notification of notifications) next.add(notification.id);
      persistNotificationIds(config, next);
      return next;
    });
  }, [config, snapshotQuery.data?.events]);

  if (authLoading || snapshotQuery.isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-8 text-center" role="status" aria-live="polite">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-4 font-semibold">Ouverture du vrai dashboard {config.surface}…</p>
        <p className="mt-2 text-sm text-muted-foreground">Validation de la session de démonstration isolée.</p>
      </div>
    );
  }

  if (!user || !snapshotQuery.data || snapshotQuery.error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="max-w-md rounded-3xl border border-destructive/30 bg-destructive/5 p-6 text-center" role="alert">
          <ShieldAlert className="mx-auto h-9 w-9 text-destructive" />
          <h1 className="mt-4 text-xl font-bold">Fenêtre de démonstration refusée</h1>
          <p className="mt-2 text-sm text-muted-foreground">Cette session n'appartient pas au compte commercial connecté ou n'est plus active.</p>
          <Button type="button" variant="outline" className="mt-4" onClick={() => void snapshotQuery.refetch()}>Réessayer</Button>
        </div>
      </div>
    );
  }

  const value: CommercialDemoFrameContextValue = {
    config,
    surface: config.surface,
    snapshot: snapshotQuery.data,
    realtimeStatus,
    readNotificationIds,
    markNotificationRead,
    markAllNotificationsRead,
    refresh: snapshotQuery.refetch,
  };

  return <CommercialDemoFrameContext.Provider value={value}>{children}</CommercialDemoFrameContext.Provider>;
}
