import { useEffect, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useNavigate, useNavigationType, type Location } from "react-router-dom";

import ScrollToTop from "@/components/ScrollToTop";

import { getInternalPageTarget, getPageSwipeDirection } from "@/lib/internalPageNavigation";

const swipeVariants = {
  enter: (direction: number) => ({ opacity: 0.88, x: direction * 36 }),
  visible: { opacity: 1, x: 0 },
  exit: (direction: number) => ({ opacity: 0.9, x: direction * -28 }),
};

/**
 * React Router Link handles its own clicks. This listener only catches plain
 * same-origin <a> links that would otherwise reload a prerendered document.
 */
export function InternalLinkNavigation({ enabled = true }: { enabled?: boolean }) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!enabled) return;

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
        return;
      }

      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!anchor || !(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.hasAttribute("download") || (anchor.target && anchor.target !== "_self")) return;
      if (anchor.rel.split(/\s+/).includes("external") || anchor.closest("[data-no-client-navigation]")) return;

      const rawHref = anchor.getAttribute("href")?.trim();
      if (!rawHref || rawHref.startsWith("#")) return;

      const destination = getInternalPageTarget(rawHref, window.location.href);
      if (!destination) return;

      // Registered on document in bubble phase, after React Router Link.
      event.preventDefault();
      navigate(destination);
    };

    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [enabled, navigate]);

  return null;
}

/**
 * Keep the exiting route visible until its short swipe finishes. Each Routes
 * tree is pinned to its location snapshot, including while a lazy page loads.
 */
export function PageSwipeTransition({
  routeKey,
  routeLocation,
  children,
}: {
  routeKey: string;
  routeLocation: Location;
  children: ReactNode;
}) {
  const navigationType = useNavigationType();
  const reducedMotion = useReducedMotion() === true;
  const direction = getPageSwipeDirection(navigationType);

  return (
    <AnimatePresence initial={false} mode="wait" custom={direction}>
      <motion.div
        key={routeKey}
        className="relative w-full min-w-0"
        custom={direction}
        variants={swipeVariants}
        initial={reducedMotion ? false : "enter"}
        animate="visible"
        exit={reducedMotion ? undefined : "exit"}
        transition={{ type: "tween", duration: reducedMotion ? 0 : 0.22, ease: "easeOut" }}
      >
        <ScrollToTop locationOverride={routeLocation} />
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
