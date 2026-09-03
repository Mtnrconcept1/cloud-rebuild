import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ChefHat, MapPin, Search, Star, Utensils, X } from "lucide-react";

import CityAutocomplete from "@/components/CityAutocomplete";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTokLogoSrc } from "@/hooks/useTokLogo";

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
  "h-auto border-none bg-transparent px-0 py-0 text-[1.03rem] font-semibold text-foreground shadow-none placeholder:text-muted-foreground/80 focus-visible:ring-0 md:text-[1.03rem]";

const newsletterConditions = [
  "Le bonus de bienvenue est réservé aux nouveaux comptes TOK qui s'inscrivent à la newsletter depuis cette offre.",
  "Les 500 Miamz sont crédités une seule fois par personne après validation du compte et de l'inscription à la newsletter.",
  "Les Miamz ne sont pas convertibles en argent et s'utilisent uniquement dans les parcours TOK éligibles, selon les règles affichées dans l'application.",
  "Vous pouvez vous désinscrire de la newsletter à tout moment. La désinscription n'annule pas les Miamz déjà crédités, sauf fraude, abus ou erreur technique.",
  "TOK peut modifier, suspendre ou arrêter l'offre si nécessaire, notamment en cas d'usage abusif, de comptes multiples ou de tentative de contournement.",
];

