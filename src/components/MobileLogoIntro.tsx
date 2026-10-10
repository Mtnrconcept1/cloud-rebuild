import { useRef, useState } from "react";
import { Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";

// Playback is optional: discovery remains available as soon as the page loads.
export default function MobileLogoIntro() {
  const [playing, setPlaying] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const mobile = typeof window !== "undefined" && window.innerWidth < 768;
  if (typeof window === "undefined" || window.location.pathname !== "/" || dismissed) return null;

  const close = () => {
    setPlaying(false);
    triggerRef.current?.focus();
  };

  return (
    <aside aria-label="Découvrir TOK en vidéo" className="mx-auto flex w-full max-w-7xl flex-col items-end px-4" data-testid="mobile-logo-intro" onKeyDown={(event) => { if (playing && event.key === "Escape") close(); }}>
      {playing ? (
        <div className="mb-3 w-64 overflow-hidden rounded-2xl border border-border bg-card p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">L’univers TOK</p>
            <Button size="icon" variant="ghost" aria-label="Fermer la vidéo TOK" onClick={close}><X aria-hidden="true" /></Button>
          </div>
          <video autoPlay controls playsInline preload="none" className="max-h-64 w-full rounded-xl bg-black object-contain" poster={`/higgsfield/tok-intro-${mobile ? "mobile" : "desktop"}-poster.webp`} data-testid="mobile-logo-intro-video" onEnded={close} onError={close}>
            <source src={`/higgsfield/tok-intro-${mobile ? "mobile" : "desktop"}.mp4`} type="video/mp4" />
          </video>
        </div>
      ) : null}
      <div className="flex items-center gap-1">
        <Button ref={triggerRef} variant="ghost" className="rounded-full px-3 text-xs" aria-expanded={playing} onClick={() => setPlaying(!playing)}><Play aria-hidden="true" className="h-3.5 w-3.5" />Découvrir TOK</Button>
        <Button variant="ghost" size="icon" className="rounded-full" aria-label="Masquer l’invitation vidéo TOK" onClick={() => setDismissed(true)}><X aria-hidden="true" className="h-4 w-4" /></Button>
      </div>
    </aside>
  );
}
