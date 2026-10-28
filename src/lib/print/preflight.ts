import { buildNativePrintTemplate, hasArtworkOverlays, validateNativeArtwork } from "../../../supabase/functions/_shared/print/artwork";
import type { MarketingPrintDocument, PrintPreflightResult, PrintProductSpec } from "./document";

export function runPrintPreflight(document: MarketingPrintDocument, spec: PrintProductSpec): PrintPreflightResult {
  let result: PrintPreflightResult;
  try {
    const template = buildNativePrintTemplate(spec);
    result = validateNativeArtwork(document.background.widthPx, document.background.heightPx, template);
  } catch {
    result = { ready: false, blocking: [{ code: "invalid_product_spec", message: "Gabarit ou résolution native non pris en charge." }],
      warnings: [], effectiveResolutionDpi: { x: 0, y: 0 } };
  }
  if (hasArtworkOverlays(document)) result.blocking.push({ code: "artwork_overlays_forbidden", message: "Le visuel doit être généré intégralement : aucun ajout de texte, logo ou QR après génération." });
  if (!/^https:\/\//i.test(document.background.url)) result.blocking.push({ code: "background_url", message: "L’image doit être accessible en HTTPS." });
  if (spec.minimumQuantity < 1 || spec.quantityStep < 1) result.blocking.push({ code: "invalid_quantity_rules", message: "Les règles de quantité du produit sont invalides." });
  result.ready = result.blocking.length === 0;
  return result;
}
