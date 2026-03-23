import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Bike, Star, Store, Timer, Trophy } from "lucide-react";

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } },
};

const bounceUp = {
  hidden: { opacity: 0, y: 60, scale: 0.3 },
  visible: {
    opacity: 1, y: 0, scale: 1,
    transition: { type: "spring" as const, stiffness: 180, damping: 10, mass: 0.8 },
  },
};

const bounceScale = {
  hidden: { opacity: 0, scale: 0 },
  visible: {
    opacity: 1, scale: 1,
    transition: { type: "spring" as const, stiffness: 250, damping: 10, mass: 0.7 },
  },
};

const bounceRight = {
  hidden: { opacity: 0, x: 80, scale: 0.5 },
  visible: {
    opacity: 1, x: 0, scale: 1,
    transition: { type: "spring" as const, stiffness: 200, damping: 11, mass: 0.8 },
  },
};

export default function HeroSection({ contentVisible = true }: { contentVisible?: boolean }) {
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
    <section ref={heroRef} className="relative min-h-[100dvh] md:min-h-[100dvh] overflow-hidden border-b dark:border-white/10">
      {/* Background layers - appear immediately */}
      <motion.div
        className="absolute inset-[0%] bg-[url('/fond4.png')] md:bg-[url('/fond3.png')] bg-cover bg-no-repeat bg-center dark:opacity-22 will-change-transform [--hero-bg-scale:1.05] md:[--hero-bg-scale:1.1]"
        style={{ transform: "translateY(calc(-0% + var(--scroll-y, 0px) * 0.4)) scale(var(--hero-bg-scale))" }}
        initial={{ opacity: 0, scale: 1.15, filter: "blur(0px)" }}
        animate={{ opacity: 0.9, scale: 1, filter: contentVisible ? "blur(2.2px)" : "blur(0px)" }}
        transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
        aria-hidden="true"
      />

      <div className="absolute inset-0 bg-white/59 dark:bg-slate-950/58 pointer-events-none" />

      <div className="absolute inset-0 bg-gradient-to-b from-white/6 via-white/3 to-white/9 dark:from-slate-950/8 dark:via-slate-950/2 dark:to-slate-950/92 pointer-events-none" />

      

      <div className="absolute inset-0 shadow-[inset_0_0_150px_rgba(0,0,0,0.14)] dark:shadow-[inset_0_0_220px_rgba(2,6,23,0.88)] pointer-events-none" />

      {/* Content - bouncy squishy animation controlled by contentVisible */}
      <motion.div
        className="container relative z-10 flex flex-col items-center space-y-4 px-4 py-6 text-center will-change-transform md:space-y-8 md:py-14"
        style={{ transform: "translateY(calc(var(--scroll-y, 0px) * -0.15))" }}
        variants={stagger}
        initial="hidden"
        animate={contentVisible ? "visible" : "hidden"}
      >
        <motion.img
          src="/logo.png"
          alt="Tok"
          className="h-40 w-auto object-contain drop-shadow-[0_10px_25px_rgba(0,0,0,0.22)] sm:h-44 md:h-52"
          variants={bounceUp}
        />

        <motion.div variants={stagger} className="max-w-3xl space-y-2 opacity-80">
          <motion.h1
            className="newspaper-bg font-display flex flex-wrap items-center justify-center gap-x-2 text-3xl font-bold leading-[0.8] tracking-tight text-foreground sm:text-5xl md:text-6xl"
            variants={bounceUp}
          >
            <span>Commandez malin,</span>
            <span className="italic text-primary">mangez bien.</span>
          </motion.h1>
          <motion.p
            className="newspaper-bg mx-auto max-w-2xl text-base font-extrabold leading-relaxed text-foreground/90 dark:text-foreground/88 sm:text-lg md:text-xl"
            variants={bounceUp}
          >
            Le reflexe food... simple, rentable, solidaire !
          </motion.p>
        </motion.div>

        <motion.div variants={bounceScale} className="flex flex-wrap justify-center gap-2">
          {[
            { icon: Star, label: "4.8/5", mobileOnly: false },
            { icon: Timer, label: "Des 25 min", mobileOnly: false },
            { icon: Store, label: "Restaurants partenaires", mobileOnly: false },
          ].map((badge) => {
            const Icon = badge.icon;
            return (
              <div
                key={badge.label}
                className={`${badge.mobileOnly ? "hidden md:flex" : "flex"} items-center gap-2 rounded-full border border-white/90 bg-white/95 px-4 py-2 shadow-[0_12px_30px_rgba(0,0,0,0.12)] dark:border-white/14 dark:bg-slate-950/92 dark:shadow-[0_18px_36px_rgba(0,0,0,0.42)]`}
              >
                <span className="grid h-7 w-7 place-items-center rounded-full bg-primary/14 dark:bg-primary/20">
                  <Icon className="h-4 w-4 text-primary" />
                </span>
                <span className="text-sm font-semibold text-foreground/90 dark:text-foreground">{badge.label}</span>
              </div>
            );
          })}
        </motion.div>

        <motion.div variants={bounceRight} className="flex w-full flex-col items-center gap-2 self-center md:max-w-lg">
          <div className="w-full">
            <Link
              to="/recherche"
              className="group relative block w-full overflow-hidden rounded-full bg-gradient-to-b from-primary to-primary/90 px-6 py-3.5 text-sm font-semibold text-white shadow-[0_18px_42px_rgba(0,0,0,0.22)] transition hover:-translate-y-[1px] hover:shadow-[0_24px_58px_rgba(0,0,0,0.28)] focus:outline-none focus:ring-2 focus:ring-primary/40 dark:shadow-[0_22px_50px_rgba(249,115,22,0.22)] md:px-8 md:py-4 md:text-base"
            >
              <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(255,255,255,0.35),_transparent_55%)] opacity-60" />
              <span className="relative flex items-center justify-center gap-3">
                Explorer les restaurants
                <span className="inline-flex items-center justify-center rounded-full bg-white/15 p-1">
                  <ArrowRight className="h-5 w-5 transition group-hover:translate-x-0.5" />
                </span>
              </span>
            </Link>
          </div>

          <div className="w-full">
            <Link
              to="/ventes-flash"
              className="block w-full rounded-full border border-white/70 bg-white/92 px-6 py-3.5 text-sm font-semibold text-white shadow-[0_14px_35px_rgba(0,0,0,0.12)] transition hover:bg-white hover:text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20 dark:border-white/14 dark:bg-slate-950/90 dark:text-foreground dark:shadow-[0_18px_38px_rgba(0,0,0,0.40)] dark:hover:bg-slate-900/95 md:px-8 md:py-4 md:text-base"
            >
              Voir les offres du jour
            </Link>
          </div>

          <div className="w-full">
            <Link
              to="/recherche?mode=reservation"
              className="block w-full rounded-full border border-white/60 bg-white/88 px-6 py-3.5 text-sm font-semibold text-white shadow-[0_10px_28px_rgba(0,0,0,0.09)] transition hover:bg-white/95 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/10 dark:border-white/12 dark:bg-slate-950/85 dark:text-foreground/96 dark:shadow-[0_14px_32px_rgba(0,0,0,0.36)] dark:hover:bg-slate-900/92 md:px-8 md:py-4 md:text-base"
            >
              Reserver une table
            </Link>
          </div>
        </motion.div>

        <motion.div variants={bounceScale} className="flex flex-wrap justify-center gap-2">
          {[
            { icon: Bike, label: "Livraison rapide", color: "text-primary" },
            { icon: Trophy, label: "Programme fidelite", color: "text-amber-500" },
          ].map((item) => (
            <div
              key={item.label}
              className="flex items-center gap-2 rounded-full border border-white/85 bg-white/55 px-4 py-2 shadow-[0_10px_24px_rgba(0,0,0,0.10)] dark:border-white/12 dark:bg-slate-950/92 dark:shadow-[0_12px_28px_rgba(0,0,0,0.38)]"
            >
              <item.icon className={`h-4 w-4 ${item.color}`} />
              <span className="text-sm font-semibold text-black dark:text-foreground/96">{item.label}</span>
            </div>
          ))}
        </motion.div>
      </motion.div>
    </section>
  );
}
