import { useQuery } from "@tanstack/react-query";
import { getPrintGenerationCatalog } from "@/lib/print/client";
import { matchesGeneratedPrintFormat, readGeneratedOutputFormat } from "../../../supabase/functions/_shared/print/source-format";
import type { TokImageGenerationResult } from "@/lib/ai/tokAiClient";
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
  const [selectedCreation, setSelectedCreation] = useState<TokImageGenerationResult | null>(null);
  const catalogQuery = useQuery({
    queryKey: ["marketing-output-generation-catalog", restaurantId],
    queryFn: () => getPrintGenerationCatalog(String(restaurantId)),
    enabled: canPrint,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
  const printableCreation = readGeneratedOutputFormat(selectedCreation?.marketing_output_target)?.destination === "print"
    && Boolean(catalogQuery.data?.products.some((product) => product.variants
      .some((variant) => matchesGeneratedPrintFormat(selectedCreation?.marketing_output_target, variant))));
  const [printComposerOpen, setPrintComposerOpen] = useState(false);
  const studioRootRef = useRef<HTMLDivElement>(null);

  return (
    <div className="space-y-6">
      <MarketingOutputControls restaurantId={restaurantId} printEnabled={canPrint} />

      <div ref={studioRootRef}>
        <TokAiMarketingStudioCore restaurantId={restaurantId} onSelectedCreationChange={setSelectedCreation} />
      </div>
      <MarketingStudioPrintCatalogBridge
        rootRef={studioRootRef}
        printEnabled={canPrint}
        printableCreation={printableCreation}
        onOpenPrintComposer={canPrint && printableCreation ? () => setPrintComposerOpen(true) : undefined}
      />

      {canPrint && restaurantId ? (
        <>
          <PrintComposerDialog
            restaurantId={restaurantId}
            initialSourceGenerationId={selectedCreation?.assetId}
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
