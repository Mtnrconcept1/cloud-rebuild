// Run before React from the same origin, without relaxing the script-src CSP.
(() => {
  // Hide SEO prerender content in JS-capable browsers until React mounts.
  const root = document.documentElement;
  root.classList.add("tok-app-booting");

  let storedTheme = null;
  try {
    storedTheme = window.localStorage.getItem("theme");
  } catch {
    // Private browsing or disabled storage: use the system preference.
  }

  let prefersDark = false;
  if (storedTheme !== "dark" && storedTheme !== "light") {
    try {
      prefersDark = typeof window.matchMedia === "function"
        && window.matchMedia("(prefers-color-scheme: dark)").matches;
    } catch {
      // Some embedded browsers do not expose matchMedia.
    }
  }

  // Initialize exactly once. React owns subsequent theme changes.
  // In particular, never fight Halloween's forced dark mode when the
  // visitor's stored preference is "light".
  root.classList.toggle(
    "dark",
    storedTheme === "dark" || (storedTheme !== "light" && prefersDark),
  );
})();
