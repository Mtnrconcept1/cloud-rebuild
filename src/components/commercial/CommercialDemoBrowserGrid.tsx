import { useMemo, useState } from "react";
import { Bike, ExternalLink, RefreshCw, Store, UserRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buildCommercialDemoFrameUrl, type CommercialDemoFrameSurface } from "@/lib/commercialDemoFrame";
import { cn } from "@/lib/utils";

type BrowserDefinition = {
  surface: CommercialDemoFrameSurface;
  title: string;
  subtitle: string;
  initialPath: string;
  icon: typeof UserRound;
  badgeClassName: string;
};

const BROWSERS: BrowserDefinition[] = [
  {
    surface: "client",
    title: "Dashboard client",
    subtitle: "Commandes et suivi",
    initialPath: "/commandes",
    icon: UserRound,
    badgeClassName: "border-sky-300 bg-sky-50 text-sky-700 dark:bg-sky-400/10 dark:text-sky-100",
  },
  {
    surface: "restaurant",
    title: "Dashboard restaurateur",
    subtitle: "Réception et préparation",
    initialPath: "/dashboard/commandes",
    icon: Store,
    badgeClassName: "border-orange-300 bg-orange-50 text-orange-700 dark:bg-orange-400/10 dark:text-orange-100",
  },
  {
    surface: "courier",
    title: "Dashboard livreur",
    subtitle: "Missions et livraison",
    initialPath: "/courier/jobs",
    icon: Bike,
    badgeClassName: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-100",
  },
];

function BrowserWindow({ definition, sessionId }: { definition: BrowserDefinition; sessionId: string }) {
  const [reloadKey, setReloadKey] = useState(0);
  const url = useMemo(
    () => buildCommercialDemoFrameUrl(definition.surface, sessionId, definition.initialPath),
    [definition.initialPath, definition.surface, sessionId],
  );
  const Icon = definition.icon;

  return (
    <article className="min-w-0 overflow-hidden rounded-[1.6rem] border border-border/70 bg-background shadow-[0_22px_65px_rgba(15,23,42,0.13)]" data-browser-surface={definition.surface}>
      <header className="border-b bg-muted/35 p-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="hidden shrink-0 items-center gap-1.5 sm:flex" aria-hidden="true">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          </div>
          <Badge variant="outline" className={cn("min-w-0 max-w-[13rem] gap-1.5 truncate rounded-full", definition.badgeClassName)}>
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{definition.title}</span>
          </Badge>
          <div className="min-w-0 flex-1 rounded-lg border bg-background/85 px-3 py-1.5 text-[11px] text-muted-foreground" aria-label={`Adresse de la fenêtre ${definition.title}`}>
            <span className="block truncate">thetok.ch{definition.initialPath}</span>
          </div>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setReloadKey((value) => value + 1)} aria-label={`Actualiser ${definition.title}`}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button asChild variant="ghost" size="icon" className="h-8 w-8 shrink-0">
            <a href={url} target="_blank" rel="noreferrer" aria-label={`Ouvrir ${definition.title} dans un nouvel onglet`}><ExternalLink className="h-4 w-4" /></a>
          </Button>
        </div>
        <p className="mt-2 px-1 text-xs font-medium text-muted-foreground">{definition.subtitle}</p>
      </header>
      <iframe
        key={`${url}:${reloadKey}`}
        src={url}
        title={definition.title}
        className="block h-[clamp(42rem,76vh,56rem)] w-full border-0 bg-background"
        allow="payment *"
        referrerPolicy="same-origin"
        data-testid={`commercial-demo-frame-${definition.surface}`}
      />
    </article>
  );
}

export default function CommercialDemoBrowserGrid({ sessionId }: { sessionId: string }) {
  return (
    <section className="grid min-w-0 gap-4 lg:grid-cols-3 xl:gap-5" aria-label="Trois vrais dashboards synchronisés">
      {BROWSERS.map((definition) => (
        <BrowserWindow key={definition.surface} definition={definition} sessionId={sessionId} />
      ))}
    </section>
  );
}
