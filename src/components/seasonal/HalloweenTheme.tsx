import { useEffect } from "react";

export const HALLOWEEN_FEATURE_FLAG = "seasonal-halloween-2026";

type HalloweenThemeProps = {
  enabled: boolean;
};

// The decoration is a child of the sticky navbar, sharing its transform exactly.
export function HalloweenCanopy() {
  return (
    <div className="tok-halloween-canopy" aria-hidden="true">
      <img src="/images/seasonal/halloween/canopy.webp" alt="" decoding="async" />
    </div>
  );
}

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

  return null;
}
