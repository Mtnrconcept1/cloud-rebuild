import { useMemo } from "react";
import { PanelsTopLeft, ShieldCheck } from "lucide-react";

import CommercialDemoActorBrowserGrid from "@/components/commercial/CommercialDemoActorBrowserGrid";
import { Badge } from "@/components/ui/badge";
import { buildCommercialDemoFrameUrl, type CommercialDemoFrameSurface } from "@/lib/commercialDemoFrame";

type ActorBrowserSurface = Exclude<CommercialDemoFrameSurface, "commercial">;

export default function CommercialDemoBrowserGrid({
  sessionId,
  initialSurface,
}: {
  sessionId: string;
  initialSurface?: ActorBrowserSurface;
}) {
  const commercialUrl = useMemo(
    () => buildCommercialDemoFrameUrl("commercial", sessionId, "/commercial"),
    [sessionId],
  );

  return (
    <div className="space-y-3">
      <section
        data-browser-surface="commercial"
        className="overflow-hidden rounded-[1.75rem] border border-orange-200/80 bg-background shadow-sm dark:border-orange-400/20"
      >
        <header className="flex flex-col gap-3 border-b bg-gradient-to-r from-orange-50 via-background to-violet-50/70 px-4 py-3 dark:from-orange-400/10 dark:to-violet-400/10 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-orange-600 text-white">
              <PanelsTopLeft className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate font-black">Espace commercial</p>
              <p className="text-xs text-muted-foreground">
                Interface commerciale réelle, rendue dans la même session Démo isolée.
              </p>
            </div>
          </div>
          <Badge variant="outline" className="w-fit shrink-0 rounded-full border-emerald-300 text-emerald-700 dark:text-emerald-200">
            <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
            Fidèle à l’espace réel
          </Badge>
        </header>
        <iframe
          key={`commercial:${sessionId}`}
          src={commercialUrl}
          title="Espace commercial TOK de démonstration"
          className="h-[clamp(34rem,72svh,58rem)] w-full border-0 bg-background"
          referrerPolicy="no-referrer"
          loading="eager"
          data-testid="commercial-demo-frame-commercial"
        />
      </section>

      <CommercialDemoActorBrowserGrid
        sessionId={sessionId}
        initialSurface={initialSurface}
      />
    </div>
  );
}
