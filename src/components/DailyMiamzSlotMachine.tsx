import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { fetchWithFreshAccessToken } from "@/lib/session";
import { SUPABASE_URL } from "@/lib/env";
import { useAuth } from "@/lib/auth-context";

const SLOT_ENDPOINT = `${SUPABASE_URL}/functions/v1/daily-slot-spin`;
const SLOT_MACHINE_FRAME_SRC = "/tok-slot-machine/index.html";

type SpinResult = {
  id?: string;
  spinDate?: string;
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
    }
  | {
      type: "TOK_SLOT_SPIN_RESULT";
      symbols: string[];
      rewardPoints: number;
      rewardLabel: string;
      totalPoints: number | null;
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

export default function DailyMiamzSlotMachine() {
  const { user, role, roles, loading } = useAuth();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<SpinResult | null>(null);

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
          if (payload.available) {
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

  const handleSpin = useCallback(async () => {
    if (spinning) return;
    if (result) {
      setOpen(false);
      return;
    }

    setSpinning(true);
    postSlotFrameMessage({
      type: "TOK_SLOT_SET_STATUS",
      message: "TOK SPIN",
      subMessage: "Tirage sécurisé côté serveur TOK...",
      enabled: false,
    });

    const minimumServerHold = delay(350);

    try {
      const response = await fetchWithFreshAccessToken(SLOT_ENDPOINT, { method: "POST" });
      const payload = await readJsonResponse<SlotSpinResponse>(response);
      await minimumServerHold;
      const spin = payload.spin || null;

      if (!spin) throw new Error("Tirage indisponible pour aujourd'hui.");

      setResult(spin);
      postSlotFrameMessage({
        type: "TOK_SLOT_SPIN_RESULT",
        symbols: normalizeFrameSymbols(spin.symbols),
        rewardPoints: Number(spin.rewardPoints || 0),
        rewardLabel: spin.rewardLabel || "Gain TOK",
        totalPoints: typeof payload.totalLoyaltyPoints === "number" ? payload.totalLoyaltyPoints : null,
      });
    } catch (spinError) {
      await minimumServerHold;
      postSlotFrameMessage({
        type: "TOK_SLOT_SET_STATUS",
        message: "Erreur TOK",
        subMessage: spinError instanceof Error ? spinError.message : "Impossible de lancer la machine TOK.",
        enabled: true,
      });
    } finally {
      setSpinning(false);
    }
  }, [postSlotFrameMessage, result, spinning]);

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

  if (loading || checking || !userId || role !== "client" || hasPrivilegedRole) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="fixed inset-0 left-0 top-0 z-[1400] h-[100dvh] max-h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-none border-0 bg-[#050201] p-0 text-white shadow-none">
        <DialogTitle className="sr-only">Machine a sous Miamz quotidienne</DialogTitle>
        <DialogDescription className="sr-only">
          Affichee a chaque connexion client eligible. Le credit reste limite a une fois par jour par Supabase.
        </DialogDescription>
        <iframe
          ref={iframeRef}
          title="Machine à sous TOK"
          src={SLOT_MACHINE_FRAME_SRC}
          className="h-full w-full border-0 bg-[#050201]"
          sandbox="allow-scripts allow-same-origin"
        />
      </DialogContent>
    </Dialog>
  );
}
