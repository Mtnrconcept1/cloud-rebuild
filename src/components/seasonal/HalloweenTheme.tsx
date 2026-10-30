import { useLayoutEffect } from "react";

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
  useLayoutEffect(() => {
    if (!enabled) return undefined;

    const root = document.documentElement;
    root.dataset.seasonalTheme = "halloween";

    // Halloween is exclusively a dark theme, without overwriting the user's preference.
    const enforceDark = () => {
      if (!root.classList.contains("dark")) root.classList.add("dark");
    };
    enforceDark();

    const observer = new MutationObserver(enforceDark);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });

    return () => {
      observer.disconnect();
      if (root.dataset.seasonalTheme !== "halloween") return;

      delete root.dataset.seasonalTheme;
      const storedTheme = localStorage.getItem("theme");
      const systemPrefersDark = typeof window.matchMedia === "function"
        && window.matchMedia("(prefers-color-scheme: dark)").matches;
      root.classList.toggle(
        "dark",
        storedTheme === "dark" || (storedTheme === null && systemPrefersDark),
      );
    };
  }, [enabled]);

  return null;
}
