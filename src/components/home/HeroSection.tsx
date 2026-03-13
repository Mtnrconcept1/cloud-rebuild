import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Bike, Star, Store, Timer, Trophy } from "lucide-react";

export default function HeroSection() {
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let ticking = false;

    const handleScroll = () => {
      if (ticking) return;

      window.requestAnimationFrame(() => {
        const scrolled = window.scrollY;
        if (scrolled < 800) {
          heroRef.current?.style.setProperty("--scroll-y", `${scrolled}px`);
        }
        ticking = false;
      });

      ticking = true;
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <section ref={heroRef} className="relative overflow-hidden border-b dark:border-white/10">
      <div
        className="absolute inset-0 bg-[url('/fond3.png')] -translate-y-1/2 bg-cover bg-center opacity-95 dark:opacity-40 blur-[1.7px] will-change-transform"
        style={{ transform: "translateY(calc(var(--scroll-y, 0px) * 0.4))" }}
        aria-hidden="true"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-white/15 via-transparent to-white/70 dark:from-slate-950/20 dark:via-slate-950/46 dark:to-slate-950/90 pointer-events-none" />
      <div
        className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[350px] w-[350px] rounded-full bg-white/70 dark:bg-primary/15 blur-[20px] pointer-events-none will-change-transform md:h-[600px] md:w-[600px]"
        style={{ transform: "translate(calc(-50% + var(--scroll-y, 0px) * -0.1), calc(-50% + var(--scroll-y, 0px) * 0.2))" }}
      />
      <div className="absolute inset-0 shadow-[inset_0_0_120px_rgba(0,0,0,0.10)] dark:shadow-[inset_0_0_180px_rgba(2,6,23,0.82)] pointer-events-none" />

      <div
        className="container relative flex flex-col items-center space-y-9 px-4 py-14 text-center will-change-transform md:space-y-24 md:py-20"
        style={{ transform: "translateY(calc(var(--scroll-y, 0px) * -0.15))" }}
      >
        <img src="/logo.png" alt="Deliveroom" className="h-28 w-auto object-contain drop-shadow-lg sm:h-36 md:h-48" />

        <div className="max-w-3xl space-y-4">
          <h1 className="font-display flex flex-wrap items-center justify-center gap-x-2 text-3xl font-bold leading-[0.8] tracking-tight text-foreground sm:text-5xl md:text-6xl">
            <span className="newspaper-snippet">Commandez malin,</span>
            <span className="italic text-primary">mangez bien.</span>
          </h1>
          <p className="mx-auto max-w-2xl font-extrabold text-base leading-relaxed text-muted-foreground sm:text-lg md:text-xl">
            Le reflexe food... simple, rentable, solidaire !
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-3 pt-2">
          {[
            { icon: Star, label: "4.8/5" },
            { icon: Timer, label: "Des 25 min" },
            { icon: Store, label: "Restaurants partenaires" },
          ].map((badge) => {
            const Icon = badge.icon;
            return (
              <div
                key={badge.label}
                className="flex items-center gap-2 rounded-full border border-white/70 bg-white/75 px-4 py-2 shadow-[0_10px_25px_rgba(0,0,0,0.10)] backdrop-blur-md dark:border-white/12 dark:bg-slate-950/72 dark:shadow-[0_16px_35px_rgba(0,0,0,0.38)]"
              >
                <span className="grid h-7 w-7 place-items-center rounded-full bg-primary/12 dark:bg-primary/18">
                  <Icon className="h-4 w-4 text-primary" />
                </span>
                <span className="text-sm font-semibold text-foreground/80 dark:text-foreground/92">{badge.label}</span>
              </div>
            );
          })}
        </div>

        <div className="flex w-full max-w-md flex-col items-center gap-3 pt-2 sm:max-w-lg">
          <Link
            to="/recherche"
            className="group relative w-full overflow-hidden rounded-full bg-gradient-to-b from-primary to-primary/90 px-8 py-4 text-base font-semibold text-white shadow-[0_16px_40px_rgba(0,0,0,0.18)] transition hover:-translate-y-[1px] hover:shadow-[0_22px_55px_rgba(0,0,0,0.22)] focus:outline-none focus:ring-2 focus:ring-primary/40 dark:shadow-[0_22px_50px_rgba(249,115,22,0.20)]"
          >
            <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(255,255,255,0.35),_transparent_55%)] opacity-60" />
            <span className="relative flex items-center justify-center gap-3">
              Explorer les restaurants
              <span className="inline-flex items-center justify-center rounded-full bg-white/15 p-1">
                <ArrowRight className="h-5 w-5 transition group-hover:translate-x-0.5" />
              </span>
            </span>
          </Link>
          <Link
            to="/ventes-flash"
            className="w-full rounded-full border border-white/40 bg-white/50 px-8 py-4 text-base font-semibold text-foreground/90 shadow-[0_14px_35px_rgba(0,0,0,0.10)] backdrop-blur-md transition hover:bg-white/35 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20 dark:border-white/12 dark:bg-slate-950/68 dark:text-foreground dark:shadow-[0_18px_38px_rgba(0,0,0,0.36)] dark:hover:bg-slate-900/78"
          >
            Voir les offres du jour
          </Link>
          <Link
            to="/recherche?mode=reservation"
            className="w-full rounded-full border border-white/20 bg-white/50 px-8 py-4 text-base font-semibold text-foreground/80 shadow-[0_8px_25px_rgba(0,0,0,0.05)] backdrop-blur-sm transition hover:bg-white/20 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/10 dark:border-white/10 dark:bg-slate-950/60 dark:text-foreground/92 dark:shadow-[0_14px_32px_rgba(0,0,0,0.32)] dark:hover:bg-slate-900/75"
          >
            Reserver une table
          </Link>
        </div>

        <div className="flex flex-wrap justify-center gap-3 pt-2">
          {[
            { icon: Bike, label: "Livraison rapide", color: "text-primary" },
            { icon: Trophy, label: "Programme fidelite", color: "text-amber-500" },
          ].map((item) => (
            <div
              key={item.label}
              className="flex items-center gap-2 rounded-full border border-white bg-white/80 px-4 py-2 shadow-sm backdrop-blur-sm dark:border-white/10 dark:bg-slate-950/72 dark:shadow-[0_12px_28px_rgba(0,0,0,0.34)]"
            >
              <item.icon className={`h-4 w-4 ${item.color}`} />
              <span className="text-sm font-semibold text-foreground dark:text-foreground/92">{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
