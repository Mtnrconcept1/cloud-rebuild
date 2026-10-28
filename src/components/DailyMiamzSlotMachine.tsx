import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { fetchWithFreshAccessToken } from "@/lib/session";
import { SUPABASE_URL } from "@/lib/env";
import { useAuth } from "@/lib/auth-context";

const SLOT_ENDPOINT = `${SUPABASE_URL}/functions/v1/daily-slot-spin`;
const SLOT_MACHINE_FRAME_SRC = "/tok-slot-machine/index.html?v=20261028";
const DEFAULT_MAX_ATTEMPTS = 3;
const ANIMATION_WATCHDOG_MS = 6_500;
const FINAL_CELEBRATION_MS = 1_800;

type SpinResult = {
  id?: string;
  requestId?: string | null;
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
  idempotentReplay?: boolean;
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
      attemptsRemaining: number;
      maxAttempts: number;
      sessionRewardPoints: number;
    }
  | {
      type: "TOK_SLOT_SPIN_RESULT";
      requestId: string;
      symbols: string[];
      rewardPoints: number;
      rewardLabel: string;
      totalPoints: number | null;
      attemptNumber: number | null;
      attemptsRemaining: number;
      maxAttempts: number;
      sessionRewardPoints: number;
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
  const normalized = symbols
    .slice(0, 3)
    .map((symbol) => String(symbol || "logo"));
  while (normalized.length < 3) normalized.push("logo");
  return normalized;
}

