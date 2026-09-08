import { useState } from "react";

import TokAiMarketingStudioCore from "./TokAiMarketingStudio";
import MarketingOutputControls from "./marketing-print/MarketingOutputControls";
import PrintComposerDialog from "./marketing-print/PrintComposerDialog";
import PrintOrdersPanel from "./marketing-print/PrintOrdersPanel";
import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";

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
  const [printComposerOpen, setPrintComposerOpen] = useState(false);

  return (
    <div className="space-y-6">
      <MarketingOutputControls restaurantId={restaurantId} printEnabled={canPrint} />

      <TokAiMarketingStudioCore
        restaurantId={restaurantId}
        printEnabled={canPrint}
        onOpenPrintComposer={canPrint ? () => setPrintComposerOpen(true) : undefined}
      />

      {canPrint && restaurantId ? (
        <>
          <PrintComposerDialog
            restaurantId={restaurantId}
            open={printComposerOpen}
            onOpenChange={setPrintComposerOpen}
            showTrigger={false}
          />
          <section className="space-y-4" aria-label="TheTok Print">
            <PrintOrdersPanel restaurantId={restaurantId} />
          </section>
        </>
      ) : null}
    </div>
  );
}
