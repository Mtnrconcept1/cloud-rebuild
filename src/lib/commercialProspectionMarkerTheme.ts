const COMMERCIAL_MAP_BODY_ATTRIBUTE = "data-commercial-prospection-map";
const NAVIGATION_EVENT = "tok:commercial-map-navigation";

declare global {
  interface Window {
    __tokCommercialMapThemeInstalled?: boolean;
  }
}

function isCommercialProspectionRoute() {
  const pathname = window.location.pathname.replace(/\/+$/, "") || "/";
  return pathname === "/commercial" || pathname === "/commercial/prospection";
}

function synchronizeCommercialMapTheme() {
  document.body.toggleAttribute(
    COMMERCIAL_MAP_BODY_ATTRIBUTE,
    isCommercialProspectionRoute(),
  );
}

export function installCommercialProspectionMarkerTheme() {
  if (typeof window === "undefined" || window.__tokCommercialMapThemeInstalled) return;
  window.__tokCommercialMapThemeInstalled = true;

  const originalPushState = window.history.pushState.bind(window.history);
  const originalReplaceState = window.history.replaceState.bind(window.history);

  window.history.pushState = ((...args: Parameters<History["pushState"]>) => {
    originalPushState(...args);
    window.dispatchEvent(new Event(NAVIGATION_EVENT));
  }) as History["pushState"];

  window.history.replaceState = ((...args: Parameters<History["replaceState"]>) => {
    originalReplaceState(...args);
    window.dispatchEvent(new Event(NAVIGATION_EVENT));
  }) as History["replaceState"];

  window.addEventListener("popstate", synchronizeCommercialMapTheme);
  window.addEventListener("hashchange", synchronizeCommercialMapTheme);
  window.addEventListener(NAVIGATION_EVENT, synchronizeCommercialMapTheme);
  synchronizeCommercialMapTheme();
}
