import type {
  MarketingPrintDocument,
  PrintPreflightIssue,
  PrintPreflightResult,
  PrintProductSpec,
} from "./document";

const MM_PER_INCH = 25.4;
const MIN_BLOCKING_DPI = 150;
const RECOMMENDED_DPI = 250;

function issue(code: string, message: string, field?: string): PrintPreflightIssue {
  return { code, message, field };
}

function normalizedInsideSafeZone(
  element: { x: number; y: number; width: number; height: number },
  spec: PrintProductSpec,
) {
  const safeX = spec.safeMarginMm / spec.widthMm;
  const safeY = spec.safeMarginMm / spec.heightMm;
  return element.x >= safeX
    && element.y >= safeY
    && element.x + element.width <= 1 - safeX
    && element.y + element.height <= 1 - safeY;
}

function validNormalizedBox(element: { x: number; y: number; width: number; height: number }) {
  return [element.x, element.y, element.width, element.height].every(Number.isFinite)
    && element.x >= 0
    && element.y >= 0
    && element.width > 0
    && element.height > 0
    && element.x + element.width <= 1
    && element.y + element.height <= 1;
}

export function runPrintPreflight(
  document: MarketingPrintDocument,
  spec: PrintProductSpec,
): PrintPreflightResult {
  const blocking: PrintPreflightIssue[] = [];
  const warnings: PrintPreflightIssue[] = [];

  if (!spec.widthMm || !spec.heightMm || spec.widthMm <= 0 || spec.heightMm <= 0) {
    blocking.push(issue("invalid_dimensions", "Les dimensions d’impression sont invalides."));
  }
  if (spec.bleedMm < 0 || spec.safeMarginMm < 0) {
    blocking.push(issue("invalid_print_margins", "Le fond perdu ou la marge de sécurité est invalide."));
  }

  const physicalWidthInches = Math.max(0.001, (spec.widthMm + spec.bleedMm * 2) / MM_PER_INCH);
  const physicalHeightInches = Math.max(0.001, (spec.heightMm + spec.bleedMm * 2) / MM_PER_INCH);
  const dpiX = document.background.widthPx / physicalWidthInches;
  const dpiY = document.background.heightPx / physicalHeightInches;
  const minDpi = Math.min(dpiX, dpiY);

  if (!/^https:\/\//i.test(document.background.url)) {
    blocking.push(issue("background_url", "L’image de fond doit être accessible en HTTPS.", "background"));
  }
  if (!Number.isFinite(minDpi) || minDpi < MIN_BLOCKING_DPI) {
    blocking.push(issue(
      "resolution_too_low",
      `Résolution insuffisante pour l’impression (${Math.max(0, Math.round(minDpi))} dpi effectifs).`,
      "background",
    ));
  } else if (minDpi < RECOMMENDED_DPI) {
    warnings.push(issue(
      "resolution_below_recommended",
      `Résolution correcte mais inférieure aux ${RECOMMENDED_DPI} dpi recommandés.`,
      "background",
    ));
  }

  for (const text of document.texts) {
    if (!text.text.trim()) continue;
    if (!validNormalizedBox(text)) {
      blocking.push(issue("text_outside_page", `Le texte « ${text.text.slice(0, 40)} » sort de la page.`, text.id));
      continue;
    }
    if (!normalizedInsideSafeZone(text, spec)) {
      blocking.push(issue("text_outside_safe_area", `Un texte important est trop proche de la coupe.`, text.id));
    }
  }

  if (document.qr) {
    if (!/^https?:\/\//i.test(document.qr.value)) {
      blocking.push(issue("qr_invalid", "Le QR code doit contenir une URL HTTP(S) valide.", "qr"));
    }
    const sizeMm = document.qr.size * Math.min(spec.widthMm, spec.heightMm);
    if (!Number.isFinite(sizeMm) || sizeMm < 18) {
      blocking.push(issue("qr_too_small", "Le QR code est trop petit pour une lecture fiable.", "qr"));
    }
    const qrBox = { x: document.qr.x, y: document.qr.y, width: document.qr.size, height: document.qr.size };
    if (!validNormalizedBox(qrBox) || !normalizedInsideSafeZone(qrBox, spec)) {
      blocking.push(issue("qr_outside_safe_area", "Le QR code doit rester dans la zone de sécurité.", "qr"));
    }
  }

  if (spec.minimumQuantity < 1 || spec.quantityStep < 1) {
    blocking.push(issue("invalid_quantity_rules", "Les règles de quantité du produit sont invalides."));
  }

  return {
    blocking,
    warnings,
    effectiveResolutionDpi: { x: dpiX, y: dpiY },
    ready: blocking.length === 0,
  };
}
