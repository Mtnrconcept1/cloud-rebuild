import { useEffect } from "react";

const MAX_TILT_DEG = 5;
const LIFT_PX = 3;
const TILT_MEDIA = "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)";
// Après un défilement, Chrome rejoue des mouvements de souris immobiles pour
// recalculer le survol : on les ignore, sans quoi chaque image mesurerait et
// inclinerait la carte sous le curseur pendant le scroll.
const SCROLL_QUIET_MS = 200;

/**
 * Profondeur 3D au pointeur pour les éléments marqués `data-tok-tilt`.
 *
 * Un seul écouteur délégué sur le document (pas un par carte). La carte n'est
 * mesurée qu'à l'entrée du pointeur, jamais pendant le mouvement ; on écrit au
 * plus un `transform` par image, directement sur l'élément survolé, et la
 * transition CSS (motion.css) lisse le suivi. Inactif au toucher, au clavier,
 * en « réduire les animations » et dans les espaces de travail.
 */
export default function PointerTiltLayer() {
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(TILT_MEDIA);

    let active: HTMLElement | null = null;
    let rect: DOMRect | null = null;
    let frame = 0;
    let pointerX = 0;
    let pointerY = 0;
    let scrollQuietUntil = 0;

    const release = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      if (active) {
        active.style.transform = "";
        active.removeAttribute("data-tilting");
      }
      active = null;
      rect = null;
    };

    const paint = () => {
      frame = 0;
      if (!active || !rect) return;
      const x = (pointerX - rect.left) / rect.width - 0.5;
      const y = (pointerY - rect.top) / rect.height - 0.5;
      const rotateX = (-y * MAX_TILT_DEG).toFixed(2);
      const rotateY = (x * MAX_TILT_DEG).toFixed(2);
      active.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translate3d(0, -${LIFT_PX}px, 0)`;
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      if (event.movementX === 0 && event.movementY === 0) return;
      if (event.timeStamp < scrollQuietUntil) return;
      const target = event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-tok-tilt]")
        : null;
      const eligible = target && !target.closest(".tok-hospitality-workspace") ? target : null;
      if (eligible !== active) {
        release();
        if (!eligible) return;
        active = eligible;
        rect = eligible.getBoundingClientRect();
        eligible.setAttribute("data-tilting", "");
      }
      pointerX = event.clientX;
      pointerY = event.clientY;
      if (!frame) frame = requestAnimationFrame(paint);
    };

    // Le press (active:scale) et le défilement reprennent la main sur la carte.
    const onPointerDown = () => release();
    const onScroll = (event: Event) => {
      scrollQuietUntil = event.timeStamp + SCROLL_QUIET_MS;
      if (active) release();
    };
    const onLeaveWindow = (event: MouseEvent) => { if (!event.relatedTarget) release(); };

    const attach = () => {
      document.addEventListener("pointermove", onPointerMove, { passive: true });
      document.addEventListener("pointerdown", onPointerDown, { passive: true });
      document.addEventListener("mouseout", onLeaveWindow, { passive: true });
      window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    };
    const detach = () => {
      release();
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("mouseout", onLeaveWindow);
      window.removeEventListener("scroll", onScroll, { capture: true });
    };

    const sync = () => (media.matches ? attach() : detach());
    sync();
    media.addEventListener?.("change", sync);
    return () => {
      media.removeEventListener?.("change", sync);
      detach();
    };
  }, []);

  return null;
}
