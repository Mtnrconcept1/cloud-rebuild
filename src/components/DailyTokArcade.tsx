import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Gift, LoaderCircle, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth-context";
import { SUPABASE_URL } from "@/lib/env";
import { fetchWithFreshAccessToken } from "@/lib/session";
import { createPlinkoTrajectory, PLINKO_POCKETS, type PlinkoTrajectory } from "@/lib/plinko-physics";
import PlinkoBoard from "@/components/plinko/PlinkoBoard";
import DailyMiamzSlotMachine from "@/components/DailyMiamzSlotMachine";
import "@/components/plinko/plinko.css";

export type DailyArcadeGame = "slot" | "plinko" | "claw";
export type DailyArcadeStatus = {
  ok: boolean;
  game: DailyArcadeGame;
  playDate: string;
  maxAttempts: number;
  attemptsUsed: number;
  attemptsRemaining: number;
  sessionRewardPoints: number;
  available: boolean;
};
type PlayResponse = DailyArcadeStatus & {
  alreadyClaimed?: boolean;
  idempotentReplay?: boolean;
  play?: {
    id: string;
    requestId: string;
    rewardPoints: number;
    attemptNumber: number;
    toyType: string | null;
  };
  totalLoyaltyPoints?: number | null;
};
type PendingPlay = {
  requestId: string;
  body: { game: "claw" | "plinko"; captured?: boolean; toyType?: string | null };
};

const ENDPOINT = SUPABASE_URL + "/functions/v1/daily-arcade-play";
const CLAW_ORIGIN = "https://tok-miamz-claw-arcade.vercel.app";
const PRIZES = [1, 3, 5, 7, 10];
const MAX_ATTEMPTS = 3;
const VALID_GAMES = new Set(["slot", "plinko", "claw"]);
const VALID_TOYS = new Set(["classic", "basil", "spicy", "thefork", "miamz", "tokball"]);

function safeCount(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100000, Math.trunc(number))) : fallback;
}

function decodeStatus(value: unknown): DailyArcadeStatus | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.ok !== true || !VALID_GAMES.has(String(record.game)) || typeof record.playDate !== "string") return null;
  const maxAttempts = safeCount(record.maxAttempts, MAX_ATTEMPTS);
  const attemptsUsed = safeCount(record.attemptsUsed, 0);
  return {
    ok: true, game: record.game as DailyArcadeGame, playDate: record.playDate,
    maxAttempts: maxAttempts || MAX_ATTEMPTS,
    attemptsUsed,
    attemptsRemaining: Math.min(maxAttempts || MAX_ATTEMPTS, safeCount(record.attemptsRemaining, 0)),
    sessionRewardPoints: safeCount(record.sessionRewardPoints, 0),
    available: record.available === true,
  };
}

async function jsonOrThrow<T>(response: Response): Promise<T> {
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = result && typeof result === "object" && "error" in result
      ? String((result as { error?: unknown }).error || "Jeu indisponible")
      : "Jeu TOK indisponible";
    throw new Error(message);
  }
  return result as T;
}

