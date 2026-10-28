import { useEffect } from "react";
import { useLocation, type Location } from "react-router-dom";
import { isCustomerWorkspacePath } from "@/lib/customerWorkspaceRoutes";

export default function ScrollToTop({
  locationOverride,
}: {
  locationOverride?: Pick<Location, "pathname" | "search" | "hash">;
} = {}) {
  const currentLocation = useLocation();
  // Keep the exiting screen at its present scroll position until the swipe ends.
  const { pathname, search, hash } = locationOverride ?? currentLocation;
  // Workspace filters do not represent a new page. Profile tabs do.
  const workspace = pathname === "/dashboard" || pathname.startsWith("/dashboard/") || isCustomerWorkspacePath(pathname);
  const destination = workspace ? new URLSearchParams(search).get("tab") || "" : search;

  useEffect(() => {
    if (hash) return;
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }

    const resetScroll = () => {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      document.scrollingElement?.scrollTo?.({ top: 0, left: 0, behavior: "instant" });
      if (document.scrollingElement) {
        document.scrollingElement.scrollTop = 0;
        document.scrollingElement.scrollLeft = 0;
      }
    };

    resetScroll();
    const frame = window.requestAnimationFrame(resetScroll);

    return () => window.cancelAnimationFrame(frame);
  }, [pathname, destination, hash]);

  return null;
}
