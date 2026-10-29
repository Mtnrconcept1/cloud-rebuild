import { useState } from "react";
import type { MarketingPrintDocument, PrintProductSpec } from "@/lib/print/document";
import { runPrintPreflight } from "@/lib/print/preflight";
import { printSafeMargin } from "../../../../supabase/functions/_shared/print/artwork";

export default function PrintProof({ document, product, approved = false }: {
  document: MarketingPrintDocument; product: PrintProductSpec; approved?: boolean;
}) {
  const [showGuides, setShowGuides] = useState(true);
  const preflight = runPrintPreflight(document, product);
  const width = product.widthMm + 2 * product.bleedMm;
  const height = product.heightMm + 2 * product.bleedMm;
  const safe = printSafeMargin(product.safeMarginMm);
  const insets = (mm: number) => ({ left: `${mm / width * 100}%`, right: `${mm / width * 100}%`, top: `${mm / height * 100}%`, bottom: `${mm / height * 100}%` });
  return (
    <div className="space-y-4" data-testid="marketing-print-proof">
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={showGuides} onChange={event => setShowGuides(event.target.checked)} />Afficher les repères non imprimés</label>
      <div className="relative mx-auto border bg-muted" style={{ aspectRatio: `${width} / ${height}`, width: "100%", maxWidth: `${62 * width / height}vh` }}>
        <img src={document.background.url} alt={document.title} className="absolute inset-0 h-full w-full object-contain" />
        {showGuides ? <>
          <div className="pointer-events-none absolute border border-dashed border-red-500/80" style={insets(product.bleedMm)} aria-label="Ligne de coupe" />
          <div className="pointer-events-none absolute border border-dashed border-emerald-500/80" style={insets(product.bleedMm + safe)} aria-label="Zone de sécurité" />
        </> : null}
      </div>
      <p className="text-xs text-muted-foreground">Rouge : ligne de coupe obligatoire — tout texte, logo et objet essentiel doit rester entièrement à l’intérieur. Vert : marge de confort recommandée, non bloquante. Les fonds et décors peuvent aller jusqu’aux bords. Les repères ne sont pas imprimés.</p>
      <div className="grid gap-2 text-xs sm:grid-cols-3">
        <div className="rounded-xl border p-3">Format fini : {product.widthMm} × {product.heightMm} mm</div>
        <div className="rounded-xl border p-3">Fond perdu : {product.bleedMm} mm · marge intérieure : {safe} mm</div>
        <div className="rounded-xl border p-3">Résolution native : {Math.floor(Math.min(preflight.effectiveResolutionDpi.x, preflight.effectiveResolutionDpi.y))} DPI · 300 recommandés</div>
      </div>
      {preflight.blocking.map(issue => <p key={issue.code} role="alert" className="rounded-xl border border-destructive/30 p-3 text-sm text-destructive">{issue.message}</p>)}
      {preflight.warnings.map(issue => <p key={issue.code} role="status" className="rounded-xl border border-amber-300 p-3 text-sm">{issue.message}</p>)}
      <p className="rounded-xl border p-3 text-sm">{approved ? "BAT approuvé — fichier verrouillé pour impression." : "Contrôle local indicatif. Le serveur vérifie les pixels originaux et les éléments intégrés avant votre approbation du PDF."}</p>
    </div>
  );
}
