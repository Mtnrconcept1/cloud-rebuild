import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2, MonitorSmartphone, Printer, Share2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  getAiCreationImageUrl,
  getAiCreationRecords,
  subscribeAiCreationRecords,
  type AiCreationRecord,
} from "@/lib/ai/aiCreationJobs";
import { downloadMarketingOutput } from "@/lib/marketing/imageOutput";
import {
  DIGITAL_MARKETING_OUTPUT_TARGETS,
  buildPrintMarketingOutputTargets,
  calculateMarketingOutputPlan,
  type MarketingOutputDestination,
  type MarketingOutputTarget,
} from "@/lib/marketing/outputGeometry";
import {
  getMarketingOutputSessionSnapshot,
  setMarketingOutputSession,
  subscribeMarketingOutputSession,
} from "@/lib/marketing/outputSession";
import { getPrintGenerationCatalog } from "@/lib/print/client";
import { cn } from "@/lib/utils";

type Props = {
  restaurantId?: string | null;
  printEnabled: boolean;
};

function targetDescription(target: MarketingOutputTarget) {
  if (!target.print) {
    return `${target.widthPx}×${target.heightPx} px · ${target.ratioLabel} · bucket ${target.nativeFormat}`;
  }
  const folded = target.print.foldedWidthMm && target.print.foldedHeightMm
    ? ` · fermé ${target.print.foldedWidthMm}×${target.print.foldedHeightMm} mm`
    : "";
  return `${target.print.widthMm}×${target.print.heightMm} mm à plat${folded} · bleed ${target.print.bleedMm} mm · marge sûre ${target.print.safeMarginMm} mm · ${target.targetDpi} DPI · ${target.widthPx}×${target.heightPx} px`;
}

