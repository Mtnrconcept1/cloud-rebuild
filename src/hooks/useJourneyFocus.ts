import { useLayoutEffect, useRef, type RefObject } from "react";

/** Run after the destination mounts, including routes resolved by Suspense.
 * Never depend on data refreshes or filter query strings: those keep position.
 */
export function useJourneyFocus<T extends HTMLElement>(
  targetRef: RefObject<T>,
  destination: string | number | null,
  mode: "page" | "section" | "container" = "page",
  skipInitial = false,
) {
  const previous = useRef(destination);

  useLayoutEffect(() => {
    const changed = previous.current !== destination;
    previous.current = destination;
    if (destination === null || (skipInitial && !changed)) return;
    const target = targetRef.current;
    if (!target) return;

    const reveal = () => {
      target.focus({ preventScroll: true });
      if (mode === "page") {
        // "instant" also overrides a global CSS scroll-behavior: smooth.
        window.scrollTo({ top: 0, left: 0, behavior: "instant" });
        if (document.scrollingElement) {
          document.scrollingElement.scrollTop = 0;
          document.scrollingElement.scrollLeft = 0;
        }
      } else if (mode === "container") {
        target.scrollTop = 0;
      } else {
        target.scrollIntoView?.({ block: "start", behavior: "instant" });
      }
    };

    reveal();
    const frame = window.requestAnimationFrame(reveal);
    return () => window.cancelAnimationFrame(frame);
  }, [destination, mode, skipInitial, targetRef]);
}
