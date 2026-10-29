import { useEffect } from "react";

export const HALLOWEEN_FEATURE_FLAG = "seasonal-halloween-2026";

type HalloweenThemeProps = {
  enabled: boolean;
};

export default function HalloweenTheme({ enabled }: HalloweenThemeProps) {
  useEffect(() => {
    if (!enabled) {
      if (document.documentElement.dataset.seasonalTheme === "halloween") {
        delete document.documentElement.dataset.seasonalTheme;
      }
      return undefined;
    }

    document.documentElement.dataset.seasonalTheme = "halloween";

    return () => {
      if (document.documentElement.dataset.seasonalTheme === "halloween") {
        delete document.documentElement.dataset.seasonalTheme;
      }
    };
  }, [enabled]);

  if (!enabled) return null;

  return <div className="tok-halloween-canopy" aria-hidden="true" />;
}
