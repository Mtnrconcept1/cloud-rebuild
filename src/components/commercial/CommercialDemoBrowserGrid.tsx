import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ComponentType,
  type RefObject,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Bike,
  ExternalLink,
  House,
  LayoutGrid,
  Maximize2,
  Minimize2,
  Monitor,
  PanelsTopLeft,
  RefreshCw,
  Smartphone,
  Store,
  Tablet,
  UserRound,
  Wifi,
  WifiOff,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  buildCommercialDemoFrameUrl,
  isCommercialDemoFrameStateMessage,
  type CommercialDemoFrameStateMessage,
  type CommercialDemoFrameSurface,
} from "@/lib/commercialDemoFrame";
import { cn } from "@/lib/utils";

type RemoteBrowserSurface = CommercialDemoFrameSurface | "commercial";

type BrowserDefinition = {
  surface: RemoteBrowserSurface;
  title: string;
  accountLabel: string;
  initialPath: string;
  icon: typeof UserRound;
  badgeClassName: string;
};

type ViewportPreset = "desktop" | "tablet" | "mobile";
type ConsoleLayout = "control" | "mosaic";

type FrameRuntime = {
  path: string;
  search: string;
  historyIndex: number;
  maxHistoryIndex: number;
  unreadCount: number;
  realtimeStatus: CommercialDemoFrameStateMessage["realtimeStatus"];
};

const BROWSERS: BrowserDefinition[] = [
  {
    surface: "client",
    title: "Compte client",
    accountLabel: "Sophie · cliente démo",
    initialPath: "/mon-espace",
    icon: UserRound,
    badgeClassName: "border-sky-300 bg-sky-50 text-sky-700 dark:bg-sky-400/10 dark:text-sky-100",
  },
  {
    surface: "restaurant",
    title: "Compte restaurateur",
    accountLabel: "Restaurant Démo TOK",
    initialPath: "/dashboard",
    icon: Store,
    badgeClassName: "border-orange-300 bg-orange-50 text-orange-700 dark:bg-orange-400/10 dark:text-orange-100",
  },
  {
    surface: "commercial",
    title: "Compte commercial",
    accountLabel: "Votre espace commercial",
    initialPath: "/commercial",
    icon: PanelsTopLeft,
    badgeClassName: "border-violet-300 bg-violet-50 text-violet-700 dark:bg-violet-400/10 dark:text-violet-100",
  },
  {
    surface: "courier",
    title: "Compte livreur",
    accountLabel: "Alex · livreur démo",
    initialPath: "/courier",
    icon: Bike,
    badgeClassName: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-100",
  },
];

function buildRemoteBrowserUrl(
  surface: RemoteBrowserSurface,
  sessionId: string,
  targetPath: string,
) {
  if (surface === "commercial") {
    return targetPath.startsWith("/commercial") ? targetPath : "/commercial";
  }
  return buildCommercialDemoFrameUrl(surface, sessionId, targetPath);
}

const VIEWPORTS: Record<ViewportPreset, {
  label: string;
  width: number;
  height: number;
  icon: ComponentType<{ className?: string }>;
}> = {
  desktop: { label: "Bureau", width: 1440, height: 900, icon: Monitor },
  tablet: { label: "Tablette", width: 1024, height: 768, icon: Tablet },
  mobile: { label: "Mobile", width: 390, height: 844, icon: Smartphone },
};

function initialRuntime(definition: BrowserDefinition): FrameRuntime {
  return {
    path: definition.initialPath,
    search: "",
    historyIndex: 0,
    maxHistoryIndex: 0,
    unreadCount: 0,
    realtimeStatus: "connecting",
  };
}

