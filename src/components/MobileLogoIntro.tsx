import { useEffect, useRef, useState } from "react";

const MOBILE_BREAKPOINT = 768;
const LOGO_INTRO_IMAGE_SRC = "/logo.png";
const LOGO_INTRO_VISIBLE_MS = 900;
const LOGO_INTRO_FADE_MS = 700;
const LOGO_INTRO_DISMISS_FALLBACK_MS = LOGO_INTRO_FADE_MS + 100;

function isMobileViewport() {
  if (typeof window === "undefined") return false;

  return window.innerWidth < MOBILE_BREAKPOINT;
}

function isHomePath() {
  if (typeof window === "undefined") return false;

  return window.location.pathname === "/";
}

function shouldShowIntro() {
  return isMobileViewport() && isHomePath();
}

export default function MobileLogoIntro() {
  const [visible, setVisible] = useState(() => shouldShowIntro());
  const [fadingOut, setFadingOut] = useState(false);
  const dismissedRef = useRef(false);

  useEffect(() => {
    const onResize = () => {
      if (!dismissedRef.current) {
        setVisible(shouldShowIntro());
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

  useEffect(() => {
    if (!visible) return;

    const timeoutId = window.setTimeout(() => {
      setFadingOut(true);
    }, LOGO_INTRO_VISIBLE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [visible]);

  useEffect(() => {
    if (!visible || !fadingOut) return;

    const timeoutId = window.setTimeout(() => {
      dismissedRef.current = true;
      setVisible(false);
    }, LOGO_INTRO_DISMISS_FALLBACK_MS);

    return () => window.clearTimeout(timeoutId);
  }, [visible, fadingOut]);

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
          dismissedRef.current = true;
          setVisible(false);
        }
      }}
    >
      <div
        className="relative grid h-dvh w-screen place-items-center overflow-hidden"
        data-testid="mobile-logo-intro-logo-frame"
      >
        <img
          alt=""
          className="h-40 w-40 object-contain drop-shadow-[0_18px_44px_rgba(255,107,28,0.36)]"
          data-testid="mobile-logo-intro-logo"
          decoding="async"
          src={LOGO_INTRO_IMAGE_SRC}
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
