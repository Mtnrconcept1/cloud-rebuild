import { useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  BarChart3,
  Bot,
  CalendarDays,
  Check,
  ChevronRight,
  CirclePause,
  Gauge,
  Link2,
  ListChecks,
  LogOut,
  Menu,
  Megaphone,
  Play,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";

import ThemeToggleButton from "@/components/theme/ThemeToggleButton";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { getAdminNavigationHref } from "@/lib/adminDomains";
import { cn } from "@/lib/utils";
import { useMarketingSession } from "@/marketing/MarketingSessionContext";
import type { MarketingSnapshot, MarketingView } from "@/marketing/types";

const NAV_ITEMS: Array<{
  id: MarketingView;
  label: string;
  shortLabel: string;
  description: string;
  icon: typeof Gauge;
}> = [
  { id: "overview", label: "Vue d'ensemble", shortLabel: "Aperçu", description: "Santé, volumes et prochaines actions", icon: Gauge },
  { id: "calendar", label: "Calendrier", shortLabel: "Calendrier", description: "Publications et envois planifiés", icon: CalendarDays },
  { id: "campaigns", label: "Campagnes", shortLabel: "Campagnes", description: "Création, validation et diffusion", icon: Megaphone },
  { id: "audiences", label: "Audiences & prospects", shortLabel: "Audiences", description: "Segments, ciblage et priorités", icon: Users },
  { id: "automations", label: "Automatisations", shortLabel: "Automations", description: "Déclencheurs, règles et garde-fous", icon: Bot },
  { id: "activity", label: "Journal des envois", shortLabel: "Journal", description: "Qui, quand, canal et résultat", icon: ListChecks },
  { id: "results", label: "Résultats", shortLabel: "Résultats", description: "Performance et attribution", icon: BarChart3 },
  { id: "integrations", label: "Intégrations", shortLabel: "Intégrations", description: "État réel des fournisseurs", icon: Link2 },
];

function Navigation({
  activeView,
  onViewChange,
  compact = false,
}: {
  activeView: MarketingView;
  onViewChange: (view: MarketingView) => void;
  compact?: boolean;
}) {
  return (
    <nav className="space-y-1" aria-label="Sections marketing">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const selected = activeView === item.id;
        return (
          <button
            key={item.id}
            type="button"
            aria-current={selected ? "page" : undefined}
            onClick={() => onViewChange(item.id)}
            className={cn(
              "group flex w-full min-w-0 items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400",
              selected
                ? "bg-orange-500 text-white shadow-lg shadow-orange-950/20"
                : "text-slate-300 hover:bg-white/[0.08] hover:text-white",
            )}
          >
            <span className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
              selected ? "bg-white/20" : "bg-white/5 text-slate-400 group-hover:text-white",
            )}>
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{compact ? item.shortLabel : item.label}</span>
              {!compact ? <span className={cn("mt-0.5 block truncate text-[11px]", selected ? "text-orange-50/80" : "text-slate-500")}>{item.description}</span> : null}
            </span>
            {selected ? <Check className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
          </button>
        );
      })}
    </nav>
  );
}

