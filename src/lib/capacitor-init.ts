import type { PluginListenerHandle } from "@capacitor/core";
import { isNative, getPlatform } from "@/lib/platform";

let initPromise: Promise<void> | null = null;
let cleanupNativePlugins: (() => void) | null = null;

async function runNativeInitStep(name: string, step: () => Promise<void>) {
  try {
    await step();
  } catch (error) {
    console.warn(`Capacitor ${name} initialization failed`, error);
  }
}

function cleanupListenerHandles(handles: PluginListenerHandle[]) {
  for (const handle of handles) {
    void handle.remove().catch((error) => {
      console.warn("Unable to remove Capacitor listener", error);
    });
  }
}

export async function initCapacitorPlugins() {
  if (!isNative()) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const disposers: Array<() => void> = [];

    await runNativeInitStep("status bar", async () => {
      const { StatusBar, Style } = await import("@capacitor/status-bar");
      const applyStatusBarTheme = async () => {
        const isDark = document.documentElement.classList.contains("dark");
        await StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light });

        if (getPlatform() === "android") {
          await StatusBar.setBackgroundColor({ color: isDark ? "#0f172a" : "#ffffff" });
          await StatusBar.setOverlaysWebView({ overlay: false });
        }
      };

      await applyStatusBarTheme();

      const observer = new MutationObserver(() => {
        void applyStatusBarTheme().catch((error) => {
          console.warn("Unable to update native status bar theme", error);
        });
      });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
      disposers.push(() => observer.disconnect());
    });

    await runNativeInitStep("splash screen", async () => {
      const { SplashScreen } = await import("@capacitor/splash-screen");
      await SplashScreen.hide();
    });

    await runNativeInitStep("keyboard", async () => {
      const { Keyboard } = await import("@capacitor/keyboard");
      const showHandle = await Keyboard.addListener("keyboardWillShow", () => {
        document.body.classList.add("keyboard-visible");
      });
      const hideHandle = await Keyboard.addListener("keyboardWillHide", () => {
        document.body.classList.remove("keyboard-visible");
      });

      disposers.push(() => cleanupListenerHandles([showHandle, hideHandle]));
    });

    cleanupNativePlugins = () => {
      for (const dispose of disposers.splice(0)) dispose();
      cleanupNativePlugins = null;
      initPromise = null;
    };
  })();

  return initPromise;
}

export function cleanupCapacitorPlugins() {
  cleanupNativePlugins?.();
}
