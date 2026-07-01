import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { fetchWithFreshAccessToken } from "@/lib/session";
import { SUPABASE_URL } from "@/lib/env";
import { useAuth } from "@/lib/auth-context";

const SLOT_ENDPOINT = `${SUPABASE_URL}/functions/v1/daily-slot-spin`;
const SLOT_MACHINE_FRAME_SRC = "/tok-slot-machine/index.html";
const DEFAULT_MAX_ATTEMPTS = 3;

type SpinResult = {
  id?: string;
  spinDate?: string;
  attemptNumber?: number;
  symbols?: string[];
  rewardPoints?: number;
  rewardLabel?: string;
  createdAt?: string;
};

type SlotStatusResponse = {
  ok?: boolean;
  available?: boolean;
  alreadyClaimed?: boolean;
  spinDate?: string;
  spin?: SpinResult | null;
  attemptsUsed?: number | null;
  attemptsRemaining?: number | null;
  maxAttempts?: number | null;
};

type SlotSpinResponse = SlotStatusResponse & {
  totalLoyaltyPoints?: number | null;
};

type SlotFrameMessage =
  | {
      type: "TOK_SLOT_SET_STATUS";
      message: string;
      subMessage: string;
      enabled: boolean;
      attemptsRemaining?: number;
      maxAttempts?: number;
    }
  | {
      type: "TOK_SLOT_SPIN_RESULT";
      symbols: string[];
      rewardPoints: number;
      rewardLabel: string;
      totalPoints: number | null;
      attemptNumber: number | null;
      attemptsRemaining: number;
      maxAttempts: number;
    };

async function readJsonResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "error" in payload
      ? String((payload as { error?: unknown }).error || "Erreur slot TOK")
      : "Erreur slot TOK";
    throw new Error(message);
  }
  return payload as T;
}

function normalizeFrameSymbols(symbols: unknown): string[] {
  if (!Array.isArray(symbols)) return ["logo", "chef", "miamz"];
  const normalized = symbols.slice(0, 3).map((symbol) => String(symbol || "logo"));
  while (normalized.length < 3) normalized.push("logo");
  return normalized;
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function normalizeAttemptCount(value: unknown, fallback: number) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? Math.max(Math.trunc(numericValue), 0) : fallback;
}

