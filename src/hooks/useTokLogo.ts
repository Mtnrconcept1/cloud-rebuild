import { useEffect } from "react";

import {
  DEFAULT_TOK_LOGO_SRC,
  getTokLogoForDate,
  getTokLogoSrcForPath,
} from "@/lib/tokLogo";

export function useTokLogo() {
  return getTokLogoForDate();
}

export function useTokLogoSrc() {
  const pathname = typeof window === "undefined" ? "" : window.location.pathname;
  return getTokLogoSrcForPath(pathname);
}

export function useTokLogoDocumentIcons() {
  useEffect(() => {
    if (typeof document === "undefined") return;

    const iconLinks = document.querySelectorAll<HTMLLinkElement>(
      'link[rel="icon"], link[rel="apple-touch-icon"]',
    );
    iconLinks.forEach((link) => {
      link.href = DEFAULT_TOK_LOGO_SRC;
      if (link.rel === "icon") link.type = "image/png";
    });

    const manifestLink = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (manifestLink) manifestLink.href = "/manifest.json";
  }, []);
}
