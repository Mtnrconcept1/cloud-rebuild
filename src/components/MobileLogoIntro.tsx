import { useCallback, useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";

const MOBILE_BREAKPOINT = 768;
const LOGO_INTRO_VERSION = "2026-06-action-first";
const LOGO_INTRO_STORAGE_KEY = `tok-logo-intro:${LOGO_INTRO_VERSION}`;
const LOGO_INTRO_VISIBLE_MS = 650;
const LOGO_INTRO_FADE_MS = 180;
const LOGO_INTRO_DISMISS_FALLBACK_MS = LOGO_INTRO_FADE_MS + 80;

type IntroVariant = "mobile" | "desktop";

const LOGO_INTRO_MEDIA: Record<IntroVariant, {
  src: string;
  poster: string;
  width: number;
  height: number;
}> = {
  mobile: {
    src: "/higgsfield/tok-intro-mobile.mp4",
    poster: "/higgsfield/tok-intro-mobile-poster.webp",
    width: 1080,
    height: 1920,
  },
  desktop: {
    src: "/higgsfield/tok-intro-desktop.mp4",
    poster: "/higgsfield/tok-intro-desktop-poster.webp",
    width: 1920,
    height: 1080,
  },
};

function getIntroVariant(): IntroVariant {
  if (typeof window === "undefined") return "mobile";

  return window.innerWidth < MOBILE_BREAKPOINT ? "mobile" : "desktop";
}

function isHomePath() {
  if (typeof window === "undefined") return false;

  return window.location.pathname === "/";
}

function shouldShowIntro() {
  if (!isHomePath() || typeof window === "undefined") return false;

  try {
    return window.localStorage.getItem(LOGO_INTRO_STORAGE_KEY) !== "seen";
  } catch {
    return true;
  }
}

function markIntroSeen() {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(LOGO_INTRO_STORAGE_KEY, "seen");
  } catch {
    // Storage can be unavailable in private modes; the timed intro still remains short.
  }
}

export default function MobileLogoIntro() {
  const [visible, setVisible] = useState(() => shouldShowIntro());
  const [variant, setVariant] = useState<IntroVariant>(() => getIntroVariant());
  const [fadingOut, setFadingOut] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const dismissedRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const completeDismiss = useCallback(() => {
    dismissedRef.current = true;
    markIntroSeen();
    setVisible(false);
  }, []);

  useEffect(() => {
    const onResize = () => {
      setVariant(getIntroVariant());
      if (!dismissedRef.current) {
        setVisible(shouldShowIntro());
      }
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

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
      completeDismiss();
    }, LOGO_INTRO_DISMISS_FALLBACK_MS);

    return () => window.clearTimeout(timeoutId);
  }, [completeDismiss, visible, fadingOut]);

  useEffect(() => {
    if (!visible) return;

    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    video.muted = true;
    video.volume = 0;
    setSoundEnabled(false);
    setSoundBlocked(false);

    try {
      const playAttempt = video.play();
      if (playAttempt && typeof playAttempt.catch === "function") {
        void playAttempt.catch(() => undefined);
      }
    } catch {
      // The timed fade still removes the overlay if media playback is unavailable.
    }

    return () => {
      cancelled = true;
    };
  }, [visible, variant]);

  if (!visible) return null;

  const introMedia = LOGO_INTRO_MEDIA[variant];
  const SoundIcon = soundEnabled ? Volume2 : VolumeX;
  const soundButtonLabel = soundEnabled
    ? "Couper le son de l'intro TOK"
    : "Activer le son de l'intro TOK";
  const soundButtonText = soundBlocked
    ? "Réessayer le son"
    : soundEnabled
      ? "Son activé"
      : "Activer le son";

  const handleSoundToggle = async () => {
    const video = videoRef.current;
    if (!video) return;

    if (soundEnabled) {
      video.muted = true;
      setSoundEnabled(false);
      setSoundBlocked(false);
      return;
    }

    video.muted = false;
    video.volume = 1;
    setSoundBlocked(false);

    try {
      await video.play();
      setSoundEnabled(true);
    } catch {
      video.muted = true;
      setSoundEnabled(false);
      setSoundBlocked(true);
    }
  };

  return (
    <div
      aria-label="Intro TOK"
      className={[
        "pointer-events-none fixed inset-0 z-[9999] flex items-center justify-center bg-black transition-opacity ease-out",
        fadingOut ? "opacity-0" : "opacity-100",
      ].join(" ")}
      data-testid="mobile-logo-intro"
      style={{ transitionDuration: `${LOGO_INTRO_FADE_MS}ms` }}
      onTransitionEnd={(event) => {
        if (event.currentTarget !== event.target) return;

        if (fadingOut) {
          completeDismiss();
        }
      }}
    >
      <div
        className="relative grid h-dvh w-screen place-items-center overflow-hidden"
        data-testid="mobile-logo-intro-logo-frame"
      >
        <video
          autoPlay
          className="h-full w-full bg-black object-cover"
          data-intro-variant={variant}
          data-testid="mobile-logo-intro-video"
          height={introMedia.height}
          key={introMedia.src}
          muted={!soundEnabled}
          playsInline
          poster={introMedia.poster}
          preload="metadata"
          ref={videoRef}
          onEnded={() => setFadingOut(true)}
          onError={() => setFadingOut(true)}
          width={introMedia.width}
        >
          <source src={introMedia.src} type="video/mp4" />
        </video>
        <div
          className="pointer-events-none absolute inset-0"
          data-testid="mobile-logo-intro-vignette"
          style={{
            background:
              "linear-gradient(180deg, rgba(0, 0, 0, 0.64) 0%, rgba(0,0,0,0) 18%, rgba(0,0,0,0) 82%, rgba(0,0,0,0.64) 100%)",
          }}
        />
        <button
          className="pointer-events-auto absolute right-5 top-5 z-10 inline-flex h-10 items-center rounded-full border border-white/20 bg-black/62 px-4 text-sm font-semibold text-white shadow-2xl backdrop-blur-md transition hover:bg-black/78 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 md:right-8 md:top-8"
          data-testid="mobile-logo-intro-skip"
          type="button"
          onClick={() => setFadingOut(true)}
        >
          Passer
        </button>
        <button
          aria-label={soundButtonLabel}
          className="pointer-events-auto absolute bottom-5 right-5 z-10 inline-flex h-11 items-center gap-2 rounded-full border border-white/20 bg-black/62 px-4 text-sm font-semibold text-white shadow-2xl backdrop-blur-md transition hover:bg-black/78 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 md:bottom-8 md:right-8"
          data-testid="mobile-logo-intro-sound-toggle"
          type="button"
          onClick={handleSoundToggle}
        >
          <SoundIcon aria-hidden="true" className="h-4 w-4" />
          <span>{soundButtonText}</span>
        </button>
      </div>
    </div>
  );
}
