import { useEffect, useRef, useState } from "react";

const MOBILE_BREAKPOINT = 768;
const LOGO_INTRO_VIDEO_SRC = "/higgsfield/hf_20260518_042910_98da3ceb-a1f6-403f-b859-02b809cb2624.mp4";

function isMobileViewport() {
  if (typeof window === "undefined") return false;

  return window.innerWidth < MOBILE_BREAKPOINT;
}

export default function MobileLogoIntro() {
  const [visible, setVisible] = useState(() => isMobileViewport());
  const [fadingOut, setFadingOut] = useState(false);
  const endedRef = useRef(false);

  useEffect(() => {
    const onResize = () => {
      if (!endedRef.current) {
        setVisible(isMobileViewport());
      }
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!visible) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
      className={[
        "fixed inset-0 z-[9999] flex items-center justify-center bg-black transition-opacity duration-700 ease-out",
        fadingOut ? "opacity-0" : "opacity-100",
      ].join(" ")}
      data-testid="mobile-logo-intro"
      onTransitionEnd={() => {
        if (fadingOut) {
          setVisible(false);
        }
      }}
    >
      <div
        className="relative w-screen max-h-dvh overflow-hidden"
        data-testid="mobile-logo-intro-video-frame"
      >
        <video
          autoPlay
          className="block w-full h-auto max-h-dvh object-contain pointer-events-none select-none"
          controls={false}
          controlsList="nodownload nofullscreen noplaybackrate noremoteplayback"
          data-testid="mobile-logo-intro-video"
          disablePictureInPicture
          disableRemotePlayback
          muted
          onContextMenu={(event) => event.preventDefault()}
          onEnded={() => {
            endedRef.current = true;
            setFadingOut(true);
          }}
          onPause={(event) => {
            if (!endedRef.current && !event.currentTarget.ended) {
              void event.currentTarget.play().catch(() => undefined);
            }
          }}
          playsInline
          preload="auto"
          src={LOGO_INTRO_VIDEO_SRC}
        />
        <div
          className="pointer-events-none absolute inset-0"
          data-testid="mobile-logo-intro-vignette"
          style={{
            background:
              "linear-gradient(180deg, rgba(0, 0, 0, 0.64) 0%, rgba(0,0,0,0) 18%, rgba(0,0,0,0) 82%, rgba(0,0,0,0.64) 100%)",
          }}
        />
      </div>
    </div>
  );
}