function RemoteViewport({
  frameRef,
  preset,
  surface,
  title,
  src,
}: {
  frameRef: RefObject<HTMLIFrameElement>;
  preset: ViewportPreset;
  surface: RemoteBrowserSurface;
  title: string;
  src: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewportMetrics, setViewportMetrics] = useState({ scale: 1, width: 0, height: 0 });
  const viewport = VIEWPORTS[preset];

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateScale = () => {
      const { width, height } = container.getBoundingClientRect();
      if (!width || !height) return;
      setViewportMetrics({
        scale: Math.min(width / viewport.width, height / viewport.height),
        width,
        height,
      });
    };
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(container);
    return () => observer.disconnect();
  }, [viewport.height, viewport.width]);

  const { scale } = viewportMetrics;
  const scaledWidth = viewport.width * scale;
  const scaledHeight = viewport.height * scale;
  const canvasStyle: CSSProperties = {
    width: viewport.width,
    height: viewport.height,
    left: Math.max(0, (viewportMetrics.width - scaledWidth) / 2),
    top: Math.max(0, (viewportMetrics.height - scaledHeight) / 2),
    transform: `scale(${scale})`,
    transformOrigin: "top left",
  };

  return (
    <div
      ref={containerRef}
      className="relative min-h-0 flex-1 overflow-hidden bg-slate-950"
      data-remote-viewport={preset}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.12),transparent_58%)]" />
      <div className="absolute" style={canvasStyle}>
        <iframe
          ref={frameRef}
          src={src}
          title={title}
          width={viewport.width}
          height={viewport.height}
          className="block border-0 bg-background"
          loading="eager"
          referrerPolicy="same-origin"
          data-testid={`commercial-demo-frame-${surface}`}
        />
      </div>
      {scale < 0.58 ? (
        <div className="pointer-events-none absolute bottom-2 right-2 rounded-full bg-slate-950/80 px-2 py-1 text-[10px] font-semibold text-white/80 backdrop-blur">
          {Math.round(scale * 100)} %
        </div>
      ) : null}
    </div>
  );
}

