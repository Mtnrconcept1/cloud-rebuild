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
        className="absolute inset-[-8%] bg-[url('/fond4.png')] md:bg-[url('/fond3.png')] bg-contain bg-center opacity-90 dark:opacity-22 blur-[0px] will-change-transform [--hero-bg-scale:1.] md:[--hero-bg-scale:1.1]"
        style={{ transform: "translateY(calc(-5% + var(--scroll-y, 0px) * 0.4)) scale(var(--hero-bg-scale))" }}
        aria-hidden="true"
      />

      <div className="absolute inset-0 bg-white/59 dark:bg-slate-950/58 pointer-events-none" />

      <div className="absolute inset-0 bg-gradient-to-b from-white/5 via-white/3 to-white/9 dark:from-slate-950/8 dark:via-slate-950/2 dark:to-slate-950/92 pointer-events-none" />

      <div
        className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[350px] w-[350px] rounded-full bg-white/45 dark:bg-primary/10 blur-[22px] pointer-events-none will-change-transform md:h-[600px] md:w-[600px]"
        style={{ transform: "translate(calc(-50% + var(--scroll-y, 0px) * -0.1), calc(-50% + var(--scroll-y, 0px) * 0.2))" }}
      />

      <div className="absolute inset-0 shadow-[inset_0_0_150px_rgba(0,0,0,0.14)] dark:shadow-[inset_0_0_220px_rgba(2,6,23,0.88)] pointer-events-none" />

      <div
        className="container relative flex flex-col items-center space-y-9 px-4 py-14 text-center will-change-transform md:space-y-24 md:py-20"
        style={{ transform: "translateY(calc(var(--scroll-y, 0px) * -0.15))" }}
      >
        <img
          src="/logo.png"
          alt="Deliveroom"
          className="h-28 w-auto object-contain drop-shadow-[0_10px_25px_rgba(0,0,0,0.22)] sm:h-36 md:h-48"
        />

        <div className="max-w-3xl space-y-4">
          <h1 className="font-display flex flex-wrap items-center justify-center gap-x-2 text-3xl font-bold leading-[0.8] tracking-tight text-foreground drop-shadow-[0_2px_10px_rgba(255,255,255,0.22)] dark:drop-shadow-[0_4px_14px_rgba(0,0,0,0.55)] sm:text-5xl md:text-6xl">
            <span className="newspaper-snippet">Commandez malin,</span>
            <span className="italic text-primary">mangez bien.</span>
          </h1>
          <p className="mx-auto max-w-2xl text-base font-extrabold leading-relaxed text-foreground/80 dark:text-foreground/88 sm:text-lg md:text-xl">
            Le reflexe food... simple, rentable, solidaire !
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-3 pt-2">
          {[
            { icon: Star, label: "4.8/5", mobileOnly: false },
            { icon: Timer, label: "Des 25 min", mobileOnly: false },
            { icon: Store, label: "Restaurants partenaires", mobileOnly: true },
          ].map((badge) => {
            const Icon = badge.icon;
            return (
              <div
                key={badge.label}
                className={`${badge.mobileOnly ? "hidden md:flex" : "flex"} items-center gap-2 rounded-full border border-white/90 bg-white/90 px-4 py-2 shadow-[0_12px_30px_rgba(0,0,0,0.12)] backdrop-blur-lg dark:border-white/14 dark:bg-slate-950/82 dark:shadow-[0_18px_36px_rgba(0,0,0,0.42)]`}
              >
                <span className="grid h-7 w-7 place-items-center rounded-full bg-primary/14 dark:bg-primary/20">
                  <Icon className="h-4 w-4 text-primary" />
                </span>
                <span className="text-sm font-semibold text-foreground/90 dark:text-foreground">{badge.label}</span>
              </div>
            );
          })}
        </div>

        <div className="flex w-full max-w-[45%] flex-col items-center gap-3 self-end pt-2 md:max-w-lg md:self-center">
          <Link
            to="/recherche"
            className="group relative w-full overflow-hidden rounded-full bg-gradient-to-b from-primary to-primary/90 px-6 py-3.5 text-sm font-semibold text-white shadow-[0_18px_42px_rgba(0,0,0,0.22)] transition hover:-translate-y-[1px] hover:shadow-[0_24px_58px_rgba(0,0,0,0.28)] focus:outline-none focus:ring-2 focus:ring-primary/40 dark:shadow-[0_22px_50px_rgba(249,115,22,0.22)] md:px-8 md:py-4 md:text-base"
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
            className="w-full rounded-full border border-white/70 bg-white/82 px-6 py-3.5 text-sm font-semibold text-foreground shadow-[0_14px_35px_rgba(0,0,0,0.12)] backdrop-blur-lg transition hover:bg-white/92 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20 dark:border-white/14 dark:bg-slate-950/80 dark:text-foreground dark:shadow-[0_18px_38px_rgba(0,0,0,0.40)] dark:hover:bg-slate-900/88 md:px-8 md:py-4 md:text-base"
          >
            Voir les offres du jour
          </Link>

          <Link
            to="/recherche?mode=reservation"
            className="w-full rounded-full border border-white/60 bg-white/74 px-6 py-3.5 text-sm font-semibold text-foreground/90 shadow-[0_10px_28px_rgba(0,0,0,0.09)] backdrop-blur-md transition hover:bg-white/88 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/10 dark:border-white/12 dark:bg-slate-950/74 dark:text-foreground/96 dark:shadow-[0_14px_32px_rgba(0,0,0,0.36)] dark:hover:bg-slate-900/82 md:px-8 md:py-4 md:text-base"
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
              className="flex items-center gap-2 rounded-full border border-white/85 bg-white/88 px-4 py-2 shadow-[0_10px_24px_rgba(0,0,0,0.10)] backdrop-blur-md dark:border-white/12 dark:bg-slate-950/80 dark:shadow-[0_12px_28px_rgba(0,0,0,0.38)]"
            >
              <item.icon className={`h-4 w-4 ${item.color}`} />
              <span className="text-sm font-semibold text-foreground dark:text-foreground/96">{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}