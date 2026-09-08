import { useRef, useState } from "react";

import TokAiMarketingStudioCore from "./TokAiMarketingStudio";
import MarketingOutputControls from "./marketing-print/MarketingOutputControls";
import MarketingStudioPrintCatalogBridge from "./marketing-print/MarketingStudioPrintCatalogBridge";
import PrintComposerDialog from "./marketing-print/PrintComposerDialog";
import PrintOrdersPanel from "./marketing-print/PrintOrdersPanel";
import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";

type Props = {
  restaurantId?: string | null;
};

/**
 * Runtime shell around the existing Marketing Studio.
 *
 * The legacy generator remains the creative editor. This shell owns the
 * final-output contract: TheTok/social exact rasters, Cloudprinter geometry
 * and the Print Composer. The bridge replaces only the visible support choices
 * while destination=print, without coupling the core editor to Cloudprinter.
 */
export default function TokAiMarketingStudioPrintShell({ restaurantId }: Props) {
  const commercialDemoFrame = useCommercialDemoFrame();
  const canPrint = Boolean(restaurantId && !commercialDemoFrame);
  const [printComposerOpen, setPrintComposerOpen] = useState(false);
  const studioRootRef = useRef<HTMLDivElement>(null);

  return (
    <div className="space-y-6">
      <MarketingOutputControls restaurantId={restaurantId} printEnabled={canPrint} />

      <div ref={studioRootRef}>
        <TokAiMarketingStudioCore restaurantId={restaurantId} />
      </div>
      <MarketingStudioPrintCatalogBridge
        rootRef={studioRootRef}
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