export default function MarketingWorkspaceChrome({
  activeView,
  snapshot,
  canMutateBackend,
  refreshing,
  pausePending,
  onViewChange,
  onRefresh,
  onTogglePause,
  children,
}: {
  activeView: MarketingView;
  snapshot: MarketingSnapshot;
  canMutateBackend: boolean;
  refreshing: boolean;
  pausePending: boolean;
  onViewChange: (view: MarketingView) => void;
  onRefresh: () => void;
  onTogglePause: (paused: boolean, reason: string) => Promise<unknown>;
  children: ReactNode;
}) {
  const { logout, submitting: sessionPending } = useMarketingSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pauseDialogOpen, setPauseDialogOpen] = useState(false);
  const [pauseReason, setPauseReason] = useState("");
  const activeItem = useMemo(() => NAV_ITEMS.find((item) => item.id === activeView) || NAV_ITEMS[0], [activeView]);
  const targetPaused = !snapshot.overview.globalPaused;
  const reasonValid = pauseReason.trim().length >= 8;
  const runtimeLabel = snapshot.overview.globalPaused
    ? "Traitements en pause"
    : snapshot.overview.schedulerReady
      ? "Orchestrateur autorisé"
      : "Planificateur indisponible";

  const selectView = (view: MarketingView) => {
    onViewChange(view);
    setMobileOpen(false);
  };

  const confirmPause = async () => {
    if (!reasonValid || pausePending) return;
    const result = await onTogglePause(targetPaused, pauseReason.trim());
    if (result) {
      setPauseDialogOpen(false);
      setPauseReason("");
    }
  };

  return (
    <div className="min-h-[100dvh] bg-slate-50 text-slate-950 dark:bg-[#06101e] dark:text-slate-50">
      <a href="#marketing-main" className="sr-only z-[2000] rounded-md bg-orange-500 px-4 py-2 text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Aller au contenu marketing
      </a>

      <aside className="fixed inset-y-0 left-0 z-[1200] hidden w-[18rem] flex-col border-r border-white/[0.08] bg-[#07111f] px-4 py-5 text-white lg:flex">
        <div className="flex items-center gap-3 px-2">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-amber-400 shadow-lg shadow-orange-950/40">
            <Megaphone className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold tracking-tight">Marketing Operations</p>
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-orange-300">TheTOK · Admin</p>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-white/[0.08] bg-white/[0.035] p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-400">État global</span>
            <span className={cn("h-2.5 w-2.5 rounded-full", snapshot.overview.globalPaused ? "bg-amber-400" : snapshot.overview.schedulerReady ? "bg-emerald-400" : "bg-rose-400")} />
          </div>
          <p className="mt-2 text-sm font-semibold">{runtimeLabel}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">{snapshot.overview.globalPaused && snapshot.overview.globalPauseReason ? snapshot.overview.globalPauseReason : "Mode gratuit · approbation obligatoire"}</p>
        </div>

        <div className="mt-5 min-h-0 flex-1 overflow-y-auto pr-1">
          <Navigation activeView={activeView} onViewChange={selectView} />
        </div>

        <a
          href={getAdminNavigationHref("/admin")}
          className="mt-4 flex items-center justify-between rounded-xl border border-white/10 px-3 py-2.5 text-sm font-semibold text-slate-300 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
        >
          Retour à l'administration
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </a>
      </aside>

      <div className="min-w-0 lg:pl-[18rem]">
        <header className="sticky top-0 z-[1100] border-b border-border/70 bg-background/95 backdrop-blur-xl">
          <div className="flex min-h-16 items-center gap-3 px-3 pb-2 pt-[calc(env(safe-area-inset-top,0px)+0.5rem)] sm:px-5 lg:px-7">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button type="button" variant="outline" size="icon" className="shrink-0 lg:hidden" aria-label="Ouvrir la navigation marketing">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="border-r-white/10 bg-[#07111f] text-white">
                <SheetHeader className="pr-8 text-left">
                  <SheetTitle className="text-white">Marketing Operations</SheetTitle>
                  <SheetDescription className="text-slate-400">Espace administrateur isolé</SheetDescription>
                </SheetHeader>
                <div className="mt-6">
                  <Navigation activeView={activeView} onViewChange={selectView} compact />
                </div>
              </SheetContent>
            </Sheet>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold sm:text-base">{activeItem.label}</p>
              <p className="hidden truncate text-xs text-muted-foreground sm:block">{activeItem.description}</p>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onRefresh}
              disabled={refreshing}
              aria-label="Actualiser les données marketing"
            >
              <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            </Button>
            <ThemeToggleButton className="h-10 w-10" />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => void logout()}
              disabled={sessionPending}
              aria-label="Se déconnecter du centre marketing"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant={snapshot.overview.globalPaused ? "outline" : "destructive"}
              size="sm"
              disabled={!canMutateBackend || pausePending}
              onClick={() => setPauseDialogOpen(true)}
              className="hidden shrink-0 sm:inline-flex"
            >
              {snapshot.overview.globalPaused ? <Play className="mr-2 h-4 w-4" /> : <CirclePause className="mr-2 h-4 w-4" />}
              {snapshot.overview.globalPaused ? "Lever la pause" : "Pause globale"}
            </Button>
          </div>
        </header>

        <main id="marketing-main" className="mx-auto w-full max-w-[1600px] min-w-0 px-3 py-4 sm:px-5 sm:py-6 lg:px-7 lg:py-7">
          <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-background px-3 py-2 sm:hidden">
            <div className="flex min-w-0 items-center gap-2">
              <Activity className={cn("h-4 w-4 shrink-0", snapshot.overview.globalPaused ? "text-amber-500" : snapshot.overview.schedulerReady ? "text-emerald-500" : "text-rose-500")} />
              <span className="truncate text-xs font-semibold">{runtimeLabel}</span>
            </div>
            <Button type="button" variant="outline" size="sm" disabled={!canMutateBackend || pausePending} onClick={() => setPauseDialogOpen(true)}>
              {snapshot.overview.globalPaused ? "Reprendre" : "Pause"}
            </Button>
          </div>
          {children}
        </main>
      </div>

      <Dialog open={pauseDialogOpen} onOpenChange={setPauseDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-orange-500" />
              {targetPaused ? "Activer la pause globale" : "Lever la pause globale"}
            </DialogTitle>
            <DialogDescription>
              {targetPaused
                ? "Les traitements en cours ne sont pas effacés, mais l'orchestrateur refusera tout nouveau départ."
                : "Seuls les éléments approuvés, éligibles et correctement configurés pourront reprendre."}
            </DialogDescription>
          </DialogHeader>
          <div>
            <label htmlFor="marketing-pause-reason" className="text-sm font-semibold">Motif de la décision</label>
            <Textarea
              id="marketing-pause-reason"
              value={pauseReason}
              onChange={(event) => setPauseReason(event.target.value)}
              placeholder="Minimum 8 caractères, enregistré dans l'audit…"
              className="mt-2"
              maxLength={400}
            />
            <p className="mt-1 text-xs text-muted-foreground">{pauseReason.trim().length}/400 · minimum 8 caractères</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPauseDialogOpen(false)}>Annuler</Button>
            <Button type="button" variant={targetPaused ? "destructive" : "default"} disabled={!reasonValid || pausePending} onClick={confirmPause}>
              {pausePending ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirmer et journaliser
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
