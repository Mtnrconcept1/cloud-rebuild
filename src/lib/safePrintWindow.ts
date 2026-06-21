type OpenSafePrintWindowOptions = {
  title: string;
  headHtml?: string;
  bodyHtml: string;
  features?: string;
  printDelayMs?: number;
  preferIframeFallback?: boolean;
};

type OpenSafeHtmlPrintDocumentOptions = {
  html: string;
  title?: string;
  features?: string;
  printDelayMs?: number;
  preferIframeFallback?: boolean;
};

const UNSAFE_PRINT_HTML_PATTERNS = [
  /<script\b/i,
  /\son[a-z]+\s*=/i,
  /\b(?:href|src)\s*=\s*["']?\s*javascript:/i,
];

export function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function assertSafePrintHtmlFragment(value: string, label: string) {
  for (const pattern of UNSAFE_PRINT_HTML_PATTERNS) {
    if (pattern.test(value)) {
      throw new Error(`Unsafe ${label} print HTML fragment.`);
    }
  }

  return value;
}

function renderPrintDocument(targetWindow: Window, html: string, printDelayMs: number) {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const importedDocument = targetWindow.document.importNode(parsed.documentElement, true);
  targetWindow.document.documentElement.replaceWith(importedDocument);
  targetWindow.document.close();

  if (printDelayMs >= 0) {
    targetWindow.setTimeout(() => {
      targetWindow.focus();
      const print = targetWindow.print || window.print;
      print.call(targetWindow);
    }, printDelayMs);
  }
}

function openIframePrintFallback(html: string, printDelayMs: number) {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "1px";
  iframe.style.height = "1px";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";
  document.body.appendChild(iframe);

  const targetWindow = iframe.contentWindow;
  if (!targetWindow) {
    iframe.remove();
    return false;
  }

  renderPrintDocument(targetWindow, html, printDelayMs);
  targetWindow.setTimeout(() => iframe.remove(), Math.max(printDelayMs + 30_000, 30_000));
  return true;
}

export function openSafeHtmlPrintDocument({
  html,
  title,
  features = "noopener,noreferrer",
  printDelayMs = 150,
  preferIframeFallback = false,
}: OpenSafeHtmlPrintDocumentOptions) {
  const safeHtml = assertSafePrintHtmlFragment(html, "document");

  if (preferIframeFallback) {
    return openIframePrintFallback(safeHtml, printDelayMs);
  }

  const printWindow = window.open("", "_blank", features);

  if (printWindow) {
    if (title) printWindow.document.title = title;
    renderPrintDocument(printWindow, safeHtml, printDelayMs);
    return true;
  }

  return openIframePrintFallback(safeHtml, printDelayMs);
}

export function openSafePrintWindow({
  title,
  headHtml = "",
  bodyHtml,
  features = "noopener,noreferrer",
  printDelayMs = 150,
  preferIframeFallback = false,
}: OpenSafePrintWindowOptions) {
  const safeHeadHtml = assertSafePrintHtmlFragment(headHtml, "head");
  const safeBodyHtml = assertSafePrintHtmlFragment(bodyHtml, "body");
  const html = `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    ${safeHeadHtml}
  </head>
  <body>${safeBodyHtml}</body>
</html>`;

  return openSafeHtmlPrintDocument({
    title,
    html,
    features,
    printDelayMs,
    preferIframeFallback,
  });
}
