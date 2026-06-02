import { useEffect, useRef } from "react";

import { TURNSTILE_SITE_KEY } from "@/lib/captcha";

const TURNSTILE_SCRIPT_ID = "cloudflare-turnstile-script";

type TurnstileWindow = Window & {
  turnstile?: {
    render: (
      container: HTMLElement,
      options: {
        sitekey: string;
        action?: string;
        callback?: (token: string) => void;
        "expired-callback"?: () => void;
        "error-callback"?: () => void;
      },
    ) => string;
    remove: (widgetId: string) => void;
  };
};

function ensureTurnstileScript() {
  if (document.getElementById(TURNSTILE_SCRIPT_ID)) return;

  const script = document.createElement("script");
  script.id = TURNSTILE_SCRIPT_ID;
  script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);
}

export default function TurnstileCaptcha({
  action,
  onTokenChange,
}: {
  action: string;
  onTokenChange: (token: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) {
      onTokenChange(null);
      return;
    }

    ensureTurnstileScript();
    let widgetId: string | null = null;
    let cancelled = false;

    const render = () => {
      const turnstile = (window as TurnstileWindow).turnstile;
      if (cancelled || widgetId || !turnstile || !containerRef.current) return;

      widgetId = turnstile.render(containerRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        action,
        callback: (token) => onTokenChange(token || null),
        "expired-callback": () => onTokenChange(null),
        "error-callback": () => onTokenChange(null),
      });
    };

    render();
    const timer = window.setInterval(render, 250);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      onTokenChange(null);
      if (widgetId && (window as TurnstileWindow).turnstile) {
        (window as TurnstileWindow).turnstile?.remove(widgetId);
      }
    };
  }, [action, onTokenChange]);

  if (!TURNSTILE_SITE_KEY) return null;

  return <div ref={containerRef} className="min-h-[65px]" />;
}
