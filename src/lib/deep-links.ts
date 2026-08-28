import { App, type URLOpenListenerEvent } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import type { PluginListenerHandle } from "@capacitor/core";
import { isNative } from "@/lib/platform";
import { getNavigationTargetFromAppUrl } from "@/lib/navigation";

let deepLinkHandles: Array<Promise<PluginListenerHandle>> = [];

function removeDeepLinkHandles(handles: Array<Promise<PluginListenerHandle>>) {
  for (const handlePromise of handles) {
    void handlePromise
      .then((handle) => handle.remove())
      .catch((error) => {
        console.warn("Unable to remove native app listener", error);
      });
  }
}

export function cleanupDeepLinks() {
  const handles = deepLinkHandles;
  deepLinkHandles = [];
  removeDeepLinkHandles(handles);
}

export function setupDeepLinks(navigateFn: (path: string) => void) {
  if (!isNative()) return () => undefined;

  cleanupDeepLinks();

  const handles = [
    App.addListener("appUrlOpen", (event: URLOpenListenerEvent) => {
      const path = getNavigationTargetFromAppUrl(event.url, "/");
      if (path === "/auth/callback" || path.startsWith("/auth/callback?")) {
        void Browser.close().catch((error) => {
          console.warn("Unable to close native OAuth browser", error);
        });
      }
      navigateFn(path);
    }),

    App.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back();
      } else {
        App.exitApp();
      }
    }),
  ];

  deepLinkHandles = handles;

  return () => {
    if (deepLinkHandles === handles) cleanupDeepLinks();
  };
}
