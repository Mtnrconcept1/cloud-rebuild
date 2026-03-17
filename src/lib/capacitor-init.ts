import { isNative, getPlatform } from "@/lib/platform";

export async function initCapacitorPlugins() {
  if (!isNative()) return;

  // Status bar
  const { StatusBar, Style } = await import("@capacitor/status-bar");
  const isDark = document.documentElement.classList.contains("dark");
  await StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light });

  if (getPlatform() === "android") {
    await StatusBar.setBackgroundColor({ color: isDark ? "#0f172a" : "#ffffff" });
    await StatusBar.setOverlaysWebView({ overlay: false });
  }

  // Sync status bar when dark mode toggles
  const observer = new MutationObserver(async () => {
    const dark = document.documentElement.classList.contains("dark");
    await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
    if (getPlatform() === "android") {
      await StatusBar.setBackgroundColor({ color: dark ? "#0f172a" : "#ffffff" });
    }
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

  // Splash screen — hide after mount
  const { SplashScreen } = await import("@capacitor/splash-screen");
  await SplashScreen.hide();

  // Keyboard — add CSS class when visible
  const { Keyboard } = await import("@capacitor/keyboard");
  Keyboard.addListener("keyboardWillShow", () => {
    document.body.classList.add("keyboard-visible");
  });
  Keyboard.addListener("keyboardWillHide", () => {
    document.body.classList.remove("keyboard-visible");
  });
}