export function DailyArcadeMiniGame({ initial }: { initial: DailyArcadeStatus }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const client = useQueryClient();
  const frame = useRef<HTMLIFrameElement | null>(null);
  const pending = useRef<PendingPlay | null>(null);
  const busyRef = useRef(false);
  const finishingRef = useRef(false);
  const seenClawAttempts = useRef(new Set<number>());
  const timerRef = useRef<number | null>(null);
  const game = initial.game;
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [attemptsLeft, setAttemptsLeft] = useState(initial.attemptsRemaining);
  const [earned, setEarned] = useState(initial.sessionRewardPoints);
  const [lastPrize, setLastPrize] = useState<number | null>(null);
  const [summary, setSummary] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trajectory, setTrajectory] = useState<PlinkoTrajectory | null>(null);
  const [pocket, setPocket] = useState<number | null>(null);
  const [animating, setAnimating] = useState(false);
  const animationLockRef = useRef(false);

  const clawUrl = useMemo(() => CLAW_ORIGIN + "/?embed=tok&parentOrigin=" + encodeURIComponent(window.location.origin), []);

  const complete = useCallback((nextRemaining: number, nextReward: number) => {
    if (nextRemaining <= 0 && !finishingRef.current) {
      finishingRef.current = true;
      setSummary(true);
      timerRef.current = window.setTimeout(() => {
        setOpen(false);
        toast.success(String(nextReward) + " Miamz remportés aujourd’hui !", {
          description: "Vos trois essais sont terminés. À demain pour un nouveau jeu TOK !",
        });
      }, 2600);
    }
  }, []);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  const syncClaw = useCallback(() => {
    frame.current?.contentWindow?.postMessage({
      type: "TOK_CLAW_SET_ATTEMPTS",
      attemptsRemaining: attemptsLeft,
      maxAttempts: initial.maxAttempts,
    }, CLAW_ORIGIN);
  }, [attemptsLeft, initial.maxAttempts]);

  useEffect(() => {
    if (game === "claw" && open) syncClaw();
  }, [game, open, syncClaw]);

  const submit = useCallback(async (request: PendingPlay) => {
    if (busyRef.current || !open || !userId || finishingRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    pending.current = request;
    try {
      const response = await fetchWithFreshAccessToken(ENDPOINT, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json", "Idempotency-Key": request.requestId },
        body: JSON.stringify(request.body),
      });
      const result = await jsonOrThrow<PlayResponse>(response);
      if (!result.play) throw new Error("Le résultat sécurisé est indisponible.");
      const remaining = safeCount(result.attemptsRemaining, attemptsLeft);
      const total = safeCount(result.sessionRewardPoints, earned);
      const award = safeCount(result.play.rewardPoints, 0);
      setAttemptsLeft(remaining);
      setEarned(total);
      setLastPrize(award);
      pending.current = null;
      if (typeof result.totalLoyaltyPoints === "number") {
        client.setQueriesData<Record<string, unknown>>(
          { queryKey: ["profile-loyalty", userId] },
          (prev) => prev ? { ...prev, loyalty_points: result.totalLoyaltyPoints } : prev,
        );
      }
      void client.invalidateQueries({ queryKey: ["loyalty-transactions", userId] });
      if (game === "plinko" && !result.alreadyClaimed) {
        const prizeIndex = PRIZES.indexOf(award);
        const index = prizeIndex >= 0 ? prizeIndex : 0;
        setPocket(index);
        try {
          const path = createPlinkoTrajectory(index);
          animationLockRef.current = true;
          setTrajectory(path);
          setAnimating(true);
        } catch {
          animationLockRef.current = false;
          setAnimating(false);
          complete(remaining, total);
        }
      } else {
        complete(remaining, total);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible d’enregistrer votre essai.");
      // The same UUID is preserved for a retry; a network failure must never double-credit.
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [open, userId, attemptsLeft, earned, client, game, complete]);

  const retry = useCallback(() => {
    if (pending.current) void submit(pending.current);
  }, [submit]);

  const playPlinko = useCallback(() => {
    if (busyRef.current || animating || attemptsLeft <= 0 || pending.current) return;
    void submit({ requestId: crypto.randomUUID(), body: { game: "plinko" } });
  }, [submit, attemptsLeft, animating]);

  const finishPlinko = useCallback(() => {
    if (!animationLockRef.current) return;
    animationLockRef.current = false;
    setAnimating(false);
    complete(attemptsLeft, earned);
  }, [attemptsLeft, earned, complete]);

  useEffect(() => {
    if (!animating) return;
    const watchdog = window.setTimeout(finishPlinko, 7500);
    return () => window.clearTimeout(watchdog);
  }, [animating, finishPlinko]);

  useEffect(() => {
    if (game !== "claw" || !open) return;
    const onFrameEvent = (event: MessageEvent) => {
      if (event.origin !== CLAW_ORIGIN || event.source !== frame.current?.contentWindow) return;
      const data = event.data;
      if (!data || typeof data !== "object") return;
      if (data.type === "TOK_CLAW_READY") { syncClaw(); return; }
      if (data.type !== "TOK_CLAW_RESULT" || pending.current || busyRef.current || attemptsLeft <= 0) return;
      const attempt = Number(data.attemptNumber);
      if (!Number.isInteger(attempt) || attempt < 1 || attempt > initial.maxAttempts || seenClawAttempts.current.has(attempt)) return;
      const captured = data.captured === true;
      const toyType = captured && typeof data.toyType === "string" && VALID_TOYS.has(data.toyType) ? data.toyType : null;
      if (captured && !toyType) return;
      seenClawAttempts.current.add(attempt);
      void submit({ requestId: crypto.randomUUID(), body: { game: "claw", captured, toyType } });
    };
    window.addEventListener("message", onFrameEvent);
    return () => window.removeEventListener("message", onFrameEvent);
  }, [game, open, attemptsLeft, initial.maxAttempts, submit, syncClaw]);

  const close = useCallback(() => {
    if (busyRef.current || animating) return;
    setOpen(false);
  }, [animating]);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) close(); }}>
      <DialogContent
        hideCloseButton
        className="fixed inset-0 left-0 top-0 z-[1830] flex h-[100dvh] max-h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-[#fff9ef] p-0 text-[#282019] shadow-none"
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogTitle className="sr-only">{game === "claw" ? "Attrape-figurines TOK" : "Plinko TOK"} quotidien</DialogTitle>
        <DialogDescription className="sr-only">
          Trois tentatives quotidiennes, récompenses Miamz enregistrées côté serveur.
        </DialogDescription>
        <div className="pointer-events-none absolute inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-30 flex justify-between gap-2 sm:inset-x-6">
          <div className="rounded-full border border-orange-200 bg-[#fffdf7]/95 px-4 py-2.5 text-xs font-bold text-[#754220] shadow-md backdrop-blur-sm" aria-live="polite">
            {Math.max(0, attemptsLeft)}/{initial.maxAttempts} essais · {earned} Miamz
          </div>
          <button type="button" onClick={close} disabled={busy || animating}
            className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border border-orange-200 bg-white text-[#39251a] shadow-md disabled:opacity-50"
            aria-label="Fermer le mini-jeu"><X size={20} /></button>
        </div>
        {game === "claw" ? (
          <div className="relative min-h-0 flex-1">
            <iframe ref={frame} title="TOK Miamz — attrape-figurines" src={clawUrl}
              className="h-full w-full border-0" sandbox="allow-scripts allow-same-origin"
              onLoad={syncClaw} />
            {busy && <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/30" aria-live="polite">
              <span className="rounded-2xl bg-white px-5 py-4 text-sm font-semibold shadow-lg"><LoaderCircle className="mr-2 inline h-5 w-5 animate-spin" />Enregistrement des Miamz…</span>
            </div>}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 overflow-y-auto px-3 pb-8 pt-24">
            <div className="w-full max-w-[500px]">
              <h2 className="mb-4 text-center font-serif text-3xl font-black">Plinko <span className="text-[#fc6012]">Miamz!</span></h2>
              <PlinkoBoard
                dailyMiamz
                outcome={pocket === null ? undefined : PLINKO_POCKETS[pocket]}
                playing={busy || animating} animating={animating} trajectory={trajectory}
                onAnimationComplete={finishPlinko}
              />
            </div>
            {lastPrize !== null && !animating && <p className="text-lg font-bold text-[#dc4d00]" aria-live="polite">+{lastPrize} Miamz !</p>}
            <button type="button" onClick={playPlinko}
              disabled={busy || animating || attemptsLeft <= 0 || Boolean(pending.current)}
              className="min-h-12 rounded-full bg-[#fc6012] px-12 py-3 text-base font-extrabold text-white shadow-lg disabled:opacity-50">
              {busy ? "Tirage sécurisé…" : animating ? "Le Miamz rebondit…" : "Lancer un Miamz"}
            </button>
          </div>
        )}
        {error && !summary && <div role="alert" className="absolute inset-x-4 bottom-6 z-40 rounded-xl bg-white p-4 text-sm text-red-800 shadow-lg">
          {error}
          <button type="button" onClick={retry} className="ml-3 rounded-lg bg-[#fc6012] px-4 py-2 text-white">Réessayer sans perdre d’essai</button>
        </div>}
        {summary && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#fff9ef]/95 px-5 text-center backdrop-blur-md" role="status" aria-live="assertive">
            <Gift size={48} className="mb-5 text-[#fc6012]" />
            <h2 className="font-serif text-4xl font-black">Bravo !</h2>
            <p className="mt-3 text-xl">Vos 3 essais sont terminés.</p>
            <div className="mt-4 text-6xl font-black text-[#fc6012]">{earned}</div>
            <p className="text-lg font-semibold">Miamz remportés</p>
            <p className="mt-5 text-sm text-[#685342]">Revenez demain pour découvrir un nouveau jeu.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function DailyTokArcade() {
  const { user, role, roles, loading } = useAuth();
  const [status, setStatus] = useState<DailyArcadeStatus | null>(null);
  const eligible = !loading && Boolean(user?.id) && role === "client" &&
    !roles.some((value) => value === "admin" || value === "courier" || value === "restaurateur");

  useEffect(() => {
    setStatus(null);
    if (!eligible) return;
    const controller = new AbortController();
    void fetchWithFreshAccessToken(ENDPOINT, {
      method: "GET", signal: controller.signal, headers: { Accept: "application/json" },
    }).then((response) => jsonOrThrow<unknown>(response))
      .then((response) => {
        if (!controller.signal.aborted) setStatus(decodeStatus(response));
      })
      .catch((error) => {
        if (!controller.signal.aborted) console.warn("[tok-daily-arcade] status unavailable", error);
      });
    return () => controller.abort();
  }, [eligible, user?.id]);

  if (!eligible || !status || !status.available || status.attemptsRemaining <= 0) return null;
  if (status.game === "slot") return <DailyMiamzSlotMachine />;
  return <DailyArcadeMiniGame key={status.playDate + status.game + user?.id} initial={status} />;
}