export default function HeroSection({ contentVisible = true }: { contentVisible?: boolean }) {
  const heroRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const logoSrc = useTokLogoSrc();
  const [city, setCity] = useState("Genève");
  const [searchQuery, setSearchQuery] = useState("");
  const [showNewsletter, setShowNewsletter] = useState(true);
  const [showNewsletterConditions, setShowNewsletterConditions] = useState(false);

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
      <h1 className="sr-only">
        Réservez, commandez et profitez des meilleures offres food à Genève
      </h1>
      <section data-testid="mobile-hero-shell" className="relative min-h-[calc(100svh_-_66px_-_env(safe-area-inset-top,0px))] overflow-hidden bg-[#edf7ff] md:hidden">
        <div className="absolute inset-0 bg-[url('/fondacceuil.png')] bg-[length:100%_auto] bg-[position:50%_0%] bg-no-repeat" aria-hidden="true" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,250,240,0.68)_0%,rgba(255,250,240,0.12)_34%,rgba(67,32,11,0.06)_62%,rgba(22,10,4,0.54)_100%)]" aria-hidden="true" />
        <motion.div
          variants={stagger}
          initial="hidden"
          animate={contentVisible ? "visible" : "hidden"}
          data-testid="mobile-hero-panel"
          className="relative z-10 min-h-[calc(100svh_-_66px_-_env(safe-area-inset-top,0px))]"
        >
          <div className="relative z-10 flex min-h-[calc(100svh_-_66px_-_env(safe-area-inset-top,0px))] flex-col">
            <div className="px-4 pb-1 pt-5 text-center min-[360px]:px-5 min-[390px]:pt-8">
              <motion.div variants={scaleIn} className="mx-auto flex h-16 justify-center min-[360px]:h-[76px] min-[390px]:h-[84px]">
                <img
                  src={logoSrc}
                  alt="Tok"
                  className="h-full w-auto translate-x-[12px] object-contain drop-shadow-[0_12px_30px_rgba(62,30,10,0.20)]"
                />
              </motion.div>

              <motion.div variants={fadeUp} className="relative isolate mx-auto mt-1 w-full max-w-[390px]">
                <div className="pointer-events-none absolute -inset-x-6 -inset-y-5 -z-10 rounded-[999px] bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.88)_0%,rgba(255,255,255,0.50)_52%,transparent_78%)] blur-xl" aria-hidden="true" />
                <div aria-hidden="true" className="text-[#2a1407] drop-shadow-[0_2px_1px_rgba(255,255,255,0.78)]">
                  <span className="block [font-family:'Playball',cursive] text-[clamp(1.78rem,9.4vw,2.34rem)] font-normal leading-[0.92] tracking-normal">Réservez et commandez</span>
                  <span className="block font-display text-[clamp(1.82rem,9.2vw,2.34rem)] font-black italic leading-[0.92] tracking-normal">les meilleures</span>
                  <span className="block font-display text-[clamp(1.82rem,9.2vw,2.34rem)] font-black italic leading-[0.92] tracking-normal">offres food</span>
                </div>
                <p className="mx-auto mt-3 max-w-[300px] text-[0.98rem] font-extrabold leading-[1.16] text-[#111827] drop-shadow-[0_1px_0_rgba(255,255,255,0.80)] min-[390px]:text-[1.05rem]">
                  <span className="block">À Genève, cumulez des</span>
                  <span className="block">
                    <span className="text-[#ff4017]">Miamz</span> solidaires à chaque repas
                  </span>
                </p>
              </motion.div>
            </div>

            <motion.div variants={scaleIn} className="mt-auto space-y-2 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] pt-4 min-[360px]:px-6 min-[390px]:px-8">
              <form onSubmit={handleSearch} className="space-y-1.5">
              <div className="flex h-[40px] items-center gap-3 rounded-full bg-white px-5 shadow-lg transition-shadow duration-base ease-out-soft focus-within:ring-[3px] focus-within:ring-ring/25 min-[390px]:h-[42px]">
                <MapPin className="h-4 w-4 shrink-0 text-primary" />
                <CityAutocomplete
                  value={city}
                  onCitySelect={(selectedCity) => setCity(selectedCity)}
                  onValueChange={(value) => setCity(value)}
                  placeholder="Votre ville..."
                  className="min-w-0 flex-1"
                  inputClassName="h-auto border-none bg-transparent px-0 py-0 text-[0.92rem] font-extrabold text-[#1f2937] placeholder:text-[#7c8797] shadow-none focus-visible:ring-0 min-[390px]:text-[0.98rem]"
                  hideIcon
                />
              </div>

              <div className="flex h-[42px] items-center gap-3 rounded-full bg-white pl-5 pr-1.5 shadow-lg transition-shadow duration-base ease-out-soft focus-within:ring-[3px] focus-within:ring-ring/25 min-[390px]:h-[44px]">
                <Search className="h-4 w-4 shrink-0 text-[#6b7280]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cuisine, nom de restaurant..."
                  className="min-w-0 flex-1 bg-transparent text-[0.82rem] font-bold text-[#26344c] placeholder:text-[#6f7682] focus:outline-none min-[390px]:text-[0.9rem]"
                />
                <button
                  type="submit"
                  aria-label="Rechercher"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-gradient text-primary-foreground shadow-brand transition-[filter,transform] duration-fast ease-out-soft hover:brightness-110 active:scale-95 min-[390px]:h-9 min-[390px]:w-9"
                >
                  <Search className="h-4 w-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-0">
                <button
                  type="submit"
                  className="flex h-[42px] items-center justify-center gap-2 rounded-full bg-brand-gradient px-3 text-[0.74rem] font-extrabold text-primary-foreground shadow-brand transition-[filter,transform] duration-fast ease-out-soft hover:brightness-110 active:translate-y-px min-[390px]:h-[44px] min-[390px]:text-[0.8rem]"
                >
                  <Utensils className="h-4 w-4 shrink-0" />
                  Je veux manger
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/restaurateurs/geneve")}
                  className="flex h-[42px] items-center justify-center gap-2 rounded-full bg-white px-3 text-[0.74rem] font-extrabold text-[#1f2937] shadow-[0_10px_20px_rgba(34,16,5,0.20)] transition hover:bg-[#fff7f1] active:translate-y-px min-[390px]:h-[44px] min-[390px]:text-[0.8rem]"
                >
                  <ChefHat className="h-4 w-4 shrink-0 text-[#3b1c0c]" />
                  Restaurateur
                </button>
              </div>
              </form>

              {showNewsletter ? (
                <div
                  data-testid="mobile-newsletter"
                  className="relative rounded-[24px] bg-[#2d1608]/78 px-3 py-2 text-center shadow-[0_14px_26px_rgba(25,12,5,0.20)] backdrop-blur-[2px]"
                >
                  <p className="mx-auto max-w-[290px] text-[0.74rem] font-extrabold leading-[1.12] text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.35)] min-[390px]:text-[0.78rem]">
                    {"Abonnez-vous et recevez "}
                    <span className="text-[#ff7a1a]">500 Miamz.</span>
                  </p>
                  <div className="mt-1.5 flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowNewsletterConditions(true)}
                      aria-haspopup="dialog"
                      className="text-[0.68rem] font-semibold leading-tight text-white underline underline-offset-4 drop-shadow-[0_2px_8px_rgba(0,0,0,0.35)] min-[390px]:text-[0.72rem]"
                    >
                      Conditions applicables.
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate("/auth")}
                      className="h-[30px] rounded-full bg-brand-gradient px-4 text-[0.7rem] font-extrabold text-primary-foreground shadow-brand transition-[filter] duration-fast ease-out-soft hover:brightness-110 min-[390px]:h-[32px] min-[390px]:text-[0.74rem]"
                    >
                      Inscrivez-vous
                    </button>
                  </div>
                </div>
              ) : null}
            </motion.div>
          </div>
        </motion.div>

      </section>

      <section
        ref={heroRef}
        className="relative hidden min-h-[calc(100dvh_-_80px_-_env(safe-area-inset-top,0px))] flex-col overflow-hidden md:flex lg:min-h-[calc(100dvh_-_116px_-_env(safe-area-inset-top,0px))]"
      >
        <motion.div
          className="absolute inset-0 bg-[url('/chefbg.webp')] bg-cover bg-no-repeat bg-center will-change-transform"
          style={{ transform: "translateY(calc(var(--scroll-y, 0px) * 0.3)) scale(1.05)" }}
          initial={{ opacity: 0, scale: 1.12 }}
          animate={{ opacity: 1, scale: 1.05 }}
          transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }}
          aria-hidden="true"
        />

        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,248,240,0.04)_0%,rgba(255,239,220,0.08)_100%)] dark:bg-[linear-gradient(180deg,rgba(3,7,18,0.12)_0%,rgba(3,7,18,0.56)_70%,rgba(3,7,18,0.82)_100%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_32%,rgba(255,237,214,0.10),transparent_28%),radial-gradient(circle_at_82%_34%,rgba(255,236,211,0.08),transparent_24%),linear-gradient(180deg,rgba(105,66,26,0)_58%,rgba(105,66,26,0.08)_100%)] dark:bg-[radial-gradient(circle_at_20%_30%,rgba(249,115,22,0.14),transparent_28%),radial-gradient(circle_at_82%_34%,rgba(34,211,238,0.08),transparent_24%),linear-gradient(180deg,rgba(3,7,18,0)_52%,rgba(3,7,18,0.68)_100%)]" />
        <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_220px_rgba(71,39,14,0.08)] dark:shadow-[inset_0_0_240px_rgba(0,0,0,0.56)]" />

        <motion.div
          className="relative z-10 flex flex-1 flex-col items-center justify-start px-6 pb-14 pt-14 text-center lg:pt-16"
          style={{ transform: "translateY(calc(var(--scroll-y, 0px) * -0.12))" }}
          variants={stagger}
          initial="hidden"
          animate={contentVisible ? "visible" : "hidden"}
        >
          <motion.img
            src={logoSrc}
            alt="Tok"
            className="mb-2 h-36 w-auto object-contain drop-shadow-[0_14px_30px_rgba(122,73,25,0.18)] dark:drop-shadow-[0_0_36px_rgba(255,123,24,0.34)] lg:h-40"
            variants={fadeUp}
          />

          <motion.div variants={fadeUp} className="relative isolate max-w-[960px] space-y-3">
            <div className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[128%] w-[110%] -translate-x-1/2 -translate-y-1/2 rounded-[999px] bg-[radial-gradient(ellipse_at_center,rgba(255,252,248,0.97)_0%,rgba(255,251,246,0.86)_42%,rgba(255,250,244,0.42)_68%,transparent_88%)] blur-3xl dark:bg-[radial-gradient(ellipse_at_center,rgba(14,11,9,0.88)_0%,rgba(14,11,9,0.64)_46%,transparent_86%)]" aria-hidden="true" />
            <div aria-hidden="true" className="font-display text-[clamp(2.9rem,6vw,5rem)] font-bold leading-[0.97] tracking-[-0.028em] text-foreground">
              <span className="block">Réservez, commandez et profitez</span>
              <span className="block italic text-gradient">des meilleures offres food à Genève</span>
            </div>
            <p className="mx-auto max-w-[720px] text-[1.2rem] font-medium leading-[1.5] text-foreground/75 md:text-[1.38rem]">
              Gagnez du temps, cumulez des <span className="font-bold text-primary">Miamz</span> et transformez vos repas en impact solidaire.
            </p>
          </motion.div>

          <motion.form
            variants={scaleIn}
            onSubmit={handleSearch}
            className="mt-8 w-full max-w-[560px] space-y-4"
          >
            <div className="flex h-[64px] items-center gap-3 rounded-full border border-border/60 bg-surface-raised px-6 shadow-lg transition-[box-shadow,border-color] duration-base ease-out-soft focus-within:border-primary/50 focus-within:shadow-xl focus-within:ring-[3px] focus-within:ring-ring/20">
              <MapPin className="h-5 w-5 shrink-0 text-primary" />
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

            <div className="flex h-[64px] items-center gap-3 rounded-full border border-border/60 bg-surface-raised px-6 shadow-lg transition-[box-shadow,border-color] duration-base ease-out-soft focus-within:border-primary/50 focus-within:shadow-xl focus-within:ring-[3px] focus-within:ring-ring/20">
              <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cuisine, nom de restaurant..."
                  className="min-w-0 flex-1 bg-transparent text-[1.03rem] font-semibold text-foreground placeholder:text-muted-foreground/80 focus:outline-none"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="submit"
                className="group relative h-[64px] overflow-hidden rounded-full bg-brand-gradient px-6 text-base font-extrabold uppercase tracking-[0.06em] text-primary-foreground shadow-brand transition-[transform,box-shadow,filter] duration-base ease-out-soft hover:-translate-y-0.5 hover:brightness-110 hover:shadow-xl active:translate-y-0"
              >
                <span aria-hidden="true" className="pointer-events-none absolute inset-x-10 top-0 h-10 rounded-full bg-white/25 blur-2xl" />
                <span className="relative inline-flex items-center justify-center gap-2">
                  <Search className="h-5 w-5" />
                  Je veux manger
                </span>
              </button>
              <button
                type="button"
                onClick={() => navigate("/restaurateurs/geneve")}
                className="h-[64px] rounded-full border border-border/60 bg-surface-raised px-6 text-base font-extrabold uppercase tracking-[0.05em] text-foreground shadow-lg transition-[transform,box-shadow,border-color] duration-base ease-out-soft hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-xl active:translate-y-0"
              >
                <span className="inline-flex items-center justify-center gap-2">
                  <ChefHat className="h-5 w-5 text-primary" />
                  Je suis restaurateur
                </span>
              </button>
            </div>
          </motion.form>

          <motion.div variants={scaleIn} className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <div className="neon-chip flex items-center gap-3 rounded-full border border-border/60 bg-surface-raised/90 px-5 py-3 shadow-md backdrop-blur-sm">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-primary-soft">
                <Star className="h-4 w-4 fill-primary/25 text-primary" />
              </span>
              <span className="text-sm font-bold text-foreground">4.8/5</span>
            </div>
            <div className="neon-chip flex items-center gap-3 rounded-full border border-border/60 bg-surface-raised/90 px-5 py-3 shadow-md backdrop-blur-sm">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-primary-soft">
                <MapPin className="h-4 w-4 text-primary" />
              </span>
              <span className="text-sm font-bold text-foreground">Restaurants locaux partenaires</span>
            </div>
          </motion.div>
        </motion.div>

        {showNewsletter ? (
          <motion.div
            initial={{ y: 60, opacity: 0 }}
            animate={contentVisible ? { y: 0, opacity: 1 } : { y: 60, opacity: 0 }}
            transition={{ delay: 0.8, type: "spring", stiffness: 120, damping: 14 }}
            className="relative z-10 border-t border-border/60 bg-surface-raised/92 px-4 py-3.5 backdrop-blur-xl"
          >
            <div className="container flex flex-col items-center justify-between gap-3 sm:flex-row">
              <p className="text-center text-sm font-semibold text-foreground sm:text-left">
                Abonnez-vous à notre newsletter et recevez{" "}
                <span className="font-extrabold text-primary">500 Miamz</span>.{" "}
                <button
                  type="button"
                  onClick={() => setShowNewsletterConditions(true)}
                  aria-haspopup="dialog"
                  className="text-xs underline text-muted-foreground hover:text-foreground"
                >
                  Conditions applicables.
                </button>
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigate("/auth")}
                  className="rounded-full bg-brand-gradient px-6 py-2.5 text-sm font-bold text-primary-foreground shadow-brand transition-[filter,transform] duration-base ease-out-soft hover:-translate-y-0.5 hover:brightness-110"
                >
                  Inscrivez-vous
                </button>
                <button
                  onClick={() => setShowNewsletter(false)}
                  className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground transition-colors duration-fast ease-out-soft hover:bg-muted hover:text-foreground"
                  aria-label="Fermer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </motion.div>
        ) : null}
      </section>

      <Dialog open={showNewsletterConditions} onOpenChange={setShowNewsletterConditions}>
        <DialogContent className="max-h-[calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-1rem)] w-[calc(100vw-env(safe-area-inset-left,0px)-env(safe-area-inset-right,0px)-1rem)] max-w-lg rounded-2xl p-0">
          <DialogHeader className="border-b px-5 pb-4 pt-5 pr-12 text-left sm:px-6">
            <DialogTitle>Conditions du bonus newsletter</DialogTitle>
            <DialogDescription>
              Ce bonus permet de recevoir 500 Miamz lors d'une inscription éligible à la newsletter TOK.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 px-5 pb-5 pt-4 text-sm leading-6 text-slate-700 sm:px-6 dark:text-slate-200">
            <ul className="list-disc space-y-3 pl-5">
              {newsletterConditions.map((condition) => (
                <li key={condition}>{condition}</li>
              ))}
            </ul>
            <p className="rounded-xl bg-orange-50 px-4 py-3 text-xs font-semibold leading-5 text-orange-900 dark:bg-orange-950/30 dark:text-orange-100">
              En continuant l'inscription, vous acceptez aussi les Conditions générales d'utilisation et la Politique de confidentialité TOK.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
