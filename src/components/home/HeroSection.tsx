import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Bell, Clock3, MapPin, Mic, Search, Star, Truck, X } from "lucide-react";

import CityAutocomplete from "@/components/CityAutocomplete";
import { useActiveFeatures } from "@/lib/featureFlags";

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 140, damping: 16, mass: 0.9 },
  },
};

const scaleIn = {
  hidden: { opacity: 0, scale: 0.85 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { type: "spring" as const, stiffness: 200, damping: 14, mass: 0.7 },
  },
};

const desktopFieldInputClassName =
  "h-auto border-none bg-transparent px-0 py-0 text-[1.03rem] font-semibold text-[#2d3950] placeholder:text-[#7d8897] shadow-none focus-visible:ring-0 md:text-[1.03rem] dark:text-slate-50 dark:placeholder:text-slate-200/90";

export default function HeroSection({ contentVisible = true }: { contentVisible?: boolean }) {
  const heroRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const activeFeatures = useActiveFeatures();
  const deliveryEnabled = activeFeatures.has("livraison");
  const [city, setCity] = useState("Geneve");
  const [searchQuery, setSearchQuery] = useState("");
  const [showNewsletter, setShowNewsletter] = useState(true);
  const [isListening, setIsListening] = useState(false);

  const startVoiceSearch = () => {
    const w = window as Window & {
      SpeechRecognition?: new () => {
        lang: string;
        interimResults: boolean;
        maxAlternatives: number;
        onstart: (() => void) | null;
        onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
        onerror: (() => void) | null;
        onend: (() => void) | null;
        start: () => void;
      };
      webkitSpeechRecognition?: new () => {
        lang: string;
        interimResults: boolean;
        maxAlternatives: number;
        onstart: (() => void) | null;
        onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
        onerror: (() => void) | null;
        onend: (() => void) | null;
        start: () => void;
      };
    };
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) return;

    const recognition = new SR();
    recognition.lang = "fr-FR";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setSearchQuery(transcript);
      setIsListening(false);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognition.start();
  };

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
      <section className="bg-background md:hidden">
        <motion.div
          variants={stagger}
          initial="hidden"
          animate={contentVisible ? "visible" : "hidden"}
          className="space-y-3 px-4 pt-3 pb-5"
        >
          <motion.div variants={fadeUp} className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <MapPin className="h-4 w-4 shrink-0 text-primary" />
              <CityAutocomplete
                value={city}
                onCitySelect={(selectedCity) => setCity(selectedCity)}
                onValueChange={(value) => setCity(value)}
                placeholder="Votre ville..."
                className="min-w-0 flex-1"
                inputClassName="h-8 border-none bg-transparent px-0 text-sm font-semibold shadow-none focus-visible:ring-0 dark:text-slate-50 dark:placeholder:text-slate-200/90"
                hideIcon
              />
            </div>
            <button
              onClick={() => navigate("/notifications")}
              className="neon-chip grid h-[44px] w-[44px] shrink-0 place-items-center rounded-full bg-muted/60"
              aria-label="Notifications"
            >
              <Bell className="h-4.5 w-4.5 text-foreground" />
            </button>
          </motion.div>

          <motion.div
            variants={scaleIn}
            className="neon-panel relative rounded-[30px] border border-white/80 shadow-[0_20px_44px_rgba(109,71,30,0.14)] dark:border-white/20"
          >
            <div className="absolute inset-0 rounded-[30px] bg-[url('/fond3.png')] bg-cover bg-center" aria-hidden="true" />
            <div className="absolute inset-0 rounded-[30px] bg-[linear-gradient(180deg,rgba(255,248,241,0.72)_0%,rgba(255,245,234,0.86)_35%,rgba(255,244,234,0.94)_100%)] dark:bg-[linear-gradient(180deg,rgba(8,13,24,0.50)_0%,rgba(7,11,20,0.76)_42%,rgba(5,8,14,0.94)_100%)]" />
            <div className="absolute inset-0 rounded-[30px] bg-[radial-gradient(circle_at_50%_24%,rgba(255,255,255,0.82),transparent_38%)] dark:bg-[radial-gradient(circle_at_18%_10%,rgba(255,122,24,0.30),transparent_38%),radial-gradient(circle_at_88%_24%,rgba(34,211,238,0.18),transparent_34%)]" />

            <div className="relative z-10 p-5 pt-4">
              <div className="mt-1 grid grid-cols-1 items-end gap-y-1 min-[381px]:grid-cols-[minmax(0,1fr)_10.8rem] min-[381px]:gap-x-2">
                <div className="min-w-0 space-y-1.5 min-[381px]:pr-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#6b7280] dark:text-orange-200/90">
                    Reservations, commandes, bons plans
                  </p>
                  <h1 className="font-display text-[1.55rem] font-bold leading-[1] tracking-normal text-[#21314b] min-[381px]:text-[2rem] min-[381px]:leading-[0.96] dark:text-white dark:drop-shadow-[0_0_24px_rgba(255,255,255,0.14)]">
                    Trouvez votre prochaine table sans detour
                  </h1>
                  <p className="text-[13px] leading-5 text-[#394b67] min-[381px]:text-sm min-[381px]:leading-6 dark:text-slate-200">
                    Cherchez un resto, une cuisine ou une ville, puis ouvrez directement la meilleure fiche.
                  </p>
                </div>
                <div className="relative mx-auto h-[6.25rem] w-full max-w-[12rem] self-end overflow-hidden min-[381px]:h-[13rem] min-[381px]:max-w-none min-[381px]:overflow-visible">
                  <img
                    aria-hidden="true"
                    alt=""
                    src="/chef.png"
                    className="pointer-events-none absolute bottom-[-16px] left-1/2 w-[144px] max-w-none -translate-x-1/2 object-contain drop-shadow-[0_16px_28px_rgba(0,0,0,0.18)] min-[381px]:bottom-0 min-[381px]:left-auto min-[381px]:right-[-30px] min-[381px]:w-[220px] min-[381px]:translate-x-0"
                  />
                </div>
              </div>

              <motion.form variants={fadeUp} onSubmit={handleSearch} className="mt-0">
                <div className="rounded-[26px] border border-white/90 bg-white/90 p-2 shadow-[0_14px_28px_rgba(109,71,30,0.12)] backdrop-blur-md dark:border-white/20 dark:bg-slate-950/80 dark:shadow-[0_0_36px_rgba(249,115,22,0.18)]">
                  <div className="flex items-center gap-2.5 rounded-[20px] border border-[#e7e2d9] bg-white px-4 py-3 dark:border-white/20 dark:bg-white/10">
                    <Search className="h-4 w-4 shrink-0 text-muted-foreground dark:text-orange-200" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Cuisine, nom de restaurant..."
                      className="flex-1 bg-transparent text-sm font-medium text-foreground placeholder:text-muted-foreground focus:outline-none dark:text-slate-50 dark:placeholder:text-slate-200/90"
                    />
                    <button
                      type="button"
                      onClick={startVoiceSearch}
                      className={`grid h-[44px] w-[44px] shrink-0 place-items-center rounded-full transition ${isListening ? "animate-pulse bg-red-500" : "bg-primary"}`}
                      aria-label="Recherche vocale"
                    >
                      <Mic className="h-4 w-4 text-white" />
                    </button>
                  </div>
                  <button
                    type="submit"
                    className="mt-2 inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-[20px] bg-[#ff6b1c] px-5 text-sm font-extrabold uppercase tracking-[0.08em] text-white shadow-[0_14px_28px_rgba(255,107,28,0.28)] transition-all hover:bg-[#ff7528]"
                  >
                    Explorer les restaurants
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </motion.form>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => navigate("/recherche?sort=plus_reserves_mois")}
                  className="neon-chip inline-flex min-h-[44px] items-center gap-2 rounded-full border border-white/80 bg-white/82 px-3.5 py-2 text-xs font-semibold text-[#30405a] shadow-sm backdrop-blur-md"
                >
                  <Clock3 className="h-3.5 w-3.5 text-[#ff6b1c]" />
                  Ce soir
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/recherche?sort=promotion&promo=true")}
                  className="neon-chip inline-flex min-h-[44px] items-center gap-2 rounded-full border border-white/80 bg-white/82 px-3.5 py-2 text-xs font-semibold text-[#30405a] shadow-sm backdrop-blur-md"
                >
                  <Star className="h-3.5 w-3.5 text-[#ff6b1c]" />
                  Bons plans
                </button>
                {deliveryEnabled ? (
                  <button
                    type="button"
                    onClick={() => navigate("/recherche?delivery=true")}
                    className="neon-chip inline-flex min-h-[44px] items-center gap-2 rounded-full border border-white/80 bg-white/82 px-3.5 py-2 text-xs font-semibold text-[#30405a] shadow-sm backdrop-blur-md"
                  >
                    <Truck className="h-3.5 w-3.5 text-[#ff6b1c]" />
                    Livraison
                  </button>
                ) : null}
              </div>
            </div>
          </motion.div>
        </motion.div>
      </section>

      <section ref={heroRef} className="relative hidden min-h-[calc(100dvh-116px)] flex-col overflow-hidden md:flex">
        <motion.div
          className="absolute inset-0 bg-[url('/fond3.png')] bg-cover bg-no-repeat bg-center will-change-transform"
          style={{ transform: "translateY(calc(var(--scroll-y, 0px) * 0.3)) scale(1.05)" }}
          initial={{ opacity: 0, scale: 1.12 }}
          animate={{ opacity: 1, scale: 1.05 }}
          transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }}
          aria-hidden="true"
        />

        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,248,240,0.12)_0%,rgba(255,239,220,0.26)_100%)] dark:bg-[linear-gradient(180deg,rgba(3,7,18,0.22)_0%,rgba(3,7,18,0.72)_70%,rgba(3,7,18,0.90)_100%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_32%,rgba(255,237,214,0.36),transparent_28%),radial-gradient(circle_at_82%_34%,rgba(255,236,211,0.3),transparent_24%),linear-gradient(180deg,rgba(105,66,26,0)_58%,rgba(105,66,26,0.14)_100%)] dark:bg-[radial-gradient(circle_at_20%_30%,rgba(249,115,22,0.26),transparent_28%),radial-gradient(circle_at_82%_34%,rgba(34,211,238,0.18),transparent_24%),linear-gradient(180deg,rgba(3,7,18,0)_52%,rgba(3,7,18,0.78)_100%)]" />
        <div className="pointer-events-none absolute left-1/2 top-[18%] h-[54%] w-[70%] -translate-x-1/2 rounded-[999px] bg-[radial-gradient(circle,rgba(255,250,245,0.94)_0%,rgba(255,248,240,0.82)_26%,rgba(255,246,236,0.5)_48%,rgba(255,245,237,0.12)_68%,transparent_84%)] blur-3xl dark:bg-[radial-gradient(circle,rgba(255,123,24,0.28)_0%,rgba(34,211,238,0.13)_34%,rgba(255,255,255,0.06)_56%,transparent_80%)]" />
        <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_220px_rgba(71,39,14,0.08)] dark:shadow-[inset_0_0_240px_rgba(0,0,0,0.56)]" />

        <motion.div
          className="relative z-10 flex flex-1 flex-col items-center justify-start px-6 pb-14 pt-14 text-center lg:pt-16"
          style={{ transform: "translateY(calc(var(--scroll-y, 0px) * -0.12))" }}
          variants={stagger}
          initial="hidden"
          animate={contentVisible ? "visible" : "hidden"}
        >
          <motion.img
            src="/logo.png"
            alt="Tok"
            className="mb-2 h-36 w-auto object-contain drop-shadow-[0_14px_30px_rgba(122,73,25,0.18)] dark:drop-shadow-[0_0_36px_rgba(255,123,24,0.34)] lg:h-40"
            variants={fadeUp}
          />

          <motion.div variants={fadeUp} className="max-w-[960px] space-y-3">
            <h1 className="font-display text-[3.95rem] font-bold leading-[0.96] tracking-normal text-[#21314b] dark:text-white dark:drop-shadow-[0_0_30px_rgba(255,255,255,0.16)] lg:text-[5.15rem]">
              <span className="block">Découvrez et réservez le</span>
              <span className="block italic text-[#ff6b1c]">meilleur restaurant</span>
            </h1>
            <p className="mx-auto max-w-[760px] text-[1.35rem] font-medium text-[#33445e] dark:text-slate-100 md:text-[1.55rem]">
              Trouvez et réservez en quelques clics la table idéale
            </p>
          </motion.div>

          <motion.form
            variants={scaleIn}
            onSubmit={handleSearch}
            className="mt-8 w-full max-w-[560px] space-y-4"
          >
            <div className="flex h-[66px] items-center gap-3 rounded-full border border-white/90 bg-white px-6 shadow-[0_18px_40px_rgba(104,70,29,0.14)] dark:border-orange-200/30 dark:bg-slate-950/90 dark:shadow-[0_0_38px_rgba(249,115,22,0.22),inset_0_1px_0_rgba(255,255,255,0.08)]">
              <MapPin className="h-5 w-5 shrink-0 text-[#8c95a3] dark:text-orange-200" />
              <CityAutocomplete
                value={city}
                onCitySelect={(selectedCity) => setCity(selectedCity)}
                onValueChange={(value) => setCity(value)}
                placeholder="Votre ville..."
                className="flex-1"
                inputClassName={desktopFieldInputClassName}
                hideIcon
              />
            </div>

            <div className="flex h-[66px] items-center gap-3 rounded-full border border-white/90 bg-white px-6 shadow-[0_18px_40px_rgba(104,70,29,0.14)] dark:border-orange-200/30 dark:bg-slate-950/90 dark:shadow-[0_0_38px_rgba(249,115,22,0.22),inset_0_1px_0_rgba(255,255,255,0.08)]">
              <Search className="h-5 w-5 shrink-0 text-[#8c95a3] dark:text-orange-200" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cuisine, nom de restaurant..."
                className="flex-1 bg-transparent text-[1.03rem] font-semibold text-[#2d3950] placeholder:text-[#7d8897] focus:outline-none dark:text-slate-50 dark:placeholder:text-slate-200/90"
              />
            </div>

            <button
              type="submit"
              className="group relative mt-1 h-[74px] w-full overflow-hidden rounded-full bg-[#ff6b1c] px-8 text-lg font-extrabold uppercase tracking-[0.08em] text-white shadow-[0_22px_46px_rgba(255,107,28,0.34)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#ff7528] hover:shadow-[0_26px_54px_rgba(255,107,28,0.42)] active:translate-y-0"
            >
              <span className="pointer-events-none absolute inset-x-10 top-1 h-12 rounded-full bg-white/20 blur-2xl" />
              <span className="relative">RECHERCHER</span>
            </button>
          </motion.form>

          <motion.div variants={scaleIn} className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <div className="neon-chip flex items-center gap-3 rounded-full border border-white/80 bg-white/90 px-5 py-3 shadow-[0_14px_28px_rgba(104,70,29,0.12)]">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-[#fff2e8]">
                <Star className="h-4 w-4 text-[#ff6b1c]" />
              </span>
              <span className="text-sm font-bold text-[#25354e] dark:text-white">4.8/5</span>
            </div>
            <div className="neon-chip flex items-center gap-3 rounded-full border border-white/80 bg-white/90 px-5 py-3 shadow-[0_14px_28px_rgba(104,70,29,0.12)]">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-[#fff2e8]">
                <MapPin className="h-4 w-4 text-[#ff6b1c]" />
              </span>
              <span className="text-sm font-bold text-[#25354e] dark:text-white">Des centaines restaurants partenaires</span>
            </div>
          </motion.div>
        </motion.div>

        {showNewsletter ? (
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
        ) : null}
      </section>
    </>
  );
}