function BrowserWindow({
  definition,
  sessionId,
  active,
  compact,
  fullscreen,
  onActivate,
  onToggleFullscreen,
  onRuntimeChange,
}: {
  definition: BrowserDefinition;
  sessionId: string;
  active: boolean;
  compact: boolean;
  fullscreen: boolean;
  onActivate: () => void;
  onToggleFullscreen: () => void;
  onRuntimeChange: (surface: RemoteBrowserSurface, runtime: FrameRuntime) => void;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [preset, setPreset] = useState<ViewportPreset>("desktop");
  const [runtime, setRuntime] = useState<FrameRuntime>(() => initialRuntime(definition));
  const initialUrl = useMemo(
    () => buildRemoteBrowserUrl(definition.surface, sessionId, definition.initialPath),
    [definition.initialPath, definition.surface, sessionId],
  );
  const Icon = definition.icon;
  const RealtimeIcon = runtime.realtimeStatus === "connected" ? Wifi : WifiOff;

  useEffect(() => {
    setRuntime(initialRuntime(definition));
  }, [definition, sessionId]);

  useEffect(() => {
    if (definition.surface === "commercial") return;

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frameRef.current?.contentWindow) return;
      if (!isCommercialDemoFrameStateMessage(event.data)) return;
      if (event.data.sessionId !== sessionId || event.data.surface !== definition.surface) return;

      setRuntime((current) => {
        const maxHistoryIndex = Math.max(current.maxHistoryIndex, event.data.historyIndex);
        const next = {
          path: event.data.path,
          search: event.data.search,
          historyIndex: event.data.historyIndex,
          maxHistoryIndex,
          unreadCount: event.data.unreadCount,
          realtimeStatus: event.data.realtimeStatus,
        } satisfies FrameRuntime;
        onRuntimeChange(definition.surface, next);
        return next;
      });
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [definition.surface, onRuntimeChange, sessionId]);

  useEffect(() => {
    if (definition.surface !== "commercial") return;

    const frame = frameRef.current;
    let stopped = false;
    const syncCommercialFrame = () => {
      if (stopped) return;
      const frameWindow = frame?.contentWindow;
      if (!frameWindow) return;

      try {
        const { pathname, search } = frameWindow.location;
        // Never recursively open this console inside its own commercial
        // window. Every other commercial route stays fully navigable.
        if (pathname.startsWith("/commercial/demo-live")) {
          frameWindow.location.replace("/commercial");
          return;
        }

        const historyIndex = Number(frameWindow.history.state?.idx ?? 0);
        setRuntime((current) => {
          const next = {
            path: pathname || "/commercial",
            search,
            historyIndex,
            maxHistoryIndex: Math.max(current.maxHistoryIndex, historyIndex),
            unreadCount: 0,
            realtimeStatus: "connected",
          } satisfies FrameRuntime;
          if (
            current.path === next.path
            && current.search === next.search
            && current.historyIndex === next.historyIndex
            && current.maxHistoryIndex === next.maxHistoryIndex
            && current.realtimeStatus === next.realtimeStatus
          ) {
            return current;
          }
          onRuntimeChange(definition.surface, next);
          return next;
        });
      } catch {
        // A same-origin frame can be unavailable for a few milliseconds while
        // its document is replaced. The following tick resynchronises it.
      }
    };

    frame?.addEventListener("load", syncCommercialFrame);
    syncCommercialFrame();
    const timer = window.setInterval(syncCommercialFrame, 500);
    return () => {
      stopped = true;
      frame?.removeEventListener("load", syncCommercialFrame);
      window.clearInterval(timer);
    };
  }, [definition.surface, onRuntimeChange, sessionId]);

  const withFrameWindow = (action: (frameWindow: Window) => void) => {
    const frameWindow = frameRef.current?.contentWindow;
    if (!frameWindow) return;
    try {
      action(frameWindow);
    } catch {
      // Same-origin is enforced by the URL builder. Ignore a transient access
      // error while the iframe is navigating or being reloaded.
    }
  };

  const currentUrl = useMemo(
    () => buildRemoteBrowserUrl(definition.surface, sessionId, `${runtime.path}${runtime.search}`),
    [definition.surface, runtime.path, runtime.search, sessionId],
  );

  return (
    <article
      className={cn(
        "group relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-[1.35rem] border bg-background shadow-[0_22px_65px_rgba(15,23,42,0.16)] transition-[border-color,box-shadow]",
        active ? "border-orange-400/70 ring-2 ring-orange-400/15" : "border-border/70",
        fullscreen && "fixed inset-2 z-[220] rounded-2xl shadow-[0_40px_120px_rgba(2,6,23,0.55)] sm:inset-4",
      )}
      data-browser-surface={definition.surface}
      data-browser-active={active ? "true" : "false"}
      onPointerDown={onActivate}
    >
      <header className="shrink-0 border-b bg-muted/45">
        <div className="flex min-w-0 items-center gap-2 border-b border-border/55 px-2.5 py-2">
          <div className="hidden shrink-0 items-center gap-1.5 sm:flex" aria-hidden="true">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          </div>
          <Badge variant="outline" className={cn("min-w-0 gap-1.5 truncate rounded-full", definition.badgeClassName)}>
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{definition.title}</span>
          </Badge>
          <span className="hidden min-w-0 flex-1 truncate text-[11px] font-medium text-muted-foreground sm:block">
            {definition.accountLabel}
          </span>
          <Badge
            variant="outline"
            className={cn(
              "ml-auto shrink-0 gap-1 rounded-full px-2 text-[10px]",
              runtime.realtimeStatus === "connected"
                ? "border-emerald-300 text-emerald-700"
                : "border-amber-300 text-amber-700",
            )}
          >
            <RealtimeIcon className="h-3 w-3" />
            {runtime.realtimeStatus === "connected" ? "En direct" : "Connexion"}
          </Badge>
          {runtime.unreadCount > 0 ? (
            <Badge className="h-6 min-w-6 justify-center rounded-full px-1.5 text-[10px]" aria-label={`${runtime.unreadCount} notification(s) non lue(s)`}>
              <Bell className="mr-1 h-3 w-3" />{runtime.unreadCount}
            </Badge>
          ) : null}
        </div>

        <div className="flex min-w-0 items-center gap-1.5 px-2.5 py-2">
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" disabled={runtime.historyIndex <= 0} onClick={() => withFrameWindow((frameWindow) => frameWindow.history.back())} aria-label={`Page précédente de ${definition.title}`}>
            <ArrowLeft className="h-3.5 w-3.5" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="hidden h-8 w-8 shrink-0 sm:inline-flex" disabled={runtime.historyIndex >= runtime.maxHistoryIndex} onClick={() => withFrameWindow((frameWindow) => frameWindow.history.forward())} aria-label={`Page suivante de ${definition.title}`}>
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => withFrameWindow((frameWindow) => frameWindow.location.reload())} aria-label={`Actualiser ${definition.title}`}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="hidden h-8 w-8 shrink-0 sm:inline-flex" onClick={() => withFrameWindow((frameWindow) => frameWindow.location.assign(initialUrl))} aria-label={`Accueil de ${definition.title}`}>
            <House className="h-3.5 w-3.5" />
          </Button>
          <button
            type="button"
            className="min-w-0 flex-1 truncate rounded-lg border bg-background/90 px-3 py-1.5 text-left text-[11px] text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary"
            onClick={onActivate}
            title={`https://www.thetok.ch${runtime.path}${runtime.search}`}
            aria-label={`Adresse de ${definition.title}`}
          >
            <span className="text-emerald-600">●</span> thetok.ch{runtime.path}{runtime.search}
          </button>
          <div className="hidden items-center rounded-lg border bg-background p-0.5 lg:flex" aria-label="Format de l’écran distant">
            {(Object.entries(VIEWPORTS) as [ViewportPreset, (typeof VIEWPORTS)[ViewportPreset]][]).map(([key, item]) => {
              const DeviceIcon = item.icon;
              return (
                <button
                  key={key}
                  type="button"
                  className={cn("flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground", preset === key && "bg-primary text-primary-foreground")}
                  onClick={() => setPreset(key)}
                  title={item.label}
                  aria-label={`Afficher ${definition.title} au format ${item.label}`}
                  aria-pressed={preset === key}
                >
                  <DeviceIcon className="h-3.5 w-3.5" />
                </button>
              );
            })}
          </div>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onToggleFullscreen} aria-label={fullscreen ? `Réduire ${definition.title}` : `Prendre le contrôle de ${definition.title}`}>
            {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
          <Button asChild variant="ghost" size="icon" className="hidden h-8 w-8 shrink-0 sm:inline-flex">
            <a href={currentUrl} target="_blank" rel="noreferrer" aria-label={`Ouvrir ${definition.title} dans un nouvel onglet`}><ExternalLink className="h-4 w-4" /></a>
          </Button>
        </div>
      </header>

      <RemoteViewport frameRef={frameRef} preset={preset} surface={definition.surface} title={definition.title} src={initialUrl} />
      {compact && !active ? (
        <button
          type="button"
          className="absolute inset-x-0 bottom-0 top-[6.15rem] z-20 flex items-center justify-center bg-slate-950/0 text-xs font-bold text-white opacity-0 backdrop-blur-0 transition hover:bg-slate-950/30 hover:opacity-100 hover:backdrop-blur-[1px] focus-visible:bg-slate-950/35 focus-visible:opacity-100"
          onClick={onActivate}
          aria-label={`Prendre le contrôle de ${definition.title}`}
        >
          <span className="rounded-full bg-slate-950/85 px-4 py-2 shadow-xl">Prendre le contrôle</span>
        </button>
      ) : null}
    </article>
  );
}

