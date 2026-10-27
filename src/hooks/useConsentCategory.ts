import { useSyncExternalStore } from "react";
import { hasConsent, subscribeToConsent, type ConsentCategory } from "@/lib/consent";

/** React to a choice in this tab or another tab without reloading the page. */
export function useConsentCategory(category: Exclude<ConsentCategory, "necessary">) {
  return useSyncExternalStore(subscribeToConsent, () => hasConsent(category), () => false);
}
