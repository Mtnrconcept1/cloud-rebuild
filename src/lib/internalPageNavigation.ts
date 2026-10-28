/**
 * Keep ordinary internal anchors in the SPA while leaving documents, auth
 * callbacks and cross-origin destinations to the browser.
 */
const DOCUMENT_EXTENSION = /\.(?:pdf|png|jpe?g|webp|gif|svg|ico|mp4|webm|mp3|wav|zip|csv|xlsx?|docx?|html?|css|js|json|xml|txt|webmanifest)$/i;
const NON_APP_PATH = /^\/(?:api|_vercel|_next|\.well-known)(?:\/|$)/i;
const DOCUMENT_CALLBACK = /^\/(?:auth\/callback|oauth\/callback)(?:\/|$)/i;

export function getInternalPageTarget(href: string, currentHref: string): string | null {
  if (!href.trim()) return null;

  try {
    const current = new URL(currentHref);
    const target = new URL(href, current);

    if (!["http:", "https:"].includes(target.protocol) || target.origin !== current.origin) {
      return null;
    }

    if (NON_APP_PATH.test(target.pathname) || DOCUMENT_CALLBACK.test(target.pathname) || DOCUMENT_EXTENSION.test(target.pathname)) {
      return null;
    }

    if (target.href === current.href) return null;
    if (target.pathname === current.pathname && target.search === current.search && target.hash) {
      return null; // Native anchor scrolling, not a page change.
    }

    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return null;
  }
}

export function getPageSwipeDirection(navigationType: "POP" | "PUSH" | "REPLACE"): number {
  return navigationType === "POP" ? -1 : 1;
}
