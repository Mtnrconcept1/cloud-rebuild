import { lazy, Suspense } from "react";
import { useConsentCategory } from "@/hooks/useConsentCategory";
import { hasConsent } from "@/lib/consent";

const Analytics = lazy(() => import("@vercel/analytics/react").then((module) => ({ default: module.Analytics })));

export default function OptionalAnalytics() {
  const allowed = useConsentCategory("analytics");
  if (!allowed) return null;
  return <Suspense fallback={null}><Analytics beforeSend={(event) => hasConsent("analytics") ? event : null} /></Suspense>;
}
