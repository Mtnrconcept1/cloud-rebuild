import { App, type URLOpenListenerEvent } from "@capacitor/app";
import { isNative } from "@/lib/platform";

export function setupDeepLinks(navigateFn: (path: string) => void) {
  if (!isNative()) return;

  App.addListener("appUrlOpen", (event: URLOpenListenerEvent) => {
    const url = new URL(event.url);
    const path = url.pathname || "/";
    navigateFn(path);
  });

  // Handle Android back button
  App.addListener("backButton", ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back();
    } else {
      App.exitApp();
    }
  });
}
