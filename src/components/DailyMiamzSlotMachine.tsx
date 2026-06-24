import { useEffect, useMemo, useState } from "react";
import { Bike, ChefHat, Gift, ShieldCheck, Sparkles, Trophy, Utensils } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { fetchWithFreshAccessToken } from "@/lib/session";
import { SUPABASE_URL } from "@/lib/env";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

const SLOT_ENDPOINT = `${SUPABASE_URL}/functions/v1/daily-slot-spin`;
const SYMBOL_SEQUENCE = ["tok_suisse", "fork", "chef", "courier", "logo", "miamz"] as const;

type SlotSymbolId = typeof SYMBOL_SEQUENCE[number];

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

const symbolLabels: Record<SlotSymbolId, { label: string; short: string; tone: string }> = {
  tok_suisse: { label: "Logo TOK Suisse", short: "TOK CH", tone: "from-red-500 to-orange-500" },
  fork: { label: "Monstre fourchette", short: "Fourchette", tone: "from-lime-400 to-emerald-500" },
  chef: { label: "Chef TOK", short: "Chef", tone: "from-white to-orange-100" },
  courier: { label: "Livreur TOK", short: "Livreur", tone: "from-slate-800 to-slate-950" },
  logo: { label: "Logo TOK", short: "TOK", tone: "from-orange-500 to-amber-300" },
  miamz: { label: "Bulle Miamz", short: "Miamz!", tone: "from-white to-orange-50" },
};

const paytable = [
  { symbols: "3x Logo TOK Suisse", points: 100 },
  { symbols: "3x Monstre fourchette", points: 60 },
  { symbols: "3x Chef TOK", points: 45 },
  { symbols: "3x Livreur TOK", points: 40 },
  { symbols: "3x Logo TOK", points: 30 },
  { symbols: "3x Bulle Miamz", points: 24 },
  { symbols: "2x Fourchette + Chef", points: 20 },
  { symbols: "2x Chef + Livreur", points: 16 },
  { symbols: "2x identiques", points: 3 },
];

function normalizeSymbol(value: unknown): SlotSymbolId {
  return SYMBOL_SEQUENCE.includes(value as SlotSymbolId) ? value as SlotSymbolId : "logo";
}

function normalizeSymbols(values: unknown): SlotSymbolId[] {
  if (!Array.isArray(values)) return ["logo", "chef", "miamz"];
  const normalized = values.slice(0, 3).map(normalizeSymbol);
  while (normalized.length < 3) normalized.push("logo");
  return normalized;
}

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

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function SymbolIcon({ symbol }: { symbol: SlotSymbolId }) {
  if (symbol === "logo" || symbol === "tok_suisse") {
    return (
      <img
        src="/logo.png"
        alt={symbolLabels[symbol].label}
        className="h-12 w-12 object-contain drop-shadow-[0_8px_14px_rgba(0,0,0,0.45)] sm:h-14 sm:w-14"
        draggable={false}
      />
    );
  }

  if (symbol === "chef") return <ChefHat className="h-10 w-10 text-orange-950" strokeWidth={2.4} />;
  if (symbol === "courier") return <Bike className="h-10 w-10 text-orange-300" strokeWidth={2.4} />;
  if (symbol === "fork") return <Utensils className="h-10 w-10 text-lime-950" strokeWidth={2.4} />;

  return <span className="font-['Playball'] text-2xl font-bold text-orange-600">Miamz!</span>;
}

function ReelTile({ symbol, spinning }: { symbol: SlotSymbolId; spinning: boolean }) {
  const label = symbolLabels[symbol];

  return (
    <div
      className={cn(
        "relative flex aspect-square min-w-0 flex-col items-center justify-center overflow-hidden rounded-[1.15rem] border border-orange-200/80 bg-gradient-to-br p-2 text-center shadow-[inset_0_2px_8px_rgba(255,255,255,0.85),0_12px_24px_rgba(0,0,0,0.22)]",
        label.tone,
        spinning && "animate-pulse",
      )}
    >
      <div className="absolute inset-1 rounded-[0.9rem] border border-white/50" />
      <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-white/75 shadow-inner sm:h-16 sm:w-16">
        <SymbolIcon symbol={symbol} />
      </div>
      <span className="relative mt-1 max-w-full truncate text-[0.62rem] font-black uppercase tracking-[0.08em] text-slate-950">
        {label.short}
      </span>
    </div>
  );
}

function ScreenMarquee({ text, accent }: { text: string; accent?: boolean }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-orange-300/55 bg-black/82 px-3 py-2 shadow-[inset_0_0_18px_rgba(255,106,0,0.22)]">
      <div
        className={cn(
          "tok-slot-marquee-track whitespace-nowrap text-sm font-black uppercase leading-tight tracking-[0.04em] text-white",
          accent && "text-orange-300",
        )}
      >
        {text}
      </div>
    </div>
  );
}

