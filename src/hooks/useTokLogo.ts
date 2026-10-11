import { useEffect } from "react";

import {
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
      link.href = link.rel === "apple-touch-icon" ? "/favicon-180x180.png" : "/favicon-48x48.png";
      if (link.rel === "icon") link.type = "image/png";
    });

    const manifestLink = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (manifestLink) manifestLink.href = "/manifest.json";
  }, []);
}
