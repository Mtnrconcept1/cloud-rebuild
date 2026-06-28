import { useEffect, useState } from "react";

import { DEFAULT_TOK_LOGO_SRC, getNextZurichDayDelayMs, getTokLogoForDate } from "@/lib/tokLogo";

export function useTokLogo() {
  const [logo, setLogo] = useState(() => getTokLogoForDate());

  useEffect(() => {
    let timeoutId: number | undefined;

    const scheduleNextUpdate = () => {
      setLogo(getTokLogoForDate());
      timeoutId = window.setTimeout(scheduleNextUpdate, getNextZurichDayDelayMs());
    };

    timeoutId = window.setTimeout(scheduleNextUpdate, getNextZurichDayDelayMs());

    return () => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, []);

  return logo;
}

export function useTokLogoSrc() {
  return useTokLogo().src;
}

export function useTokLogoDocumentIcons() {
  const documentIconSrc = DEFAULT_TOK_LOGO_SRC;

  useEffect(() => {
    if (typeof document === "undefined") return;

    const iconLinks = document.querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="apple-touch-icon"]');
    iconLinks.forEach((link) => {
      link.href = documentIconSrc;
      if (link.rel === "icon") link.type = "image/png";
    });
  }, [documentIconSrc]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const manifestLink = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!manifestLink) return;

    manifestLink.href = "/manifest.json";
  }, []);
}
