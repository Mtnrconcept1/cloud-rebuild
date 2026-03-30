import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { MapPin, Search, Star, X } from "lucide-react";

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.10 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1, y: 0,
    transition: { type: "spring" as const, stiffness: 140, damping: 16, mass: 0.9 },
  },
};

const scaleIn = {
  hidden: { opacity: 0, scale: 0.85 },
  visible: {
    opacity: 1, scale: 1,
    transition: { type: "spring" as const, stiffness: 200, damping: 14, mass: 0.7 },
  },
};

export default function HeroSection({ contentVisible = true }: { contentVisible?: boolean }) {
  const heroRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const [city, setCity] = useState("Geneve");
  const [searchQuery, setSearchQuery] = useState("");
  const [showNewsletter, setShowNewsletter] = useState(true);

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

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (searchQuery.trim()) params.set("q", searchQuery.trim());
    if (city.trim()) params.set("city", city.trim());
    navigate(`/recherche${params.toString() ? `?${params}` : ""}`);
  };

  return (
    <section ref={heroRef} className="relative flex min-h-[100dvh] flex-col overflow-hidden">
      {/* Background image */}
      <motion.div
        className="absolute inset-0 bg-[url('/fond4.png')] md:bg-[url('/fond3.png')] bg-cover bg-no-repeat bg-center will-change-transform"
        style={{ transform: "translateY(calc(var(--scroll-y, 0px) * 0.3)) scale(1.05)" }}
        initial={{ opacity: 0, scale: 1.12 }}
        animate={{ opacity: 1, scale: 1.05 }}
        transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }}
        aria-hidden="true"
      />

      {/* Dark overlay for readability */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/50 to-black/70 pointer-events-none" />

      {/* Warm vignette */}
      <div className="absolute inset-0 shadow-[inset_0_0_200px_rgba(0,0,0,0.4)] pointer-events-none" />

      {/* Content */}
      <motion.div
        className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 py-12 text-center"
        style={{ transform: "translateY(calc(var(--scroll-y, 0px) * -0.12))" }}
        variants={stagger}
        initial="hidden"
        animate={contentVisible ? "visible" : "hidden"}
      >
        {/* Logo / Mascot */}
        <motion.img
          src="/logo.png"
          alt="Tok"
          className="mb-4 h-36 w-auto object-contain drop-shadow-[0_8px_30px_rgba(0,0,0,0.4)] sm:h-44 md:mb-6 md:h-52"
          variants={fadeUp}
        />

        {/* Headline */}
        <motion.div variants={fadeUp} className="mb-2 max-w-2xl space-y-2 md:mb-4">
          <h1 className="font-display text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl md:text-5xl lg:text-[3.4rem]">
            Decouvrez et reservez le{" "}
            <span className="italic text-primary">meilleur restaurant</span>
          </h1>
          <p className="mx-auto max-w-lg text-base font-medium text-white/80 sm:text-lg md:text-xl">
            Trouvez et reservez en quelques clics la table ideale
          </p>
        </motion.div>

        {/* Search form */}
        <motion.form
          variants={scaleIn}
          onSubmit={handleSearch}
          className="mt-4 w-full max-w-xl space-y-3 md:mt-6"
        >
          {/* City field */}
          <div className="flex items-center gap-3 rounded-full border border-white/20 bg-white/95 px-5 py-3 shadow-xl backdrop-blur-sm dark:bg-slate-900/90">
            <MapPin className="h-5 w-5 shrink-0 text-muted-foreground" />
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Ville..."
              className="flex-1 bg-transparent text-base font-medium text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          </div>

          {/* Search query field */}
          <div className="flex items-center gap-3 rounded-full border border-white/20 bg-white/95 px-5 py-3 shadow-xl backdrop-blur-sm dark:bg-slate-900/90">
            <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cuisine, nom de restaurant..."
              className="flex-1 bg-transparent text-base font-medium text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          </div>

          {/* Search button */}
          <button
            type="submit"
            className="group relative w-full overflow-hidden rounded-full bg-gradient-to-b from-primary to-primary/85 px-8 py-4 text-base font-extrabold uppercase tracking-wider text-white shadow-[0_8px_32px_rgba(249,115,22,0.4)] transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_40px_rgba(249,115,22,0.5)] active:translate-y-0"
          >
            <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(255,255,255,0.25),_transparent_60%)]" />
            <span className="relative">RECHERCHER</span>
          </button>
        </motion.form>

        {/* Trust badges */}
        <motion.div variants={scaleIn} className="mt-6 flex flex-wrap items-center justify-center gap-3 md:mt-8">
          <div className="flex items-center gap-2 rounded-full border border-white/20 bg-white/90 px-5 py-2.5 shadow-lg backdrop-blur-sm dark:bg-slate-900/80">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-primary/15">
              <Star className="h-4 w-4 text-primary" />
            </span>
            <span className="text-sm font-bold text-foreground">4.8/5</span>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-white/20 bg-white/90 px-5 py-2.5 shadow-lg backdrop-blur-sm dark:bg-slate-900/80">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-primary/15">
              <MapPin className="h-4 w-4 text-primary" />
            </span>
            <span className="text-sm font-bold text-foreground">Des centaines restaurants partenaires</span>
          </div>
        </motion.div>
      </motion.div>

      {/* Newsletter banner at bottom */}
      {showNewsletter && (
        <motion.div
          initial={{ y: 60, opacity: 0 }}
          animate={contentVisible ? { y: 0, opacity: 1 } : { y: 60, opacity: 0 }}
          transition={{ delay: 0.8, type: "spring", stiffness: 120, damping: 14 }}
          className="relative z-10 border-t border-white/10 bg-white/95 px-4 py-3 backdrop-blur-md dark:bg-slate-900/95"
        >
          <div className="container flex flex-col items-center justify-between gap-3 sm:flex-row">
            <p className="text-center text-sm font-semibold text-foreground sm:text-left">
              Abonnez-vous a notre newsletter et recevez{" "}
              <span className="font-extrabold text-primary">500 Yums</span>.{" "}
              <button className="text-xs underline text-muted-foreground hover:text-foreground">
                Conditions applicables.
              </button>
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate("/auth")}
                className="rounded-full bg-primary px-6 py-2 text-sm font-bold text-white shadow-md transition hover:bg-primary/90"
              >
                Inscrivez-vous
              </button>
              <button
                onClick={() => setShowNewsletter(false)}
                className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </section>
  );
}
