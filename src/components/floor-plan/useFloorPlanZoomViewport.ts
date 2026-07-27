import { useCallback, useEffect, useRef, type RefObject } from "react";

/**
 * Zoom for the floor-plan canvases.
 *
 * The previous implementation multiplied every object's size by the zoom while
 * keeping the room at a fixed pixel size, and remapped positions through a
 * travel ratio that itself depended on the object's scaled size. Zooming
 * therefore shrank the furniture *inside* an unchanged room and made objects
 * drift relative to each other — and the requested zoom was silently clamped to
 * the fit factor, so zooming in past 100% did nothing at all.
 *
 * Here the room geometry is resolved once at its fit scale and never depends on
 * the user zoom, which becomes what a zoom is everywhere else: a scale on the
 * view, with the viewport scrolling over the result. Object coordinates are
 * invariant, so a plan looks identical at every zoom level.
 */

export const FLOOR_PLAN_MIN_ZOOM = 0.4;
export const FLOOR_PLAN_MAX_ZOOM = 3;
/** Multiplicative so a step feels the same at 50% and at 250%. */
export const FLOOR_PLAN_ZOOM_FACTOR = 1.25;

export function clampFloorPlanZoom(value: number) {
  if (!Number.isFinite(value)) return 1;
  const rounded = Math.round(value * 100) / 100;
  return Math.min(FLOOR_PLAN_MAX_ZOOM, Math.max(FLOOR_PLAN_MIN_ZOOM, rounded));
}

type FloorPlanZoomViewportOptions = {
  viewportRef: RefObject<HTMLDivElement | null>;
  zoom: number;
  onZoomChange: (zoom: number) => void;
};

export function useFloorPlanZoomViewport({
  viewportRef,
  zoom,
  onZoomChange,
}: FloorPlanZoomViewportOptions) {
  const zoomRef = useRef(zoom);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  /**
   * Applies a zoom while keeping the plan point under `focus` (or the centre of
   * the viewport) pinned to the same screen position — without it, zooming in
   * on a table sends it off-screen.
   */
  const applyZoom = useCallback((nextZoom: number, focus?: { clientX: number; clientY: number }) => {
    const target = clampFloorPlanZoom(nextZoom);
    const current = zoomRef.current;
    if (target === current) return;

    const viewport = viewportRef.current;
    if (viewport) {
      const bounds = viewport.getBoundingClientRect();
      const focusX = focus ? focus.clientX - bounds.left : viewport.clientWidth / 2;
      const focusY = focus ? focus.clientY - bounds.top : viewport.clientHeight / 2;
      const ratio = target / current;
      const nextLeft = (viewport.scrollLeft + focusX) * ratio - focusX;
      const nextTop = (viewport.scrollTop + focusY) * ratio - focusY;

      // The scroll range only grows once React has laid the rescaled stage out;
      // scrolling synchronously would be clamped against the previous extent.
      window.requestAnimationFrame(() => {
        viewport.scrollLeft = nextLeft;
        viewport.scrollTop = nextTop;
      });
    }

    zoomRef.current = target;
    onZoomChange(target);
  }, [onZoomChange, viewportRef]);

  const zoomIn = useCallback(() => applyZoom(zoomRef.current * FLOOR_PLAN_ZOOM_FACTOR), [applyZoom]);
  const zoomOut = useCallback(() => applyZoom(zoomRef.current / FLOOR_PLAN_ZOOM_FACTOR), [applyZoom]);

  /** Back to "the whole room fits the viewport", which is what zoom 1 means. */
  const resetZoom = useCallback(() => {
    applyZoom(1);
    const viewport = viewportRef.current;
    if (!viewport) return;
    window.requestAnimationFrame(() => {
      viewport.scrollLeft = 0;
      viewport.scrollTop = 0;
    });
  }, [applyZoom, viewportRef]);

  const recenter = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const left = Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2);
    const top = Math.max(0, (viewport.scrollHeight - viewport.clientHeight) / 2);
    if (typeof viewport.scrollTo === "function") {
      viewport.scrollTo({ left, top, behavior: "smooth" });
      return;
    }
    viewport.scrollLeft = left;
    viewport.scrollTop = top;
  }, [viewportRef]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;

    // React registers `wheel` passively on the root, so an onWheel handler can
    // never call preventDefault: ctrl+wheel used to zoom the browser page
    // instead of the plan. A native non-passive listener is the only way.
    const handleWheel = (event: WheelEvent) => {
      // Plain wheel keeps scrolling the plan; ctrl/meta (and every trackpad
      // pinch, which browsers report as ctrl+wheel) zooms it.
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      applyZoom(zoomRef.current * Math.exp(-event.deltaY * 0.002), event);
    };

    viewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleWheel);
  }, [applyZoom, viewportRef]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;

    // Two-finger pinch. Touch events rather than pointer events on purpose:
    // dragging an object already owns the single-pointer stream, and reacting
    // only to `touches.length === 2` keeps the two gestures from fighting.
    let startDistance = 0;
    let startZoom = 1;

    const getTouchDistance = (touches: TouchList) => {
      const [first, second] = [touches[0], touches[1]];
      return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
    };

    const getTouchCenter = (touches: TouchList) => ({
      clientX: (touches[0].clientX + touches[1].clientX) / 2,
      clientY: (touches[0].clientY + touches[1].clientY) / 2,
    });

    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 2) return;
      startDistance = getTouchDistance(event.touches);
      startZoom = zoomRef.current;
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (event.touches.length !== 2 || startDistance <= 0) return;
      event.preventDefault();
      const distance = getTouchDistance(event.touches);
      applyZoom(startZoom * (distance / startDistance), getTouchCenter(event.touches));
    };

    const handleTouchEnd = (event: TouchEvent) => {
      if (event.touches.length < 2) startDistance = 0;
    };

    viewport.addEventListener("touchstart", handleTouchStart, { passive: true });
    viewport.addEventListener("touchmove", handleTouchMove, { passive: false });
    viewport.addEventListener("touchend", handleTouchEnd, { passive: true });
    viewport.addEventListener("touchcancel", handleTouchEnd, { passive: true });

    return () => {
      viewport.removeEventListener("touchstart", handleTouchStart);
      viewport.removeEventListener("touchmove", handleTouchMove);
      viewport.removeEventListener("touchend", handleTouchEnd);
      viewport.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [applyZoom, viewportRef]);

  return { applyZoom, zoomIn, zoomOut, resetZoom, recenter };
}