export default function CommercialDemoBrowserGrid({ sessionId }: { sessionId: string }) {
  const [activeSurface, setActiveSurface] = useState<RemoteBrowserSurface>("client");
  const [thirdSurface, setThirdSurface] = useState<"commercial" | "courier">("commercial");
  const [layout, setLayout] = useState<ConsoleLayout>("control");
  const [fullscreenSurface, setFullscreenSurface] = useState<RemoteBrowserSurface | null>(null);
  const [runtimes, setRuntimes] = useState<Record<RemoteBrowserSurface, FrameRuntime>>(() => ({
    client: initialRuntime(BROWSERS[0]),
    restaurant: initialRuntime(BROWSERS[1]),
    commercial: initialRuntime(BROWSERS[2]),
    courier: initialRuntime(BROWSERS[3]),
  }));

  const updateRuntime = useCallback((surface: RemoteBrowserSurface, runtime: FrameRuntime) => {
    setRuntimes((current) => current[surface] === runtime ? current : { ...current, [surface]: runtime });
  }, []);

  useEffect(() => {
    if (!fullscreenSurface) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullscreenSurface(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [fullscreenSurface]);

  const visibleSurfaces = useMemo<RemoteBrowserSurface[]>(
    () => ["client", "restaurant", thirdSurface],
    [thirdSurface],
  );
  const visibleBrowsers = useMemo(
    () => visibleSurfaces
      .map((surface) => BROWSERS.find((browser) => browser.surface === surface))
      .filter((browser): browser is BrowserDefinition => Boolean(browser)),
    [visibleSurfaces],
  );
  const orderedBrowsers = useMemo(() => {
    const active = visibleBrowsers.find((browser) => browser.surface === activeSurface) || visibleBrowsers[0];
    const visible = [active, ...visibleBrowsers.filter((browser) => browser.surface !== active.surface)];
    return [...visible, ...BROWSERS.filter((browser) => !visibleSurfaces.includes(browser.surface))];
  }, [activeSurface, visibleBrowsers, visibleSurfaces]);

  const selectThirdSurface = (surface: "commercial" | "courier") => {
    const replacingActiveSurface = activeSurface === thirdSurface;
    const replacingFullscreenSurface = fullscreenSurface === thirdSurface;
    setThirdSurface(surface);
    if (replacingActiveSurface) setActiveSurface(surface);
    if (replacingFullscreenSurface) setFullscreenSurface(null);
  };

  return (
    <section className="min-w-0" aria-label="Console commerciale de contrôle à distance">
      <div className="mb-3 flex flex-col gap-3 rounded-2xl border border-border/70 bg-background/90 p-2.5 shadow-sm backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 gap-1 overflow-x-auto" role="tablist" aria-label="Choisir le compte distant">
          {visibleBrowsers.map((browser) => {
            const BrowserIcon = browser.icon;
            const selected = browser.surface === activeSurface;
            const unreadCount = runtimes[browser.surface].unreadCount;
            return (
              <button
                key={browser.surface}
                type="button"
                role="tab"
                aria-selected={selected}
                className={cn(
                  "flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-semibold transition-colors",
                  selected ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                onClick={() => setActiveSurface(browser.surface)}
              >
                <BrowserIcon className="h-4 w-4" />
                {browser.title}
                {unreadCount > 0 ? <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] text-white">{unreadCount}</span> : null}
              </button>
            );
          })}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1">
          <div className="flex items-center rounded-xl border bg-muted/30 p-1" aria-label="Troisième session affichée">
            <button type="button" className={cn("flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold", thirdSurface === "commercial" && "bg-background shadow-sm")} onClick={() => selectThirdSurface("commercial")} aria-pressed={thirdSurface === "commercial"}>
              <PanelsTopLeft className="h-4 w-4" />Commercial
            </button>
            <button type="button" className={cn("flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold", thirdSurface === "courier" && "bg-background shadow-sm")} onClick={() => selectThirdSurface("courier")} aria-pressed={thirdSurface === "courier"}>
              <Bike className="h-4 w-4" />Livreur
            </button>
          </div>
          <div className="flex items-center rounded-xl border bg-muted/30 p-1" aria-label="Disposition des écrans">
            <button type="button" className={cn("flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-semibold", layout === "control" && "bg-background shadow-sm")} onClick={() => setLayout("control")} aria-pressed={layout === "control"}>
              <PanelsTopLeft className="h-4 w-4" />Contrôle
            </button>
            <button type="button" className={cn("flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-semibold", layout === "mosaic" && "bg-background shadow-sm")} onClick={() => setLayout("mosaic")} aria-pressed={layout === "mosaic"}>
              <LayoutGrid className="h-4 w-4" />Mosaïque
            </button>
          </div>
        </div>
      </div>

      <div
        className={cn(
          "grid h-[calc(100dvh-12rem)] min-h-[40rem] min-w-0 gap-3",
          layout === "control"
            ? "lg:grid-cols-[minmax(0,2fr)_minmax(22rem,1fr)] lg:grid-rows-2"
            : "xl:grid-cols-3",
        )}
        data-console-layout={layout}
      >
        {orderedBrowsers.map((definition, index) => {
          const visible = visibleSurfaces.includes(definition.surface);
          const active = definition.surface === activeSurface;
          const compact = layout === "control" && index > 0;
          return (
            <div
              key={definition.surface}
              className={cn(
                "min-h-0 min-w-0",
                !visible && "hidden",
                visible && !active && (layout === "control" ? "hidden lg:block" : "hidden xl:block"),
                layout === "control" && index === 0 && "lg:row-span-2",
                layout === "control" && index > 0 && "lg:col-start-2",
                layout === "mosaic" && "xl:min-h-[42rem]",
              )}
            >
              <BrowserWindow
                definition={definition}
                sessionId={sessionId}
                active={active}
                compact={compact}
                fullscreen={fullscreenSurface === definition.surface}
                onActivate={() => setActiveSurface(definition.surface)}
                onToggleFullscreen={() => setFullscreenSurface((current) => current === definition.surface ? null : definition.surface)}
                onRuntimeChange={updateRuntime}
              />
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        Les sessions restent connectées en permanence. Sélectionnez une fenêtre puis naviguez dedans comme sur un ordinateur distant.
      </p>
    </section>
  );
}
