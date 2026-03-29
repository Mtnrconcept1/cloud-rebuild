import { App, type URLOpenListenerEvent } from "@capacitor/app";
import { isNative } from "@/lib/platform";
import { getNavigationTargetFromAppUrl } from "@/lib/navigation";

export function setupDeepLinks(navigateFn: (path: string) => void) {
  if (!isNative()) return;

  App.addListener("appUrlOpen", (event: URLOpenListenerEvent) => {
    const path = getNavigationTargetFromAppUrl(event.url, "/");
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
