import { useEffect, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useNavigate, useNavigationType, type Location } from "react-router-dom";

import ScrollToTop from "@/components/ScrollToTop";

import { getInternalPageTarget, getPageSwipeDirection } from "@/lib/internalPageNavigation";

// Ease-out franche (cubic-bezier(.23, 1, .32, 1)), la même que les boutons.
const EASE_OUT = [0.23, 1, 0.32, 1] as const;

/**
 * Changement de page en profondeur : la page sortante recule à peine et
 * s'efface vite (110 ms), la nouvelle avance depuis un léger retrait (240 ms),
 * soit 350 ms au lieu de 440 ms. Transformations indépendantes (x, y, scale) :
 * au repos Framer remet `transform: none`, ce qui préserve les éléments
 * `position: fixed` des pages. L'opacité ne descend jamais assez bas pour
 * faire clignoter le fond.
 */
const swipeVariants = {
  enter: (direction: number) => ({ opacity: 0.82, x: direction * 18, y: 10, scale: 0.988 }),
  visible: {
    opacity: 1,
    x: 0,
    y: 0,
    scale: 1,
    transition: { type: "tween" as const, duration: 0.24, ease: EASE_OUT },
  },
  exit: (direction: number) => ({
    opacity: 0.86,
    x: direction * -12,
    y: 0,
    scale: 0.994,
    transition: { type: "tween" as const, duration: 0.11, ease: EASE_OUT },
  }),
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
        transition={reducedMotion ? { duration: 0 } : undefined}
      >
        <ScrollToTop locationOverride={routeLocation} />
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
