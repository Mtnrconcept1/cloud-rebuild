import { useEffect, useRef } from "react";

import { invokeSupabaseFunction } from "@/lib/session";
import {
  clearPaymentAttemptId,
  readRedirectedPaymentAttemptId,
  shouldCancelPaymentAttemptAfterNavigation,
} from "@/lib/paymentAttempt";

type PaymentAttemptBackCancellationOptions = {
  scope: string | null;
  enabled?: boolean;
  onCancelled?: (paymentAttemptId: string) => void;
  onError?: (error: unknown, paymentAttemptId: string) => void;
};

export function usePaymentAttemptBackCancellation({
  scope,
  enabled = true,
  onCancelled,
  onError,
}: PaymentAttemptBackCancellationOptions) {
  const callbacksRef = useRef({ onCancelled, onError });
  const cancellingRef = useRef<string | null>(null);
  callbacksRef.current = { onCancelled, onError };

  useEffect(() => {
    if (!scope || !enabled || typeof window === "undefined") return;

    const cancelRedirectedAttempt = async (pageWasRestored: boolean) => {
      const navigationEntry = typeof performance !== "undefined"
        ? performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined
        : undefined;
      if (!shouldCancelPaymentAttemptAfterNavigation(
        navigationEntry?.type ?? null,
        pageWasRestored,
        window.location.search,
      )) return;

      const paymentAttemptId = readRedirectedPaymentAttemptId(scope);
      if (!paymentAttemptId || cancellingRef.current === paymentAttemptId) return;
      cancellingRef.current = paymentAttemptId;

      try {
        const { error } = await invokeSupabaseFunction("cancel-payment-attempt", {
          body: { payment_attempt_id: paymentAttemptId, reason: "browser_back" },
        });
        if (error) throw error;
        clearPaymentAttemptId(scope, paymentAttemptId);
        callbacksRef.current.onCancelled?.(paymentAttemptId);
      } catch (error) {
        cancellingRef.current = null;
        callbacksRef.current.onError?.(error, paymentAttemptId);
      }
    };

    const handlePageShow = (event: PageTransitionEvent) => {
      void cancelRedirectedAttempt(event.persisted);
    };

    window.addEventListener("pageshow", handlePageShow);
    void cancelRedirectedAttempt(false);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, [enabled, scope]);
}
