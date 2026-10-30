import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useReducedMotion } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import { claimPlinko, getPlinkoStatus, isPlinkoSurface, parsePlinkoState, PlinkoSessionExpiredError, playPlinko, startPlinkoSession, type PlinkoState } from "@/lib/plinko";
import PlinkoDialog from "./PlinkoDialog";
import { createPlinkoTrajectory, PLINKO_POCKETS, type PlinkoTrajectory } from "@/lib/plinko-physics";

const TOKEN_KEY = "tok:plinko:welcome-v1:token";
const SHOWN_DAY_KEY = "tok:plinko:welcome-v1:shown-day";
const CLAIMED_KEY = "tok:plinko:welcome-v1:claimed";
const REQUEST_KEY = "tok:plinko:welcome-v1:request";
const CLAIM_REQUEST_KEY = "tok:plinko:welcome-v1:claim-request";
const OPEN_DELAY = 5_000;

function swissDay() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

function readStorage(storage: "localStorage" | "sessionStorage", key: string) {
  try { return window[storage].getItem(key); } catch { return null; }
}
function writeStorage(storage: "localStorage" | "sessionStorage", key: string, value: string | null) {
  try {
    if (value === null) window[storage].removeItem(key);
    else window[storage].setItem(key, value);
  } catch { /* The in-memory session remains playable when storage is blocked. */ }
}

export default function WelcomePlinko({ enabled = true, arrivedAt }: { enabled?: boolean; arrivedAt?: number }) {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();
  const reduceMotion = useReducedMotion();
  const eligible = enabled && !loading && !user && isPlinkoSurface(pathname);
  const arrival = useRef(arrivedAt ?? Date.now());
  const lastShownDay = useRef(readStorage("localStorage", SHOWN_DAY_KEY));
  const token = useRef<string | null>(readStorage("localStorage", TOKEN_KEY));
  const requestId = useRef<string | null>(readStorage("localStorage", REQUEST_KEY));
  const claimRequestId = useRef<string | null>(readStorage("localStorage", CLAIM_REQUEST_KEY));
  const locked = useRef(false);
  const mounted = useRef(true);
  const focusReturn = useRef<HTMLElement | null>(null);
  const openRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<PlinkoState | null>(null);
  const [busy, setBusy] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trajectory, setTrajectory] = useState<PlinkoTrajectory | null>(null);
  const finishAnimation = useCallback(() => setAnimating(false), []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const changeOpen = useCallback((next: boolean) => {
    if (next) focusReturn.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    openRef.current = next;
    setOpen(next);
    if (!next) setAnimating(false);
    if (!next) window.requestAnimationFrame(() => focusReturn.current?.focus());
  }, []);

  useEffect(() => {
    if (!eligible) { changeOpen(false); return; }
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    const maybeOpen = () => {
      if (cancelled) return;
      const day = swissDay();
      // Dismissals survive reloads and tabs, but not the next Swiss calendar day.
      if (readStorage("localStorage", CLAIMED_KEY) === "1"
        || lastShownDay.current === day
        || readStorage("localStorage", SHOWN_DAY_KEY) === day) return;
      // Give existing games, consent prompts and other dialogs their own turn.
      if (document.hidden || document.querySelector('[role="dialog"], [role="alertdialog"]')) {
        timer = setTimeout(maybeOpen, 500);
        return;
      }
      lastShownDay.current = day;
      writeStorage("localStorage", SHOWN_DAY_KEY, day);
      changeOpen(true);
    };
    timer = setTimeout(maybeOpen, Math.max(0, OPEN_DELAY - (Date.now() - arrival.current)));
    return () => { cancelled = true; clearTimeout(timer); };
  }, [eligible, changeOpen]);

  const loadSession = useCallback(async () => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError(null);
    try {
      let response: PlinkoState;
      try {
        response = token.current ? await getPlinkoStatus(token.current) : await startPlinkoSession();
      } catch (cause) {
        if (!(cause instanceof PlinkoSessionExpiredError)) throw cause;
        token.current = null;
        requestId.current = null;
        claimRequestId.current = null;
        for (const key of [TOKEN_KEY, REQUEST_KEY, CLAIM_REQUEST_KEY]) writeStorage("localStorage", key, null);
        response = await startPlinkoSession();
      }
      const next = parsePlinkoState(response);
      if (!token.current && !next.token) throw new Error("Le chef n’a pas pu préparer votre partie. Réessayez.");
      if (next.token) {
        token.current = next.token;
        writeStorage("localStorage", TOKEN_KEY, next.token);
      }
      if (next.reward && next.reward.status !== "pending_email") {
        writeStorage("localStorage", CLAIMED_KEY, "1");
      }
      if (mounted.current) {
        setState(next);
        if (!next.enabled) changeOpen(false);
      }
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : "Le jeu est momentanément indisponible.");
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  }, [changeOpen]);

  useEffect(() => { if (open && !state) void loadSession(); }, [open, state, loadSession]);

  const play = async () => {
    if (locked.current || animating || !state?.available || !token.current) return;
    locked.current = true;
    setBusy(true);
    setError(null);
    const id = requestId.current || crypto.randomUUID();
    requestId.current = id;
    writeStorage("localStorage", REQUEST_KEY, id);
    try {
      const next = parsePlinkoState(await playPlinko(token.current, id));
      if (!next.play) throw new Error("Le résultat n’est pas encore disponible. Réessayez pour le retrouver.");
      requestId.current = null;
      writeStorage("localStorage", REQUEST_KEY, null);
      if (mounted.current) {
        setState(next);
        // Physics never decides the reward or sends another play request.
        // On reopen/hidden response, reveal the already committed result directly.
        const animate = !reduceMotion && openRef.current && !document.hidden;
        setTrajectory(animate ? createPlinkoTrajectory(PLINKO_POCKETS.indexOf(next.play.outcome)) : null);
        setAnimating(animate);
      }
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : "La connexion a été interrompue. Réessayez pour retrouver votre tirage.");
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const claim = async (email: string, marketingConsent: boolean) => {
    if (locked.current || !token.current || !state?.reward) return;
    locked.current = true;
    setBusy(true);
    setError(null);
    const id = claimRequestId.current || crypto.randomUUID();
    claimRequestId.current = id;
    writeStorage("localStorage", CLAIM_REQUEST_KEY, id);
    try {
      const next = parsePlinkoState(await claimPlinko(token.current, id, email, marketingConsent));
      if (next.reward?.status !== "pending_fulfillment") throw new Error("Votre demande n’a pas été confirmée. Réessayez.");
      claimRequestId.current = null;
      writeStorage("localStorage", CLAIM_REQUEST_KEY, null);
      writeStorage("localStorage", CLAIMED_KEY, "1");
      if (mounted.current) setState(next);
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : "Votre demande n’a pas pu être enregistrée. Réessayez.");
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  if (!eligible || state?.enabled === false) return null;
  return <PlinkoDialog open={open} onOpenChange={changeOpen} state={state} busy={busy} animating={animating} error={error} trajectory={trajectory} onAnimationComplete={finishAnimation} onPlay={() => void play()} onRetry={() => void loadSession()} onClaim={(email, consent) => void claim(email, consent)} />;
}