export default function DailyMiamzSlotMachine() {
  const { user, role, roles, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [animationTick, setAnimationTick] = useState(0);
  const [visibleSymbols, setVisibleSymbols] = useState<SlotSymbolId[]>(["logo", "chef", "miamz"]);
  const [result, setResult] = useState<SpinResult | null>(null);
  const [totalPoints, setTotalPoints] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const userId = user?.id || null;
  const hasPrivilegedRole = roles.some((entry) => entry === "admin" || entry === "restaurateur" || entry === "courier");

  const resultMessage = useMemo(() => {
    if (error) return error;
    if (result) {
      const label = result.rewardLabel || "Gain TOK";
      const points = Number(result.rewardPoints || 0);
      return `${label} - ${points} Miamz credites sur votre compte fidelite.`;
    }
    if (spinning) return "Tirage securise en cours - resultat calcule cote serveur TOK.";
    return "Chaque client peut lancer une fois par jour la machine a Miamz TOK.";
  }, [error, result, spinning]);

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

  useEffect(() => {
    if (!spinning) return;

    const interval = window.setInterval(() => {
      setAnimationTick((tick) => tick + 1);
    }, 85);

    return () => window.clearInterval(interval);
  }, [spinning]);

  useEffect(() => {
    if (!spinning) return;
    setVisibleSymbols([
      SYMBOL_SEQUENCE[(animationTick + 1) % SYMBOL_SEQUENCE.length],
      SYMBOL_SEQUENCE[(animationTick + 3) % SYMBOL_SEQUENCE.length],
      SYMBOL_SEQUENCE[(animationTick + 5) % SYMBOL_SEQUENCE.length],
    ]);
  }, [animationTick, spinning]);

  if (loading || checking || !userId || role !== "client" || hasPrivilegedRole) return null;

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
  };

  const handleSpin = async () => {
    if (spinning || result) {
      handleOpenChange(false);
      return;
    }

    setError(null);
    setSpinning(true);
    setAnimationTick(0);
    const minimumSpin = delay(1350);

    try {
      const response = await fetchWithFreshAccessToken(SLOT_ENDPOINT, { method: "POST" });
      const payload = await readJsonResponse<SlotSpinResponse>(response);
      await minimumSpin;
      const spin = payload.spin || null;

      if (!spin) throw new Error("Tirage indisponible pour aujourd'hui.");

      setResult(spin);
      setTotalPoints(typeof payload.totalLoyaltyPoints === "number" ? payload.totalLoyaltyPoints : null);
      setVisibleSymbols(normalizeSymbols(spin.symbols));
    } catch (spinError) {
      await minimumSpin;
      setError(spinError instanceof Error ? spinError.message : "Impossible de lancer la machine TOK.");
    } finally {
      setSpinning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="fixed inset-0 left-0 top-0 z-[1400] h-[100dvh] max-h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 gap-0 overflow-y-auto rounded-none border-0 bg-[#090502] p-0 text-white shadow-none data-[state=open]:slide-in-from-bottom-8 sm:left-[50%] sm:top-[50%] sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:w-[min(94vw,720px)] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-[2rem] sm:border sm:border-orange-500/40">
        <DialogTitle className="sr-only">Machine a sous Miamz quotidienne</DialogTitle>
        <DialogDescription className="sr-only">
          Lancez une fois par jour la machine TOK pour gagner des Miamz.
        </DialogDescription>

        <div className="relative min-h-full overflow-hidden px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-[calc(env(safe-area-inset-top,0px)+1rem)] sm:min-h-0 sm:px-6 sm:py-6">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,125,26,0.35),transparent_32%),radial-gradient(circle_at_15%_38%,rgba(255,196,87,0.2),transparent_28%),linear-gradient(180deg,#140903_0%,#090502_42%,#050201_100%)]" />
          <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-orange-500/20 to-transparent" />

          <div className="relative mx-auto flex w-full max-w-[430px] flex-col items-center gap-4 sm:max-w-[620px]">
            <div className="flex w-full items-center justify-between gap-3">
              <img src="/logo.png" alt="TOK" className="h-16 w-16 object-contain drop-shadow-[0_0_24px_rgba(255,106,0,0.65)]" draggable={false} />
              <div className="min-w-0 flex-1 text-center">
                <p className="text-[0.72rem] font-black uppercase tracking-[0.2em] text-orange-300">Mangez mieux, vivez mieux</p>
                <h2 className="mt-1 text-3xl font-black uppercase leading-none tracking-[0.02em] text-white sm:text-4xl">
                  Tableau <span className="text-orange-500">des gains</span>
                </h2>
              </div>
              <Gift className="h-10 w-10 shrink-0 text-orange-300" strokeWidth={2.4} />
            </div>

            <div className="w-full rounded-[1.65rem] border border-orange-300/70 bg-gradient-to-b from-orange-500 via-orange-600 to-[#6b2105] p-3 shadow-[0_22px_70px_rgba(0,0,0,0.62),inset_0_2px_0_rgba(255,255,255,0.55)] sm:p-4">
              <div className="grid grid-cols-[0.78fr_1.22fr] gap-3">
                <div className="flex items-center justify-center rounded-2xl border border-orange-200 bg-gradient-to-br from-white to-orange-100 p-2 shadow-[inset_0_0_24px_rgba(255,255,255,0.85)]">
                  <img src="/logo.png" alt="TOK" className="h-16 object-contain" draggable={false} />
                </div>
                <ScreenMarquee text={resultMessage} accent={Boolean(result)} />
              </div>

              <div className="mt-3 rounded-[1.4rem] border border-slate-950 bg-gradient-to-b from-white to-orange-50 p-3 shadow-[inset_0_5px_18px_rgba(0,0,0,0.2)]">
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  {visibleSymbols.map((symbol, index) => (
                    <ReelTile key={`${symbol}-${index}`} symbol={symbol} spinning={spinning} />
                  ))}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-[0.9fr_1.2fr_0.9fr] gap-2">
                <div className="rounded-xl border border-orange-300/70 bg-black/86 p-3">
                  <p className="text-[0.64rem] font-black uppercase tracking-[0.14em] text-orange-200">Credit</p>
                  <p className="text-2xl font-black">{totalPoints ?? "--"}</p>
                </div>
                <button
                  type="button"
                  onClick={handleSpin}
                  disabled={spinning}
                  className="rounded-xl border border-orange-200 bg-gradient-to-b from-orange-300 via-orange-500 to-orange-700 px-3 py-3 text-base font-black uppercase text-slate-950 shadow-[0_10px_0_#5e1d03,0_18px_28px_rgba(0,0,0,0.32)] transition active:translate-y-1 active:shadow-[0_5px_0_#5e1d03,0_12px_20px_rgba(0,0,0,0.28)] disabled:cursor-wait disabled:opacity-80"
                >
                  {spinning ? "Spin..." : result ? "Continuer" : "TOK Spin"}
                </button>
                <div className="rounded-xl border border-orange-300/70 bg-black/86 p-3">
                  <p className="text-[0.64rem] font-black uppercase tracking-[0.14em] text-orange-200">Gain</p>
                  <p className="text-2xl font-black">{result?.rewardPoints ?? "--"}</p>
                </div>
              </div>
            </div>

            <div className="grid w-full grid-cols-3 gap-2 text-[0.68rem] font-black uppercase sm:grid-cols-6">
              <div className="rounded-full border border-orange-500/70 px-2 py-2 text-center text-orange-100">3x Chef +45</div>
              <div className="rounded-full border border-orange-500/70 px-2 py-2 text-center text-orange-100">3x Logo +30</div>
              <div className="rounded-full border border-orange-500/70 px-2 py-2 text-center text-orange-100">2x = +3</div>
              <div className="rounded-full border border-orange-500/70 px-2 py-2 text-center text-orange-100">Jackpot +100</div>
              <div className="rounded-full border border-orange-500/70 px-2 py-2 text-center text-orange-100">Miamz +24</div>
              <div className="rounded-full border border-orange-500/70 px-2 py-2 text-center text-orange-100">Equipe +8</div>
            </div>

            <div className="w-full rounded-[1.2rem] border border-orange-500/35 bg-black/55 p-3 shadow-[inset_0_0_32px_rgba(255,106,0,0.12)]">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.12em] text-orange-300">
                  <Trophy className="h-4 w-4" />
                  Gains possibles
                </div>
                <div className="flex items-center gap-1 text-[0.7rem] font-bold text-white/70">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" />
                  Tirage serveur
                </div>
              </div>
              <div className="grid max-h-48 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                {paytable.map((entry) => (
                  <div key={entry.symbols} className="flex items-center justify-between rounded-xl border border-orange-500/35 bg-black/45 px-3 py-2">
                    <span className="min-w-0 pr-2 text-xs font-bold text-white/86">{entry.symbols}</span>
                    <span className="shrink-0 text-lg font-black text-orange-400">+{entry.points}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 text-center text-xs font-bold text-white/72">
              <Sparkles className="h-4 w-4 shrink-0 text-orange-300" />
              Affichee a chaque connexion client eligible. Le credit reste limite a une fois par jour par Supabase.
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
