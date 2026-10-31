import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import { CONSENT_EVENT, hasConsent } from "@/lib/consent";
import { isNative } from "@/lib/platform";
import {
  ensureMetricoolLoaded,
  isMetricoolTrackablePage,
  sendMetricoolPageView,
} from "@/lib/metricoolTracking";

/**
 * Metricool only measures eligible public pages and only with analytics consent.
 * A React Router navigation is a new page view even without a document reload.
 */
export default function MetricoolPageTracker() {
  const { pathname, search, hash } = useLocation();
  const [analyticsAllowed, setAnalyticsAllowed] = useState(() => hasConsent("analytics"));
  const lastTrackedPage = useRef<string | null>(null);

  useEffect(() => {
    const refreshConsent = () => setAnalyticsAllowed(hasConsent("analytics"));
    window.addEventListener(CONSENT_EVENT, refreshConsent);
    return () => window.removeEventListener(CONSENT_EVENT, refreshConsent);
  }, []);

  useEffect(() => {
    const allowed = analyticsAllowed && isMetricoolTrackablePage({
      hostname: window.location.hostname,
      pathname,
      search,
      hash,
      native: isNative(),
    });
    if (!allowed) {
      lastTrackedPage.current = null;
      return;
    }

    const pageKey = pathname + search; // Hash fragments are never tracked.
    if (lastTrackedPage.current === pageKey) return;
    let active = true;
    void ensureMetricoolLoaded().then((ready) => {
      if (!active || !ready || !hasConsent("analytics")) return;
      if (lastTrackedPage.current === pageKey) return;
      if (sendMetricoolPageView()) lastTrackedPage.current = pageKey;
    });
    return () => { active = false; };
  }, [analyticsAllowed, hash, pathname, search]);

  return null;
}
