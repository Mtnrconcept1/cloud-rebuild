import { createRoot } from "react-dom/client";
import OptionalAnalytics from "@/components/legal/OptionalAnalytics";
import App from "./App.tsx";
import { recoverChunkLoadError } from "@/components/ErrorBoundary";
import "./index.css";
import "./home-section-headers.css";
import "./styles/commercial-prospection-markers.css";
import "./styles/golden-tok-chefs-table.css";
import "./styles/golden-tok-chefs-table-v2.css";
import "./styles/golden-tok-chefs-table-v3.css";
import "./styles/golden-tok-chefs-table-hero.css";
import "./styles/golden-tok-chefs-table-v4.css";
import "./styles/golden-tok-chefs-table-v5.css";
import "./styles/golden-tok-chefs-table-v6.css";
import { initCapacitorPlugins } from "@/lib/capacitor-init";
import { installCommercialProspectionMarkerTheme } from "@/lib/commercialProspectionMarkerTheme";
import { initMonitoring } from "@/lib/monitoring";
import { isNative } from "@/lib/platform";
import DirectoryRestaurantOwnershipNotice from "@/components/DirectoryRestaurantOwnershipNotice";
import DirectoryClaimPersistenceBridge from "@/components/DirectoryClaimPersistenceBridge";

// Vite emits this before React can necessarily catch a failed lazy module.
// Prevent the unhandled preload error only when a bounded recovery has started.
window.addEventListener("vite:preloadError", (event) => {
  const payload = (event as Event & { payload?: unknown }).payload;
  if (recoverChunkLoadError(payload)) event.preventDefault();
});

// Restore dark mode preference
const storedTheme = localStorage.getItem("theme");
if (
  storedTheme === "dark" ||
  (!storedTheme &&
    window.matchMedia("(prefers-color-scheme: dark)").matches)
) {
  document.documentElement.classList.add("dark");
}

installCommercialProspectionMarkerTheme();
initMonitoring();

createRoot(document.getElementById("root")!).render(
  <>
    <App />
    <DirectoryRestaurantOwnershipNotice />
    <DirectoryClaimPersistenceBridge />
    <OptionalAnalytics />
  </>
);

// Initialize native plugins after first render
if (isNative()) {
  void initCapacitorPlugins().catch((error) => {
    console.warn("Native plugin initialization failed", error);
  });
}
// HeroSection owns responsive hero-image selection; keep bootstrap free of fixed hero preloads.

// Background heroes use responsive high-quality sources; avoid reintroducing fixed compressed preloads here.