export default function DailyMiamzSlotMachine() {
  const { user, role, roles, loading } = useAuth();
  const queryClient = useQueryClient();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [attemptsRemaining, setAttemptsRemaining] = useState(0);
  const [maxAttempts, setMaxAttempts] = useState(DEFAULT_MAX_ATTEMPTS);

  const userId = user?.id || null;
  const hasPrivilegedRole = roles.some((entry) => entry === "admin" || entry === "restaurateur" || entry === "courier");

  const postSlotFrameMessage = useCallback((message: SlotFrameMessage) => {
    iframeRef.current?.contentWindow?.postMessage(message, window.location.origin);
  }, []);

  useEffect(() => {
    if (loading || !userId || role !== "client" || hasPrivilegedRole || !SUPABASE_URL) return;

    let cancelled = false;
    setChecking(true);

    const timer = window.setTimeout(() => {
      void fetchWithFreshAccessToken(SLOT_ENDPOINT, { method: "GET" })
        .then((response) => readJsonResponse<SlotStatusResponse>(response))
        .then((payload) => {
          if (cancelled) return;
          const nextMaxAttempts = normalizeAttemptCount(payload.maxAttempts, DEFAULT_MAX_ATTEMPTS) || DEFAULT_MAX_ATTEMPTS;
          const nextAttemptsRemaining = normalizeAttemptCount(payload.attemptsRemaining, 0);
          setMaxAttempts(nextMaxAttempts);
          setAttemptsRemaining(nextAttemptsRemaining);
          if (payload.available && nextAttemptsRemaining > 0) {
            setOpen(true);
          }
        })
        .catch((statusError) => {
          if (!cancelled) console.warn("[daily-slot-spin] status failed", statusError);
        })
        .finally(() => {
          if (!cancelled) setChecking(false);
        });
    }, 700);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [hasPrivilegedRole, loading, role, userId]);

  const syncSlotFrameStatus = useCallback(() => {
    const remaining = Math.max(attemptsRemaining, 0);
    postSlotFrameMessage({
      type: "TOK_SLOT_SET_STATUS",
      message: remaining > 0 ? "TOK SPIN" : "Termine pour aujourd'hui",
      subMessage: remaining > 0
        ? `${remaining}/${maxAttempts} essai${remaining > 1 ? "s" : ""} disponible${remaining > 1 ? "s" : ""}. Tirage securise cote serveur TOK.`
        : "Vos 3 essais du jour sont termines.",
      enabled: remaining > 0 && !spinning,
      attemptsRemaining: remaining,
      maxAttempts,
    });
  }, [attemptsRemaining, maxAttempts, postSlotFrameMessage, spinning]);

  const handleSpin = useCallback(async () => {
    if (spinning) return;
    if (attemptsRemaining <= 0) {
      setOpen(false);
      return;
    }

    setSpinning(true);
    postSlotFrameMessage({
      type: "TOK_SLOT_SET_STATUS",
      message: "TOK SPIN",
      subMessage: `Essai ${Math.max(maxAttempts - attemptsRemaining + 1, 1)}/${maxAttempts}. Tirage securise cote serveur TOK...`,
      enabled: false,
      attemptsRemaining,
      maxAttempts,
    });

    const minimumServerHold = delay(350);

    try {
      const response = await fetchWithFreshAccessToken(SLOT_ENDPOINT, { method: "POST" });
      const payload = await readJsonResponse<SlotSpinResponse>(response);
      await minimumServerHold;
      const spin = payload.spin || null;

      if (!spin) throw new Error("Tirage indisponible pour aujourd'hui.");

      const nextMaxAttempts = normalizeAttemptCount(payload.maxAttempts, maxAttempts || DEFAULT_MAX_ATTEMPTS) || DEFAULT_MAX_ATTEMPTS;
      const nextAttemptsRemaining = normalizeAttemptCount(payload.attemptsRemaining, Math.max(attemptsRemaining - 1, 0));
      const nextTotalLoyaltyPoints = typeof payload.totalLoyaltyPoints === "number" ? payload.totalLoyaltyPoints : null;

      setMaxAttempts(nextMaxAttempts);
      setAttemptsRemaining(nextAttemptsRemaining);
      if (nextTotalLoyaltyPoints !== null) {
        queryClient.setQueryData(["profile-loyalty", userId], (currentProfile: Record<string, unknown> | undefined) => ({
          ...(currentProfile || {}),
          loyalty_points: nextTotalLoyaltyPoints,
        }));
        queryClient.setQueriesData<Record<string, unknown>>({ queryKey: ["profile-loyalty"] }, (currentProfile) => ({
          ...(currentProfile || {}),
          loyalty_points: nextTotalLoyaltyPoints,
        }));
        void queryClient.invalidateQueries({ queryKey: ["loyalty-transactions"] });
      }
      postSlotFrameMessage({
        type: "TOK_SLOT_SPIN_RESULT",
        symbols: normalizeFrameSymbols(spin.symbols),
        rewardPoints: Number(spin.rewardPoints || 0),
        rewardLabel: spin.rewardLabel || "Gain TOK",
        totalPoints: nextTotalLoyaltyPoints,
        attemptNumber: typeof spin.attemptNumber === "number" ? spin.attemptNumber : null,
        attemptsRemaining: nextAttemptsRemaining,
        maxAttempts: nextMaxAttempts,
      });
    } catch (spinError) {
      await minimumServerHold;
      postSlotFrameMessage({
        type: "TOK_SLOT_SET_STATUS",
        message: "Erreur TOK",
        subMessage: spinError instanceof Error ? spinError.message : "Impossible de lancer la machine TOK.",
        enabled: true,
        attemptsRemaining,
        maxAttempts,
      });
    } finally {
      setSpinning(false);
    }
  }, [attemptsRemaining, maxAttempts, postSlotFrameMessage, queryClient, spinning, userId]);

  useEffect(() => {
    const onFrameMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (!event.data || event.data.type !== "TOK_SLOT_SPIN_REQUEST") return;
      void handleSpin();
    };

    window.addEventListener("message", onFrameMessage);
    return () => window.removeEventListener("message", onFrameMessage);
  }, [handleSpin]);

  useEffect(() => {
    if (open) syncSlotFrameStatus();
  }, [open, syncSlotFrameStatus]);

  if (loading || checking || !userId || role !== "client" || hasPrivilegedRole) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="fixed inset-0 left-0 top-0 z-[1400] h-[100dvh] max-h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-none border-0 bg-[#050201] p-0 text-white shadow-none [&>button:last-child]:hidden">
        <DialogTitle className="sr-only">Machine a sous Miamz quotidienne</DialogTitle>
        <DialogDescription className="sr-only">
          Affichee a chaque connexion client eligible. Le credit reste limite a trois essais par jour par Supabase.
        </DialogDescription>
        <div className="pointer-events-none absolute left-3 right-3 top-3 z-10 flex items-center justify-between gap-3 sm:left-5 sm:right-5 sm:top-5">
          <div className="pointer-events-auto rounded-full border border-orange-400/40 bg-black/72 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-orange-100 shadow-2xl backdrop-blur">
            {Math.max(attemptsRemaining, 0)}/{maxAttempts} essais
          </div>
          <DialogClose className="pointer-events-auto inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-white/95 text-slate-950 shadow-2xl transition hover:bg-orange-50 focus:outline-none focus:ring-2 focus:ring-orange-400">
            <X className="h-5 w-5" />
            <span className="sr-only">Fermer la machine TOK</span>
          </DialogClose>
        </div>
        <iframe
          ref={iframeRef}
          title="Machine a sous TOK"
          src={SLOT_MACHINE_FRAME_SRC}
          className="h-full w-full border-0 bg-[#050201]"
          sandbox="allow-scripts allow-same-origin"
          onLoad={syncSlotFrameStatus}
        />
      </DialogContent>
    </Dialog>
  );
}
