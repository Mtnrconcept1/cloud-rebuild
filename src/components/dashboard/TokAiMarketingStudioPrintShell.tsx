import TokAiMarketingStudioCore from "./TokAiMarketingStudio";
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
 * The legacy generator stays untouched. Vite maps only the app's absolute
 * Marketing Studio import to this shell; this file imports the original module
 * relatively, so existing generator behavior and its source-contract tests stay
 * stable while physical print commerce remains an isolated domain.
 */
export default function TokAiMarketingStudioPrintShell({ restaurantId }: Props) {
  const commercialDemoFrame = useCommercialDemoFrame();
  const canPrint = Boolean(restaurantId && !commercialDemoFrame);

  return (
    <div className="space-y-6">
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
                    Choisissez une création récente, adaptez-la au support, contrôlez le BAT, obtenez le prix livré puis payez via Stripe. TheTok gère ensuite l’impression et le suivi.
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
