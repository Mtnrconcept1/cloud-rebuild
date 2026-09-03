import { createRoot } from "react-dom/client";
import { Analytics } from "@vercel/analytics/react";
import App from "./App.tsx";
import "./index.css";
import "./home-section-headers.css";
import "./styles/commercial-prospection-markers.css";
import "./styles/golden-tok-chefs-table.css";
import "./styles/golden-tok-chefs-table-v2.css";
import "./styles/golden-tok-chefs-table-v3.css";
import "./styles/golden-tok-chefs-table-hero.css";
import { initCapacitorPlugins } from "@/lib/capacitor-init";
import { installCommercialProspectionMarkerTheme } from "@/lib/commercialProspectionMarkerTheme";
import { initMonitoring } from "@/lib/monitoring";
import { isNative } from "@/lib/platform";
import DirectoryRestaurantOwnershipNotice from "@/components/DirectoryRestaurantOwnershipNotice";
import DirectoryClaimPersistenceBridge from "@/components/DirectoryClaimPersistenceBridge";

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
    <Analytics />
  </>
);

// Initialize native plugins after first render
if (isNative()) {
  void initCapacitorPlugins().catch((error) => {
    console.warn("Native plugin initialization failed", error);
  });
}
