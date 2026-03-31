import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Bell, ChevronDown, MapPin, Mic, Search, Star, X } from "lucide-react";

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
    <>
      {/* ───── MOBILE LAYOUT ───── */}
      <section className="md:hidden bg-background">
        <motion.div
          variants={stagger}
          initial="hidden"
          animate={contentVisible ? "visible" : "hidden"}
          className="px-4 pt-3 pb-4 space-y-3"
        >
          {/* Location bar */}
          <motion.div variants={fadeUp} className="flex items-center justify-between">
            <button className="flex items-center gap-1.5 text-foreground">
              <MapPin className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">{city || "Votre ville"}</span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
            <button
              onClick={() => navigate("/notifications")}
              className="grid h-9 w-9 place-items-center rounded-full bg-muted/60"
            >
              <Bell className="h-4.5 w-4.5 text-foreground" />
            </button>
          </motion.div>

          {/* Search bar */}
          <motion.form variants={fadeUp} onSubmit={handleSearch}>
            <div className="flex items-center gap-2.5 rounded-full border border-border bg-muted/50 px-4 py-2.5 shadow-sm">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher un restaurant..."
                className="flex-1 bg-transparent text-sm font-medium text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              <button type="button" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary">
                <Mic className="h-4 w-4 text-white" />
              </button>
            </div>
          </motion.form>

          {/* Promo banner */}
          <motion.div
            variants={scaleIn}
            className="relative rounded-2xl shadow-lg"
            style={{ minHeight: 160 }}
          >
            {/* Background image */}
            <div
              className="absolute inset-0 bg-[url('/fond4.png')] bg-cover bg-center"
              aria-hidden="true"
            />
            {/* Orange gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-r from-orange-600/90 via-orange-500/80 to-orange-400/50" />

            {/* Banner content */}
            <div className="relative z-10 flex items-center gap-[5px]">
              {/* Text side */}
              <div className="flex-1 min-w-0 space-y-1 py-4 pl-5">
                <p className="text-xl font-extrabold leading-tight text-white">
                  Avec <img src="/tok.png" alt="Tok" className="inline-block h-12 align-middle -mt-1" />
                </p>
                <p className="text-2xl font-extrabold leading-tight text-white">
                  Obtenez -50%
                </p>
                <p className="text-base font-bold leading-tight text-white">
                  Sur Votre Reservation
                </p>
                <p className="text-xs font-medium text-white/80">
                  Reservez des maintenant !
                </p>
                <div className="flex justify-center pt-2">
                  <button
                    onClick={() => navigate("/recherche?promo=true")}
                    className="rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-white shadow-md transition hover:bg-primary/90"
                  >
                    Reserver
                  </button>
                </div>
              </div>

              {/* Chef mascot – overflows the card */}
              <div className="relative w-48 shrink-0 self-end" style={{ marginRight: -20 }}>
                <img
                  src="/chef.png"
                  alt="Chef Miamz"
                  className="h-auto w-full object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.3)]"
                  style={{ marginTop: -16, marginBottom: 0 }}
                />
              </div>
            </div>
          </motion.div>
        </motion.div>
      </section>

      {/* ───── DESKTOP LAYOUT (unchanged) ───── */}
      <section ref={heroRef} className="relative hidden md:flex min-h-[100dvh] flex-col overflow-hidden">
        {/* Background image */}
        <motion.div
          className="absolute inset-0 bg-[url('/fond3.png')] bg-cover bg-no-repeat bg-center will-change-transform"
          style={{ transform: "translateY(calc(var(--scroll-y, 0px) * 0.3)) scale(1.05)" }}
          initial={{ opacity: 0, scale: 1.12 }}
          animate={{ opacity: 1, scale: 1.05 }}
          transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }}
          aria-hidden="true"
        />

        {/* Dark overlay for readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-white/10 to-black/40 pointer-events-none" />

        {/* Warm vignette */}
        <div className="absolute inset-0 shadow-[inset_0_0_200px_rgba(0,0,0,0.1)] pointer-events-none" />

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
            className="mb-6 h-52 w-auto object-contain drop-shadow-[0_8px_30px_rgba(0,0,0,0.4)]"
            variants={fadeUp}
          />

          {/* Headline */}
          <motion.div variants={fadeUp} className="mb-4 max-w-2xl space-y-2">
            <h1 className="font-display text-5xl font-bold leading-tight tracking-tight text-white lg:text-[3.4rem]">
              Decouvrez et reservez le{" "}
              <span className="italic text-primary">meilleur restaurant</span>
            </h1>
            <p className="mx-auto max-w-lg text-lg font-medium text-white/80 md:text-xl">
              Trouvez et reservez en quelques clics la table ideale
            </p>
          </motion.div>

          {/* Search form */}
          <motion.form
            variants={scaleIn}
            onSubmit={handleSearch}
            className="mt-6 w-full max-w-xl space-y-3"
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
          <motion.div variants={scaleIn} className="mt-8 flex flex-wrap items-center justify-center gap-3">
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
    </>
  );
}
