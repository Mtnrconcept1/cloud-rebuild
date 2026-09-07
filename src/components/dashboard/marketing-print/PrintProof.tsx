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
  const bleed = product.bleedMm / Math.max(product.widthMm, product.heightMm) * 100;
  const safe = product.safeMarginMm / Math.max(product.widthMm, product.heightMm) * 100;

  return (
    <div className="space-y-4" data-testid="marketing-print-proof">
      <div
        className="relative mx-auto overflow-hidden rounded-2xl border bg-muted shadow-sm"
        style={{
          aspectRatio: `${product.widthMm} / ${product.heightMm}`,
          maxHeight: "62vh",
        }}
      >
        <img
          src={document.background.url}
          alt={document.title}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="pointer-events-none absolute inset-0 bg-black/5" />
        <div
          className="pointer-events-none absolute border border-dashed border-red-500/80"
          style={{ inset: `${Math.max(0.5, bleed)}%` }}
          aria-label="Ligne de coupe"
        />
        <div
          className="pointer-events-none absolute border border-dashed border-emerald-500/80"
          style={{ inset: `${Math.max(2, safe)}%` }}
          aria-label="Zone de sécurité"
        />
        {(document.texts || []).map((text) => (
          <div
            key={text.id}
            className={`absolute flex overflow-hidden ${text.weight === "bold" ? "font-bold" : "font-medium"}`}
            style={{
              left: `${text.x * 100}%`,
              top: `${text.y * 100}%`,
              width: `${text.width * 100}%`,
              height: `${text.height * 100}%`,
              color: text.color || "#ffffff",
              justifyContent: text.align === "center" ? "center" : text.align === "right" ? "flex-end" : "flex-start",
              textAlign: text.align || "left",
              alignItems: "center",
              fontSize: `${Math.max(12, (text.fontSizeMm || 4) * 3.2)}px`,
              lineHeight: 1.05,
              textShadow: "0 2px 10px rgba(0,0,0,.55)",
            }}
          >
            {text.text}
          </div>
        ))}
        {document.qr ? (
          <div
            className="absolute grid place-items-center rounded bg-white/95 p-1 text-center text-[8px] font-bold text-black"
            style={{
              left: `${document.qr.x * 100}%`,
              top: `${document.qr.y * 100}%`,
              width: `${document.qr.size * 100}%`,
              aspectRatio: "1",
            }}
          >
            QR
          </div>
        ) : null}
      </div>

      <div className="grid gap-2 text-xs sm:grid-cols-3">
        <div className="rounded-xl border bg-background p-3">
          <span className="font-semibold">Format</span>
          <p className="text-muted-foreground">{product.widthMm} × {product.heightMm} mm</p>
        </div>
        <div className="rounded-xl border bg-background p-3">
          <span className="font-semibold">Fond perdu</span>
          <p className="text-muted-foreground">{product.bleedMm} mm</p>
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
          <CheckCircle2 className="h-4 w-4" /> {approved ? "BAT approuvé — fichier verrouillé pour impression." : "Préflight réussi — le BAT peut être approuvé."}
        </div>
      )}
    </div>
  );
}
