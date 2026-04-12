import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initCapacitorPlugins } from "@/lib/capacitor-init";
import { initMonitoring } from "@/lib/monitoring";
import { isNative } from "@/lib/platform";

// Restore dark mode preference
const storedTheme = localStorage.getItem("theme");
if (storedTheme === "dark" || (!storedTheme && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
  document.documentElement.classList.add("dark");
}

initMonitoring();

createRoot(document.getElementById("root")!).render(<App />);

// Initialize native plugins after first render
if (isNative()) {
  initCapacitorPlugins();
}
