import type { MarketingPrintDocument, PrintProductSpec } from "@/lib/print/document";
import { runPrintPreflight } from "@/lib/print/preflight";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

export default function PrintProof({
  document,
  product,
  approved = false,
}: {
  document: MarketingPrintDocument;
  product: PrintProductSpec;
  approved?: boolean;
}) {
  const preflight = runPrintPreflight(document, product);
  const mediaWidthMm = product.widthMm + 2 * product.bleedMm;
  const mediaHeightMm = product.heightMm + 2 * product.bleedMm;
  const trimX = 100 * product.bleedMm / mediaWidthMm;
  const trimY = 100 * product.bleedMm / mediaHeightMm;
  const safeX = 100 * (product.bleedMm + product.safeMarginMm) / mediaWidthMm;
  const safeY = 100 * (product.bleedMm + product.safeMarginMm) / mediaHeightMm;

  return (
    <div className="space-y-4" data-testid="marketing-print-proof">
      <div
        className="relative mx-auto overflow-hidden rounded-2xl border bg-muted shadow-sm"
        style={{ aspectRatio: `${mediaWidthMm} / ${mediaHeightMm}`, maxHeight: "62vh" }}
      >
        <img
          src={document.background.url}
          alt={document.title}
          className="absolute inset-0 h-full w-full object-fill"
        />
        <div
          className="pointer-events-none absolute border-2 border-dashed border-red-500"
          style={{ left: `${trimX}%`, right: `${trimX}%`, top: `${trimY}%`, bottom: `${trimY}%` }}
          aria-label="Ligne de coupe"
        />
        <div
          className="pointer-events-none absolute border-2 border-dashed border-emerald-500"
          style={{ left: `${safeX}%`, right: `${safeX}%`, top: `${safeY}%`, bottom: `${safeY}%` }}
          aria-label="Zone de sécurité"
        />
      </div>

      <p className="text-sm leading-6 text-muted-foreground">
        Ligne rouge : coupe finale. Zone verte : limite intérieure de sécurité.
        Les fonds et textures peuvent atteindre le bord du fond perdu, mais vérifiez visuellement
        que chaque texte, prix, logo, visage et QR code intégré à l'image reste entièrement
        à l'intérieur de la zone verte. Ce contrôle humain est indispensable avant d'approuver le BAT.
      </p>

      <div className="grid gap-2 text-xs sm:grid-cols-3">
        <div className="rounded-xl border bg-background p-3">
          <span className="font-semibold">Format fini</span>
          <p className="text-muted-foreground">{product.widthMm} × {product.heightMm} mm</p>
        </div>
        <div className="rounded-xl border bg-background p-3">
          <span className="font-semibold">Fond perdu / zone de sécurité</span>
          <p className="text-muted-foreground">{product.bleedMm} mm / {product.safeMarginMm} mm</p>
        </div>
        <div className="rounded-xl border bg-background p-3">
          <span className="font-semibold">Résolution effective</span>
          <p className="text-muted-foreground">{Math.round(Math.min(preflight.effectiveResolutionDpi.x, preflight.effectiveResolutionDpi.y))} dpi</p>
        </div>
      </div>

      {preflight.blocking.length ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <div className="mb-2 flex items-center gap-2 font-semibold text-destructive">
            <AlertTriangle className="h-4 w-4" /> Corrections requises avant impression
          </div>
          <ul className="space-y-1 text-muted-foreground">
            {preflight.blocking.map((item) => <li key={`${item.code}-${item.field || ""}`}>• {item.message}</li>)}
          </ul>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm font-medium text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4" /> {approved ? "BAT approuvé — fichier verrouillé pour impression." : "Contrôles techniques réussis — vérifiez les marges visuellement avant approbation."}
        </div>
      )}
    </div>
  );
}
