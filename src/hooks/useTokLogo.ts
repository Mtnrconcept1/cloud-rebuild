import { useEffect, useState } from "react";

import { getNextZurichDayDelayMs, getTokLogoForDate } from "@/lib/tokLogo";

type ManifestIcon = {
  src?: string;
  type?: string;
  [key: string]: unknown;
};

type WebAppManifest = {
  icons?: ManifestIcon[];
  shortcuts?: Array<{
    icons?: ManifestIcon[];
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
};

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
  const logo = useTokLogo();

  useEffect(() => {
    if (typeof document === "undefined") return;

    const iconLinks = document.querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="apple-touch-icon"]');
    iconLinks.forEach((link) => {
      link.href = logo.src;
      if (link.rel === "icon") link.type = logo.src.endsWith(".webp") ? "image/webp" : "image/png";
    });
  }, [logo.src]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const manifestLink = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!manifestLink) return;

    let active = true;
    let objectUrl: string | undefined;

    const applyManifestLogo = async () => {
      try {
        const response = await fetch("/manifest.json");
        if (!response.ok) return;

        const manifest = (await response.json()) as WebAppManifest;
        const iconType = logo.src.endsWith(".webp") ? "image/webp" : "image/png";
        const rewriteIcon = (icon: ManifestIcon) => ({ ...icon, src: logo.src, type: iconType });

        manifest.icons = manifest.icons?.map(rewriteIcon);
        manifest.shortcuts = manifest.shortcuts?.map((shortcut) => ({
          ...shortcut,
          icons: shortcut.icons?.map(rewriteIcon),
        }));

        if (!active) return;

        objectUrl = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: "application/manifest+json" }));
        manifestLink.href = objectUrl;
      } catch {
        manifestLink.href = "/manifest.json";
      }
    };

    void applyManifestLogo();

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [logo.src]);
}