export default function MarketingOutputControls({ restaurantId, printEnabled }: Props) {
  const outputSession = useSyncExternalStore(
    subscribeMarketingOutputSession,
    getMarketingOutputSessionSnapshot,
    getMarketingOutputSessionSnapshot,
  );
  const [records, setRecords] = useState<AiCreationRecord[]>(() => getAiCreationRecords());
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const catalogQuery = useQuery({
    queryKey: ["marketing-output-generation-catalog", restaurantId],
    queryFn: () => getPrintGenerationCatalog(String(restaurantId)),
    enabled: Boolean(printEnabled && restaurantId),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const printTargets = useMemo(
    () => buildPrintMarketingOutputTargets(catalogQuery.data?.products || []),
    [catalogQuery.data?.products],
  );
  const destination = outputSession.destination;
  const availableTargets = destination === "print" ? printTargets : DIGITAL_MARKETING_OUTPUT_TARGETS;
  const selectedTarget = availableTargets.find((target) => target.id === outputSession.target?.id) || null;
  const selectedId = selectedTarget?.id || "";
  const expectedPlan = selectedTarget
    ? calculateMarketingOutputPlan(selectedTarget.nativeWidthPx, selectedTarget.nativeHeightPx, selectedTarget)
    : null;
  const printBlocked = selectedTarget?.destination === "print" && expectedPlan?.quality === "upscale_blocked";

  useEffect(() => subscribeAiCreationRecords(setRecords), []);

  useEffect(() => {
    const nextTarget = availableTargets.find((target) => target.id === outputSession.target?.id)
      || availableTargets[0]
      || null;
    setMarketingOutputSession({
      destination,
      targets: availableTargets,
      target: nextTarget && !(nextTarget.destination === "print"
        && calculateMarketingOutputPlan(nextTarget.nativeWidthPx, nextTarget.nativeHeightPx, nextTarget).quality === "upscale_blocked")
        ? nextTarget
        : null,
    });
  }, [availableTargets, destination, outputSession.target?.id]);

  useEffect(() => () => {
    setMarketingOutputSession({
      destination: "digital",
      targets: DIGITAL_MARKETING_OUTPUT_TARGETS,
      target: DIGITAL_MARKETING_OUTPUT_TARGETS[0] || null,
    });
  }, []);

  const latestMarketingCreation = records.find((record) => (
    record.tool === "marketing_studio"
    && record.status === "completed"
    && Boolean(getAiCreationImageUrl(record))
  ));

  const handleDestination = (next: MarketingOutputDestination) => {
    if (next === "print" && !printEnabled) return;
    const nextTargets = next === "print" ? printTargets : DIGITAL_MARKETING_OUTPUT_TARGETS;
    setMarketingOutputSession({
      destination: next,
      targets: nextTargets,
      target: nextTargets[0] || null,
    });
    setDownloadError(null);
  };

  const handleTarget = (targetId: string) => {
    const target = availableTargets.find((candidate) => candidate.id === targetId) || null;
    if (!target) return;
    const plan = calculateMarketingOutputPlan(target.nativeWidthPx, target.nativeHeightPx, target);
    setMarketingOutputSession({
      destination,
      targets: availableTargets,
      target: target.destination === "print" && plan.quality === "upscale_blocked" ? null : target,
    });
    setDownloadError(null);
  };

  const handleDownload = async () => {
    if (!selectedTarget || !latestMarketingCreation) return;
    const sourceUrl = getAiCreationImageUrl(latestMarketingCreation);
    if (!sourceUrl) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      await downloadMarketingOutput({
        sourceUrl,
        target: selectedTarget,
        baseName: latestMarketingCreation.title || "visuel-tok",
        mimeType: selectedTarget.destination === "print" ? "image/png" : "image/jpeg",
      });
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "EXPORT_MARKETING_OUTPUT_FAILED");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Card className="overflow-hidden rounded-3xl border-violet-200 bg-gradient-to-br from-violet-50/80 via-background to-orange-50/60 dark:border-violet-400/20 dark:from-violet-400/10 dark:to-orange-400/5">
      <CardContent className="space-y-4 p-5 sm:p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="rounded-full border-violet-300 text-violet-700 dark:text-violet-200">
                <MonitorSmartphone className="mr-1.5 h-3.5 w-3.5" />Destination finale
              </Badge>
              {selectedTarget ? <Badge variant="secondary" className="rounded-full">{selectedTarget.ratioLabel}</Badge> : null}
              {selectedTarget?.targetDpi ? <Badge variant="secondary" className="rounded-full">{selectedTarget.targetDpi} DPI</Badge> : null}
            </div>
            <h2 className="mt-2 text-lg font-black sm:text-xl">Choisissez d’abord où le visuel sera utilisé</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Cette cible est prioritaire sur le gabarit créatif du Studio. GPT Image génère le bucket natif le plus proche, puis TheTok recadre et rééchantillonne le fichier aux dimensions finales exactes.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="shrink-0 rounded-xl"
            disabled={!selectedTarget || !latestMarketingCreation || Boolean(printBlocked) || downloading}
            onClick={() => void handleDownload()}
          >
            {downloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Télécharger {selectedTarget ? `${selectedTarget.widthPx}×${selectedTarget.heightPx}` : "le format"}
          </Button>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <div className="grid grid-cols-2 gap-2 rounded-2xl border bg-background/80 p-1.5" aria-label="Destination du visuel">
            <button
              type="button"
              className={cn(
                "flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-bold transition",
                destination === "digital" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted",
              )}
              aria-pressed={destination === "digital"}
              onClick={() => handleDestination("digital")}
            >
              <Share2 className="h-4 w-4" />TheTok / réseaux sociaux
            </button>
            <button
              type="button"
              disabled={!printEnabled}
              className={cn(
                "flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-bold transition",
                destination === "print" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted",
                !printEnabled && "cursor-not-allowed opacity-45",
              )}
              aria-pressed={destination === "print"}
              onClick={() => handleDestination("print")}
            >
              <Printer className="h-4 w-4" />Impression Cloudprinter
            </button>
          </div>

          <label className="block rounded-2xl border bg-background/80 p-3 text-sm font-semibold">
            Format final exact
            <select
              value={selectedId}
              onChange={(event) => handleTarget(event.target.value)}
              className="mt-2 h-11 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary"
              disabled={destination === "print" && (catalogQuery.isLoading || availableTargets.length === 0)}
            >
              {destination === "digital" ? (
                <>
                  <optgroup label="TheTok">
                    {availableTargets.filter((target) => target.group === "TheTok").map((target) => (
                      <option key={target.id} value={target.id}>{target.label} · {target.widthPx}×{target.heightPx}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Réseaux sociaux">
                    {availableTargets.filter((target) => target.group === "Réseaux sociaux").map((target) => (
                      <option key={target.id} value={target.id}>{target.label} · {target.widthPx}×{target.heightPx}</option>
                    ))}
                  </optgroup>
                </>
              ) : availableTargets.map((target) => (
                <option key={target.id} value={target.id}>{target.label}</option>
              ))}
            </select>
          </label>
        </div>

        {destination === "print" ? (
          <p className="rounded-xl border bg-background/70 px-3 py-2 text-xs text-muted-foreground">
            Seuls les produits réellement mappés au catalogue Cloudprinter apparaissent dans le Studio. La génération respecte leur format à plat, leur fond perdu et leur marge de sécurité. La disponibilité à la commande reste contrôlée séparément par TheTok Print.
          </p>
        ) : null}

        {selectedTarget ? (
          <div className={cn(
            "rounded-2xl border p-3 text-sm",
            printBlocked
              ? "border-red-300 bg-red-50 text-red-900 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-100"
              : expectedPlan?.quality === "upscale_allowed" && selectedTarget.destination === "print"
                ? "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100"
                : "border-emerald-200 bg-emerald-50/80 text-emerald-950 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-100",
          )}>
            <p className="font-bold">{selectedTarget.label}</p>
            <p className="mt-1">{targetDescription(selectedTarget)}</p>
            <p className="mt-1 text-xs opacity-80">
              Source GPT attendue : {selectedTarget.nativeWidthPx}×{selectedTarget.nativeHeightPx} · facteur théorique {expectedPlan?.upscaleFactor.toFixed(2)}×.
              {printBlocked ? " Ce support dépasse le plafond 2,5× et la génération Print est bloquée." : ""}
            </p>
          </div>
        ) : destination === "print" ? (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" role="status">
            {catalogQuery.isLoading
              ? "Hydratation du catalogue Cloudprinter…"
              : "Aucun format Cloudprinter mappé avec une géométrie fiable n’est disponible. Utilisez la sortie digitale ou corrigez le mapping dans l’Admin impression."}
          </div>
        ) : null}

        {downloadError ? (
          <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800" role="alert">
            Export exact impossible : {downloadError}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
