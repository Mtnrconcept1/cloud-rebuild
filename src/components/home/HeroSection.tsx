import { useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { Star, Timer, Store, Bike, Trophy, ArrowRight } from "lucide-react";

export default function HeroSection() {
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const scrolled = window.scrollY;
          if (scrolled < 800) {
            heroRef.current?.style.setProperty("--scroll-y", `${scrolled}px`);
          }
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <section ref={heroRef} className="relative overflow-hidden border-b">
      <div
        className="absolute inset-0 bg-[url('/fond4.png')] bg-cover bg-center blur-[0.7px] will-change-transform"
        style={{ transform: "translateY(calc(var(--scroll-y, 0px) * 0.4))" }}
        aria-hidden="true"
      />
      <div
        className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] md:w-[600px] md:h-[600px] bg-white/80 blur-[30px] rounded-full pointer-events-none will-change-transform"
        style={{ transform: "translate(calc(-50% + var(--scroll-y, 0px) * -0.1), calc(-50% + var(--scroll-y, 0px) * 0.2))" }}
      />
      <div className="absolute inset-0 shadow-[inset_0_0_120px_rgba(0,0,0,0.10)] pointer-events-none" />

      <div
        className="container relative px-4 py-14 md:py-20 flex flex-col items-center text-center space-y-6 md:space-y-8 will-change-transform"
        style={{ transform: "translateY(calc(var(--scroll-y, 0px) * -0.15))" }}
      >
        <img src="/logo.png" alt="Deliveroom" className="h-28 sm:h-36 md:h-48 w-auto object-contain drop-shadow-lg" />

        <div className="space-y-4 max-w-3xl">
          <h1 className="font-display text-3xl sm:text-5xl md:text-6xl font-bold tracking-tight text-foreground leading-[0.8] flex flex-wrap items-center justify-center gap-x-2">
            <span className="newspaper-snippet">Commandez malin,</span>
            <span className="text-primary italic">mangez bien.</span>
          </h1>
          <p className="text-base sm:text-lg md:text-xl text max-w-2xl mx-auto leading-relaxed">
            Le réflexe food... simple, rentable, solidaire !
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-3 pt-2">
          {[
            { icon: Star, label: "4.8/5" },
            { icon: Timer, label: "Dès 25 min" },
            { icon: Store, label: "Restaurants partenaires" },
          ].map((b) => {
            const Icon = b.icon;
            return (
              <div key={b.label} className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/75 backdrop-blur-md border border-white/70 shadow-[0_10px_25px_rgba(0,0,0,0.10)]">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-primary/12">
                  <Icon className="h-4 w-4 text-primary" />
                </span>
                <span className="text-sm font-semibold text-foreground/75">{b.label}</span>
              </div>
            );
          })}
        </div>

        <div className="w-full max-w-md sm:max-w-lg pt-2 flex flex-col items-center gap-3">
          <Link to="/recherche" className="group relative w-full overflow-hidden rounded-full bg-gradient-to-b from-primary to-primary/90 px-8 py-4 text-white font-semibold text-base shadow-[0_16px_40px_rgba(0,0,0,0.18)] transition hover:translate-y-[-1px] hover:shadow-[0_22px_55px_rgba(0,0,0,0.22)] focus:outline-none focus:ring-2 focus:ring-primary/40">
            <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(255,255,255,0.35),_transparent_55%)] opacity-60" />
            <span className="relative flex items-center justify-center gap-3">
              Explorer les restaurants
              <span className="inline-flex items-center justify-center rounded-full bg-white/15 p-1">
                <ArrowRight className="h-5 w-5 transition group-hover:translate-x-0.5" />
              </span>
            </span>
          </Link>
          <Link to="/ventes-flash" className="w-full rounded-full px-8 py-4 text-foreground/90 font-semibold text-base bg-white/50 backdrop-blur-md border border-white/40 shadow-[0_14px_35px_rgba(0,0,0,0.10)] transition hover:bg-white/35 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20">
            Voir les offres du jour
          </Link>
          <Link to="/recherche?mode=reservation" className="w-full rounded-full px-8 py-4 text-foreground/80 font-semibold text-base bg-white/50 backdrop-blur-sm border border-white/20 shadow-[0_8px_25px_rgba(0,0,0,0.05)] transition hover:bg-white/20 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/10">
            Réserver une table
          </Link>
        </div>

        <div className="flex flex-wrap justify-center gap-3 pt-2">
          {[
            { icon: Bike, label: "Livraison rapide", color: "text-primary" },
            { icon: Trophy, label: "Programme fidélité", color: "text-amber-500" },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/80 backdrop-blur-sm border border-white shadow-sm">
              <item.icon className={`h-4 w-4 ${item.color}`} />
              <span className="text-sm font-semibold text-foreground">{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
