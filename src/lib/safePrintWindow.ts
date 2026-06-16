type OpenSafePrintWindowOptions = {
  title: string;
  headHtml?: string;
  bodyHtml: string;
  features?: string;
  printDelayMs?: number;
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

export function openSafePrintWindow({
  title,
  headHtml = "",
  bodyHtml,
  features = "noopener,noreferrer",
  printDelayMs = 150,
}: OpenSafePrintWindowOptions) {
  const nextWindow = window.open("", "_blank", features);
  if (!nextWindow) return false;

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

  const parsed = new DOMParser().parseFromString(html, "text/html");
  const importedDocument = nextWindow.document.importNode(parsed.documentElement, true);
  nextWindow.document.documentElement.replaceWith(importedDocument);
  nextWindow.document.close();

  if (printDelayMs >= 0) {
    nextWindow.setTimeout(() => {
      nextWindow.focus();
      const print = nextWindow.print || window.print;
      print.call(nextWindow);
    }, printDelayMs);
  }

  return true;
}
