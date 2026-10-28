// Run from the same origin before React, without relaxing the script-src CSP.
(() => {
  // Hide SEO prerender content only in JS-capable browsers until React mounts.
  document.documentElement.classList.add("tok-app-booting");

  const shouldKeepLightTheme = () => {
    try {
      return window.localStorage.getItem("theme") !== "dark";
    } catch {
      // Private browsing or restrictive storage settings must not break boot.
      return true;
    }
  };

  if (!shouldKeepLightTheme()) return;

  new MutationObserver(() => {
    if (shouldKeepLightTheme()) {
      document.documentElement.classList.remove("dark");
    }
  }).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
})();
