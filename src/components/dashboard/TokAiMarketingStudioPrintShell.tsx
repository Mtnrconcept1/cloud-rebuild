import TokAiMarketingStudioCore from "./TokAiMarketingStudio";
import MarketingOutputControls from "./marketing-print/MarketingOutputControls";
import PrintComposerDialog from "./marketing-print/PrintComposerDialog";
import PrintOrdersPanel from "./marketing-print/PrintOrdersPanel";
import { Card, CardContent } from "@/components/ui/card";
import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";
import { Printer } from "lucide-react";

type Props = {
  restaurantId?: string | null;
};

/**
 * Runtime shell around the existing Marketing Studio.
 *
 * The large legacy generator remains the creative editor. This shell owns the
 * final-output contract: TheTok/social exact rasters and Cloudprinter geometry.
 * Keeping provider access here prevents the core editor from depending on a
 * print provider while every image request still receives the selected target
 * through the exact TOK AI client alias.
 */
export default function TokAiMarketingStudioPrintShell({ restaurantId }: Props) {
  const commercialDemoFrame = useCommercialDemoFrame();
  const canPrint = Boolean(restaurantId && !commercialDemoFrame);

  return (
    <div className="space-y-6">
      <MarketingOutputControls restaurantId={restaurantId} printEnabled={canPrint} />

      <TokAiMarketingStudioCore restaurantId={restaurantId} />

      {canPrint && restaurantId ? (
        <section className="space-y-4" aria-label="TheTok Print">
          <Card className="overflow-hidden rounded-3xl border-primary/20 bg-gradient-to-br from-background via-background to-primary/5">
            <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground">
                  <Printer className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold">Du visuel à l’imprimé, sans quitter TheTok</p>
                  <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                    La cible Cloudprinter choisie en haut pilote la géométrie du visuel. Contrôlez ensuite le BAT, obtenez le prix livré puis payez via Stripe. TheTok gère l’impression et le suivi.
                  </p>
                </div>
              </div>
              <PrintComposerDialog restaurantId={restaurantId} />
            </CardContent>
          </Card>

          <PrintOrdersPanel restaurantId={restaurantId} />
        </section>
      ) : null}
    </div>
  );
}
