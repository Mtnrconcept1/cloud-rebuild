import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { initAcquisitionAttribution, trackPageView } from "@/lib/acquisitionAttribution";

/** Consent-gated page views and first-touch capture for the public client shell. */
export default function PageViewTracker() {
  const { pathname } = useLocation();

  useEffect(() => {
    initAcquisitionAttribution();
  }, []);

  useEffect(() => {
    trackPageView(pathname);
  }, [pathname]);

  return null;
}