function normalizeAttemptCount(value: unknown, fallback: number) {
  if (value === null || value === undefined) return fallback;
  const numericValue = Number(value);
  return Number.isFinite(numericValue)
    ? Math.max(Math.trunc(numericValue), 0)
    : fallback;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

export default function DailyMiamzSlotMachine() {
  const { user, role, roles, loading } = useAuth();
  const queryClient = useQueryClient();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const spinningRef = useRef(false);
  const activeRequestIdRef = useRef<string | null>(null);
  const animationWatchdogRef = useRef<number | null>(null);
  const completionTimerRef = useRef<number | null>(null);
  const generationRef = useRef(0);
  const spinControllerRef = useRef<AbortController | null>(null);
  const sessionRewardPointsRef = useRef(0);
  const creditedSpinsRef = useRef(new Set<string>());
  const pendingResultRef = useRef<{
    requestId: string;
    attemptsRemaining: number;
    sessionRewardPoints: number;
  } | null>(null);
  const completedRewardRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [attemptsRemaining, setAttemptsRemaining] = useState(0);
  const [maxAttempts, setMaxAttempts] = useState(DEFAULT_MAX_ATTEMPTS);
  const [sessionRewardPoints, setSessionRewardPoints] = useState(0);

  const userId = user?.id || null;
  const hasPrivilegedRole = roles.some((entry) =>
    entry === "admin" || entry === "restaurateur" || entry === "courier"
  );
  const eligible =
    !loading &&
    Boolean(userId) &&
    role === "client" &&
    !hasPrivilegedRole &&
    Boolean(SUPABASE_URL);

  const clearAnimationWatchdog = useCallback(() => {
    if (animationWatchdogRef.current !== null) {
      window.clearTimeout(animationWatchdogRef.current);
      animationWatchdogRef.current = null;
    }
  }, []);

  const setSpinIdle = useCallback((clearRequestId: boolean) => {
    clearAnimationWatchdog();
    spinningRef.current = false;
    setSpinning(false);
    if (clearRequestId) activeRequestIdRef.current = null;
  }, [clearAnimationWatchdog]);

  const clearCompletionTimer = useCallback(() => {
    if (completionTimerRef.current !== null) {
      window.clearTimeout(completionTimerRef.current);
      completionTimerRef.current = null;
    }
  }, []);

  const closeCompletedGame = useCallback(() => {
    const total = completedRewardRef.current;
    if (total === null) return;
    completedRewardRef.current = null;
    clearCompletionTimer();
    setOpen(false);
    toast.success(`${total} Miamz remportés !`, {
      description: "Les gains de cette partie ont été ajoutés à votre solde. À demain pour trois nouveaux tours !",
      duration: 8_000,
    });
  }, [clearCompletionTimer]);

  const finishSpinAnimation = useCallback((requestId: string) => {
    const result = pendingResultRef.current;
    if (!result || result.requestId !== requestId || activeRequestIdRef.current !== requestId) return;

    // Only a committed server result can finish a turn. Consume it once so
    // duplicate completion messages and the watchdog cannot close twice.
    pendingResultRef.current = null;
    setSessionRewardPoints(result.sessionRewardPoints);
    setSpinIdle(true);
    if (result.attemptsRemaining <= 0) {
      completedRewardRef.current = result.sessionRewardPoints;
      completionTimerRef.current = window.setTimeout(closeCompletedGame, FINAL_CELEBRATION_MS);
    }
  }, [closeCompletedGame, setSpinIdle]);

  const postSlotFrameMessage = useCallback((message: SlotFrameMessage) => {
    iframeRef.current?.contentWindow?.postMessage(
      message,
      window.location.origin,
    );
  }, []);

  useEffect(() => {
    generationRef.current += 1;
    sessionRewardPointsRef.current = 0;
    creditedSpinsRef.current.clear();
    pendingResultRef.current = null;
    completedRewardRef.current = null;
    clearCompletionTimer();
    setSessionRewardPoints(0);
    setSpinIdle(true);
    setOpen(false);
    if (!eligible) {
      setAttemptsRemaining(0);
      setMaxAttempts(DEFAULT_MAX_ATTEMPTS);
      return;
    }

    const controller = new AbortController();

    void fetchWithFreshAccessToken(SLOT_ENDPOINT, {
      method: "GET",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    })
      .then((response) => readJsonResponse<SlotStatusResponse>(response))
      .then((payload) => {
        if (controller.signal.aborted) return;
        const nextMaxAttempts =
          normalizeAttemptCount(payload.maxAttempts, DEFAULT_MAX_ATTEMPTS) ||
          DEFAULT_MAX_ATTEMPTS;
        const nextAttemptsRemaining = normalizeAttemptCount(
          payload.attemptsRemaining,
          0,
        );

        setMaxAttempts(nextMaxAttempts);
        setAttemptsRemaining(nextAttemptsRemaining);
        setOpen(Boolean(payload.available && nextAttemptsRemaining > 0));
      })
      .catch((statusError) => {
        if (!controller.signal.aborted && !isAbortError(statusError)) {
          console.warn("[daily-slot-spin] status failed", statusError);
        }
      });

    return () => {
      generationRef.current += 1;
      controller.abort();
      spinControllerRef.current?.abort();
      clearAnimationWatchdog();
      clearCompletionTimer();
      pendingResultRef.current = null;
      completedRewardRef.current = null;
    };
  }, [clearAnimationWatchdog, clearCompletionTimer, eligible, setSpinIdle, userId]);

  const syncSlotFrameStatus = useCallback(() => {
    const remaining = Math.max(attemptsRemaining, 0);
    const isSpinning = spinningRef.current;

    postSlotFrameMessage({
      type: "TOK_SLOT_SET_STATUS",
      message: isSpinning
        ? "Tirage en cours"
        : remaining > 0
          ? "TOK Spin"
          : "Terminé pour aujourd’hui",
      subMessage: isSpinning
        ? "Le résultat sécurisé arrive…"
        : remaining > 0
          ? `${remaining} tour${remaining > 1 ? "s" : ""} pour faire le plein de Miamz. À vous de jouer !`
          : `Vos ${maxAttempts} tours sont terminés. À demain !`,
      enabled: remaining > 0 && !isSpinning,
      attemptsRemaining: remaining,
      maxAttempts,
      sessionRewardPoints: sessionRewardPointsRef.current,
    });
  }, [
    attemptsRemaining,
    maxAttempts,
    postSlotFrameMessage,
  ]);

  const updateLoyaltyCache = useCallback((totalPoints: number | null) => {
    if (totalPoints === null) return;

    queryClient.setQueriesData<Record<string, unknown>>(
      { queryKey: ["profile-loyalty", userId] },
      (currentProfile) => currentProfile
        ? { ...currentProfile, loyalty_points: totalPoints }
        : currentProfile,
    );
    void queryClient.invalidateQueries({
      queryKey: ["loyalty-transactions", userId],
    });
  }, [queryClient, userId]);

  const handleSpin = useCallback(async () => {
    if (!eligible || !open || spinningRef.current || completedRewardRef.current !== null) return;
    if (attemptsRemaining <= 0) {
      setOpen(false);
      return;
    }

    const requestId =
      activeRequestIdRef.current || crypto.randomUUID();
    activeRequestIdRef.current = requestId;
    spinningRef.current = true;
    setSpinning(true);
    const generation = generationRef.current;
    const controller = new AbortController();
    spinControllerRef.current = controller;

    postSlotFrameMessage({
      type: "TOK_SLOT_SET_STATUS",
      message: "TOK Spin",
      subMessage: `Tour ${Math.max(maxAttempts - attemptsRemaining + 1, 1)}/${maxAttempts}. Les Miamz arrivent…`,
      enabled: false,
      attemptsRemaining,
      maxAttempts,
      sessionRewardPoints: sessionRewardPointsRef.current,
    });

    try {
      const response = await fetchWithFreshAccessToken(SLOT_ENDPOINT, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "Idempotency-Key": requestId,
        },
      });
      const payload = await readJsonResponse<SlotSpinResponse>(response);
      if (controller.signal.aborted || generation !== generationRef.current) return;
      const spin = payload.spin || null;
      if (!spin) {
        throw new Error("Tirage indisponible pour aujourd’hui.");
      }

      const nextMaxAttempts =
        normalizeAttemptCount(
          payload.maxAttempts,
          maxAttempts || DEFAULT_MAX_ATTEMPTS,
        ) || DEFAULT_MAX_ATTEMPTS;
      const nextAttemptsRemaining = normalizeAttemptCount(
        payload.attemptsRemaining,
        Math.max(attemptsRemaining - 1, 0),
      );
      const nextTotalLoyaltyPoints =
        typeof payload.totalLoyaltyPoints === "number"
          ? payload.totalLoyaltyPoints
          : null;

      setMaxAttempts(nextMaxAttempts);
      setAttemptsRemaining(nextAttemptsRemaining);
      updateLoyaltyCache(nextTotalLoyaltyPoints);

      if (payload.alreadyClaimed && !payload.idempotentReplay) {
        postSlotFrameMessage({
          type: "TOK_SLOT_SET_STATUS",
          message: "Terminé pour aujourd’hui",
          subMessage: `Vos ${nextMaxAttempts} essais sont déjà enregistrés. Revenez demain.`,
          enabled: false,
          attemptsRemaining: 0,
          maxAttempts: nextMaxAttempts,
          sessionRewardPoints: sessionRewardPointsRef.current,
        });
        setSpinIdle(true);
        setOpen(false);
        toast.info("Vos trois tours sont déjà terminés", {
          description: sessionRewardPointsRef.current > 0
            ? `${sessionRewardPointsRef.current} Miamz gagnés dans cette partie. Vos gains sont enregistrés. À demain !`
            : "Vos Miamz sont enregistrés. Revenez demain pour rejouer !",
        });
        return;
      }

      const rewardPoints = normalizeAttemptCount(spin.rewardPoints, 0);
      const spinId = spin.id || requestId;
      if (!creditedSpinsRef.current.has(spinId)) {
        creditedSpinsRef.current.add(spinId);
        sessionRewardPointsRef.current += rewardPoints;
      }
      pendingResultRef.current = {
        requestId,
        attemptsRemaining: nextAttemptsRemaining,
        sessionRewardPoints: sessionRewardPointsRef.current,
      };

      postSlotFrameMessage({
        type: "TOK_SLOT_SPIN_RESULT",
        requestId,
        symbols: normalizeFrameSymbols(spin.symbols),
        rewardPoints,
        rewardLabel: spin.rewardLabel || "Gain TOK",
        totalPoints: nextTotalLoyaltyPoints,
        attemptNumber:
          typeof spin.attemptNumber === "number"
            ? spin.attemptNumber
            : null,
        attemptsRemaining: nextAttemptsRemaining,
        maxAttempts: nextMaxAttempts,
        sessionRewardPoints: sessionRewardPointsRef.current,
      });

      clearAnimationWatchdog();
      animationWatchdogRef.current = window.setTimeout(() => {
        console.warn("[daily-slot-spin] animation completion timeout");
        finishSpinAnimation(requestId);
        postSlotFrameMessage({
          type: "TOK_SLOT_SET_STATUS",
          message: nextAttemptsRemaining > 0 ? "Vos Miamz sont enregistrés !" : "À demain !",
          subMessage: `${sessionRewardPointsRef.current} Miamz gagnés dans cette partie.`,
          enabled: nextAttemptsRemaining > 0,
          attemptsRemaining: nextAttemptsRemaining,
          maxAttempts: nextMaxAttempts,
          sessionRewardPoints: sessionRewardPointsRef.current,
        });
      }, ANIMATION_WATCHDOG_MS);
    } catch (spinError) {
      if (controller.signal.aborted || generation !== generationRef.current) return;
      postSlotFrameMessage({
        type: "TOK_SLOT_SET_STATUS",
        message: "Tirage interrompu",
        subMessage: spinError instanceof Error
          ? `${spinError.message} Réessayez sans perdre de tentative.`
          : "Impossible de lancer la machine TOK. Réessayez.",
        enabled: attemptsRemaining > 0,
        attemptsRemaining,
        maxAttempts,
        sessionRewardPoints: sessionRewardPointsRef.current,
      });

      // Keep the request id after an uncertain network failure. A retry then
      // replays the same database result instead of consuming another attempt.
      setSpinIdle(false);
    } finally {
      if (spinControllerRef.current === controller) spinControllerRef.current = null;
    }
  }, [
    attemptsRemaining,
    clearAnimationWatchdog,
    eligible,
    finishSpinAnimation,
    maxAttempts,
    open,
    postSlotFrameMessage,
    setSpinIdle,
    updateLoyaltyCache,
  ]);

  useEffect(() => {
    const onFrameMessage = (event: MessageEvent) => {
      if (!iframeRef.current?.contentWindow) return;
      if (event.origin !== window.location.origin) return;
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (!event.data || typeof event.data !== "object") return;

      if (event.data.type === "TOK_SLOT_FRAME_READY") {
        syncSlotFrameStatus();
        return;
      }

      if (event.data.type === "TOK_SLOT_SPIN_REQUEST") {
        void handleSpin();
        return;
      }

      if (event.data.type === "TOK_SLOT_ANIMATION_COMPLETE") {
        const completedRequestId =
          typeof event.data.requestId === "string"
            ? event.data.requestId
            : null;
        if (completedRequestId) finishSpinAnimation(completedRequestId);
      }
    };

    window.addEventListener("message", onFrameMessage);
    return () => window.removeEventListener("message", onFrameMessage);
  }, [finishSpinAnimation, handleSpin, syncSlotFrameStatus]);

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen && spinningRef.current) return;
    if (!nextOpen && completedRewardRef.current !== null) {
      closeCompletedGame();
      return;
    }
    setOpen(nextOpen);
  }, [closeCompletedGame]);

  if (!eligible) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        hideCloseButton
        className="fixed inset-0 left-0 top-0 z-[1830] h-[100dvh] max-h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-none border-0 bg-[#fff8ed] p-0 text-[#332115] shadow-none"
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => {
          if (spinningRef.current) event.preventDefault();
        }}
      >
        <DialogTitle className="sr-only">
          Machine à sous Miamz quotidienne
        </DialogTitle>
        <DialogDescription className="sr-only">
          Trois essais quotidiens. Chaque résultat et chaque crédit Miamz sont
          calculés et enregistrés côté serveur.
        </DialogDescription>

        <div className="pointer-events-none absolute left-3 right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-20 flex items-center justify-between gap-3 sm:left-5 sm:right-5">
          <div
            className="pointer-events-auto flex min-h-11 items-center gap-2 rounded-full border border-orange-200 bg-[#fffaf2]/95 px-4 py-2 text-xs font-bold text-[#69371d] shadow-sm backdrop-blur-md"
            aria-live="polite"
          >
            {spinning && (
              <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            )}
            {spinning
              ? "Les rouleaux tournent…"
              : attemptsRemaining > 0
                ? `${attemptsRemaining}/${maxAttempts} tours · ${sessionRewardPoints} Miamz gagnés`
                : `Bravo ! ${sessionRewardPoints} Miamz gagnés`}
          </div>

          <button
            type="button"
            onClick={() => handleOpenChange(false)}
            disabled={spinning}
            className="pointer-events-auto inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-white/95 text-slate-950 shadow-2xl transition hover:bg-orange-50 focus:outline-none focus:ring-2 focus:ring-orange-400 disabled:cursor-not-allowed disabled:opacity-45"
            aria-label={
              spinning
                ? "Fermeture indisponible pendant le tirage"
                : "Fermer la machine TOK"
            }
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <iframe
          ref={iframeRef}
          title="Machine à sous TOK"
          src={SLOT_MACHINE_FRAME_SRC}
          className="h-full w-full border-0 bg-[#fff8ed]"
          sandbox="allow-scripts allow-same-origin"
          onLoad={syncSlotFrameStatus}
        />
      </DialogContent>
    </Dialog>
  );
}
