import { lazy, Suspense, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileImage, Film, Package, Printer } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { getPrintGenerationCatalog } from "@/lib/print/client";
import { matchesGeneratedPrintFormat, readGeneratedOutputFormat } from "../../../supabase/functions/_shared/print/source-format";
import type { TokImageGenerationResult } from "@/lib/ai/tokAiClient";

import TokAiMarketingStudioCore from "./TokAiMarketingStudio";
import MarketingOutputControls from "./marketing-print/MarketingOutputControls";
import MarketingStudioPrintCatalogBridge from "./marketing-print/MarketingStudioPrintCatalogBridge";
import PrintComposerDialog from "./marketing-print/PrintComposerDialog";
import PrintOrdersPanel from "./marketing-print/PrintOrdersPanel";
import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";

const TokAiVideoStudio = lazy(() => import("./TokAiVideoStudio"));

type Props = {
  restaurantId?: string | null;
};

type MarketingStudioSection = "visuals" | "video" | "print" | "orders";

const STUDIO_SECTIONS: Array<{
  id: MarketingStudioSection;
  label: string;
  description: string;
  icon: typeof FileImage;
}> = [
  {
    id: "visuals",
    label: "Visuels",
    description: "Créer les contenus digitaux et réseaux sociaux.",
    icon: FileImage,
  },
  {
    id: "video",
    label: "Vidéo",
    description: "Créer des reels et publicités vidéo.",
    icon: Film,
  },
  {
    id: "print",
    label: "Impression",
    description: "Préparer un visuel aux formats d’impression.",
    icon: Printer,
  },
  {
    id: "orders",
    label: "Mes impressions",
    description: "Suivre les commandes, la production et la livraison.",
    icon: Package,
  },
];

export default function TokAiMarketingStudioPrintShell({ restaurantId }: Props) {
  const commercialDemoFrame = useCommercialDemoFrame();
  const canPrint = Boolean(restaurantId && !commercialDemoFrame);
  const [activeSection, setActiveSection] = useState<MarketingStudioSection>("visuals");
  const [selectedCreation, setSelectedCreation] = useState<TokImageGenerationResult | null>(null);
  const [printComposerOpen, setPrintComposerOpen] = useState(false);
  const studioRootRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="space-y-6">
      <section className="space-y-3" aria-label="Services du Studio Marketing">
        <div>
          <h2 className="text-xl font-black sm:text-2xl">Studio Marketing</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Choisissez votre service. Chaque parcours reste séparé pour aller directement à l’essentiel.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" role="tablist" aria-label="Services marketing">
          {STUDIO_SECTIONS.map((section) => {
            const Icon = section.icon;
            const selected = activeSection === section.id;
            const disabled = (section.id === "print" || section.id === "orders") && !canPrint;
            return (
              <button
                key={section.id}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`marketing-studio-panel-${section.id}`}
                disabled={disabled}
                onClick={() => setActiveSection(section.id)}
                className={`min-h-28 rounded-3xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${selected
                  ? "border-orange-400 bg-orange-50 shadow-sm dark:border-orange-500/50 dark:bg-orange-950/20"
                  : "bg-background hover:border-orange-200 hover:bg-orange-50/40 dark:hover:bg-orange-950/10"} ${disabled ? "cursor-not-allowed opacity-45" : ""}`}
              >
                <span className="flex items-start gap-3">
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${selected ? "bg-orange-600 text-white" : "bg-muted text-foreground"}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-bold text-foreground">{section.label}</span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">{section.description}</span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <div
        id={`marketing-studio-panel-${activeSection}`}
        role="tabpanel"
        aria-label={STUDIO_SECTIONS.find((section) => section.id === activeSection)?.label}
      >
        {activeSection === "visuals" ? (
          <div className="space-y-6">
            <MarketingOutputControls restaurantId={restaurantId} printEnabled={canPrint} forcedDestination="digital" />
            <TokAiMarketingStudioCore restaurantId={restaurantId} onSelectedCreationChange={setSelectedCreation} showVideoEntry={false} />
          </div>
        ) : null}

        {activeSection === "video" ? (
          restaurantId && !commercialDemoFrame ? (
            <Suspense fallback={<Card><CardContent className="p-6 text-sm text-muted-foreground">Chargement du studio vidéo…</CardContent></Card>}>
              <TokAiVideoStudio restaurantId={restaurantId} />
            </Suspense>
          ) : (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                Le studio vidéo nécessite un restaurant actif hors démonstration commerciale.
              </CardContent>
            </Card>
          )
        ) : null}

        {activeSection === "print" ? (
          canPrint && restaurantId ? (
            <div className="space-y-6">
              <MarketingOutputControls restaurantId={restaurantId} printEnabled forcedDestination="print" />
              <div ref={studioRootRef}>
                <TokAiMarketingStudioCore restaurantId={restaurantId} onSelectedCreationChange={setSelectedCreation} showVideoEntry={false} />
              </div>
              <MarketingStudioPrintCatalogBridge
                rootRef={studioRootRef}
                printEnabled
                printableCreation={printableCreation}
                onOpenPrintComposer={printableCreation ? () => setPrintComposerOpen(true) : undefined}
              />
              <PrintComposerDialog
                restaurantId={restaurantId}
                initialSourceGenerationId={selectedCreation?.assetId}
                open={printComposerOpen}
                onOpenChange={setPrintComposerOpen}
                showTrigger={false}
              />
            </div>
          ) : null
        ) : null}

        {activeSection === "orders" && canPrint && restaurantId ? (
          <section className="space-y-4" aria-label="Mes impressions">
            <PrintOrdersPanel restaurantId={restaurantId} />
          </section>
        ) : null}
      </div>
    </div>
  );
}
