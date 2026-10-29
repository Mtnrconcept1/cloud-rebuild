import { useEffect, useRef, useState } from "react";
import { useTokLogoSrc } from "@/hooks/useTokLogo";
import { createTokSaturnScene } from "@/lib/tokSaturnScene";
import { cn } from "@/lib/utils";
import "./tok-saturn-loader.css";

type TokSaturnLoaderProps = {
  size?: "sm" | "md" | "lg";
  active?: boolean;
  className?: string;
};

export default function TokSaturnLoader({
  size = "md",
  active = true,
  className,
}: TokSaturnLoaderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [webglReady, setWebglReady] = useState(false);
  const logoSrc = useTokLogoSrc();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !active || size === "sm") return;
    const reduceMotion = typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : { matches: false };
    if (reduceMotion.matches) return;

    let disposed = false;
    let visible = true;
    let frameId = 0;
    let previousFrame = 0;
    let elapsed = 0;
    const scene = createTokSaturnScene(canvas, logoSrc, () => {
      if (!disposed) setWebglReady(true);
    });
    if (!scene) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      const width = Math.max(1, Math.round(rect.width * ratio));
      const height = Math.max(1, Math.round(rect.height * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
    };
    const onContextLost = (event: Event) => {
      event.preventDefault();
      setWebglReady(false);
      visible = false;
    };
    const onVisibilityChange = () => { previousFrame = 0; };
    const observer = typeof IntersectionObserver === "undefined"
      ? null
      : new IntersectionObserver(([entry]) => {
          visible = entry.isIntersecting;
          previousFrame = 0;
        }, { threshold: 0.01 });
    observer?.observe(canvas);
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    resizeObserver?.observe(canvas);
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVisibilityChange);
    canvas.addEventListener("webglcontextlost", onContextLost);

    const tick = (now: number) => {
      if (disposed) return;
      if (!document.hidden && visible && !reduceMotion.matches) {
        if (!previousFrame || now - previousFrame >= 1000 / 35) {
          elapsed += previousFrame ? Math.min((now - previousFrame) / 1000, 0.085) : 0;
          previousFrame = now;
          resize();
          scene.render(elapsed);
        }
      } else {
        previousFrame = 0;
      }
      frameId = requestAnimationFrame(tick);
    };
    resize();
    frameId = requestAnimationFrame(tick);
    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      observer?.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      scene.dispose();
    };
  }, [active, logoSrc, size]);

  return (
    <div
      className={cn("tok-saturn", `tok-saturn--${size}`, !active && "tok-saturn--paused", className)}
      data-testid="tok-saturn-loader"
      data-gpu-ready={webglReady && active && size !== "sm" ? "true" : "false"}
      aria-hidden="true"
    >
      <div className="tok-saturn__glow" />
      <canvas
        ref={canvasRef}
        className="tok-saturn__canvas"
        style={{ opacity: webglReady && active && size !== "sm" ? 1 : 0 }}
      />
      <div className="tok-saturn__fallback" style={{ opacity: webglReady && active && size !== "sm" ? 0 : 1 }}>
        <span className="tok-saturn__ring tok-saturn__ring--one" />
        <span className="tok-saturn__ring tok-saturn__ring--two" />
        <span className="tok-saturn__coin">
          <span className="tok-saturn__back" />
          <img className="tok-saturn__front" src={logoSrc} alt="" decoding="async" draggable={false} />
        </span>
        <span className="tok-saturn__flare tok-saturn__flare--one" />
        <span className="tok-saturn__flare tok-saturn__flare--two" />
      </div>
    </div>
  );
}