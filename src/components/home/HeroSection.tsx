import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ChefHat, MapPin, Search, Star, X } from "lucide-react";

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
  "h-auto border-none bg-transparent px-0 py-0 text-[1.03rem] font-semibold text-[#2d3950] placeholder:text-[#7d8897] shadow-none focus-visible:ring-0 md:text-[1.03rem] dark:text-slate-50 dark:placeholder:text-slate-200/90";

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
      <section className="bg-white md:hidden">
        <motion.div
          variants={stagger}
          initial="hidden"
          animate={contentVisible ? "visible" : "hidden"}
          data-testid="mobile-hero-panel"
          className="relative h-[calc(100svh-216px)] min-h-[600px] max-h-[700px] overflow-hidden bg-[#201409]"
        >
          <div className="absolute -inset-y-[60px] inset-x-0 translate-y-[60px] bg-[url('/chefbg2.webp')] bg-cover bg-[position:50%_36%]" aria-hidden="true" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_0%,transparent_64%,rgba(58,28,8,0.22)_100%)]" aria-hidden="true" />

          <div className="relative z-10 flex h-full flex-col pt-[34px]">
            <div className="px-5 pb-2 pt-4">
              <motion.img
                src={logoSrc}
                alt="Tok"
                variants={scaleIn}
                className="relative -top-[40px] mx-auto h-[82px] w-auto object-contain drop-shadow-[0_12px_30px_rgba(30,18,9,0.28)] min-[390px]:h-[88px]"
              />

              <motion.div variants={fadeUp} className="relative isolate -top-[55px] left-[15px] ml-auto mt-11 w-[56%] min-w-[198px] max-w-[268px] text-left">
                <div className="pointer-events-none absolute -left-5 -right-4 -top-5 bottom-[-18px] -z-10 rounded-[42px] bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,1)_0%,rgba(255,255,255,0.96)_42%,rgba(255,255,255,0.66)_68%,transparent_90%)] opacity-[0.94] blur-xl" aria-hidden="true" />
                <h1 className="font-display text-[1.68rem] font-bold leading-[0.95] tracking-normal text-[#26344c] drop-shadow-[0_2px_1px_rgba(255,255,255,0.55)] min-[390px]:text-[1.88rem]">
                  <span className="block">Réservez et</span>
                  <span className="block">commandez</span>
                  <span className="block italic text-[#ff5f16]">les meilleures</span>
                  <span className="block italic text-[#ff5f16]">offres food</span>
                </h1>
                <p className="relative -left-2 mt-2 inline-block w-[218px] max-w-none rounded-[18px] bg-white/76 px-2 py-1.5 text-[0.74rem] font-extrabold leading-[1.14] text-[#21314b] shadow-[0_8px_22px_rgba(255,255,255,0.24)] backdrop-blur-[2px] min-[390px]:w-[230px] min-[390px]:text-[0.78rem]">
                  <span className="block">À Genève, cumulez des</span>
                  <span className="block whitespace-nowrap">
                    <span className="text-[#ff5f16]">Miamz</span> solidaires à chaque repas
                  </span>
                </p>
              </motion.div>
            </div>

            <motion.form variants={scaleIn} onSubmit={handleSearch} className="absolute inset-x-0 bottom-3 space-y-2 px-8 pb-0 min-[390px]:bottom-4 min-[390px]:px-10">
              <div className="flex h-[42px] items-center gap-3 rounded-full bg-white px-5 shadow-[0_10px_20px_rgba(25,12,5,0.20)] min-[390px]:h-[44px]">
                <MapPin className="h-4 w-4 shrink-0 text-[#8b95a4]" />
                <CityAutocomplete
                  value={city}
                  onCitySelect={(selectedCity) => setCity(selectedCity)}
                  onValueChange={(value) => setCity(value)}
                  placeholder="Votre ville..."
                  className="min-w-0 flex-1"
                  inputClassName="h-auto border-none bg-transparent px-0 py-0 text-[0.9rem] font-bold text-[#26344c] placeholder:text-[#7c8797] shadow-none focus-visible:ring-0 min-[390px]:text-[0.96rem]"
                  hideIcon
                />
              </div>

              <div className="flex h-[42px] items-center gap-3 rounded-full bg-white px-5 shadow-[0_10px_20px_rgba(25,12,5,0.20)] min-[390px]:h-[44px]">
                <Search className="h-4 w-4 shrink-0 text-[#8b95a4]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cuisine, nom de restaurant..."
                  className="min-w-0 flex-1 bg-transparent text-[0.78rem] font-bold text-[#26344c] placeholder:text-[#7c8797] focus:outline-none min-[390px]:text-[0.86rem]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 pt-0.5">
                <button
                  type="submit"
                  className="flex h-[46px] items-center justify-center gap-1.5 rounded-full bg-[#ff6418] px-3 text-[0.68rem] font-extrabold uppercase tracking-[0.06em] text-white shadow-[0_12px_24px_rgba(255,100,24,0.30)] transition hover:bg-[#ff711f] active:translate-y-px min-[390px]:h-[48px] min-[390px]:text-[0.74rem]"
                >
                  <Search className="h-3.5 w-3.5 shrink-0" />
                  Je veux manger
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/restaurateurs/geneve")}
                  className="flex h-[46px] items-center justify-center gap-1.5 rounded-full bg-white px-3 text-[0.68rem] font-extrabold uppercase tracking-[0.04em] text-[#26344c] shadow-[0_8px_18px_rgba(25,12,5,0.16)] transition hover:bg-[#fff7f1] active:translate-y-px min-[390px]:h-[48px] min-[390px]:text-[0.74rem]"
                >
                  <ChefHat className="h-3.5 w-3.5 shrink-0 text-[#ff6418]" />
                  Restaurateur
                </button>
              </div>
            </motion.form>
          </div>
        </motion.div>

        {showNewsletter ? (
          <motion.div
            initial={{ y: 44, opacity: 0 }}
            animate={contentVisible ? { y: 0, opacity: 1 } : { y: 44, opacity: 0 }}
            transition={{ delay: 0.35, type: "spring", stiffness: 120, damping: 16 }}
            data-testid="mobile-newsletter"
            className="relative min-h-[148px] space-y-2 bg-white px-6 pb-4 pt-4 text-center shadow-[0_-14px_30px_rgba(25,12,5,0.10)] min-[390px]:min-h-[152px]"
          >
            <p className="mx-auto max-w-[300px] text-[0.86rem] font-extrabold leading-[1.16] text-slate-950 min-[390px]:text-[0.9rem]">
              {"Abonnez-vous à notre newsletter et recevez "}
              <span className="text-[#ff6418]">500 Miamz.</span>
            </p>
            <button
              type="button"
              onClick={() => setShowNewsletterConditions(true)}
              aria-haspopup="dialog"
              className="mx-auto block text-[0.72rem] font-semibold leading-tight text-[#5d6979] underline underline-offset-4 min-[390px]:text-[0.76rem]"
            >
              Conditions applicables.
            </button>
            {" "}
            <button
              onClick={() => navigate("/auth")}
              className="h-[38px] w-full max-w-[280px] rounded-full bg-[#ff6418] px-8 text-[0.78rem] font-extrabold text-white shadow-[0_12px_22px_rgba(255,100,24,0.26)] transition hover:bg-[#ff711f] min-[390px]:h-[40px] min-[390px]:text-[0.82rem]"
            >
              Inscrivez-vous
            </button>
          </motion.div>
        ) : null}
      </section>

      <section ref={heroRef} className="relative hidden min-h-[calc(100dvh-116px)] flex-col overflow-hidden md:flex">
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
            <div className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[132%] w-[114%] -translate-x-1/2 -translate-y-1/2 rounded-[999px] bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,1)_0%,rgba(255,255,255,0.96)_38%,rgba(255,255,255,0.62)_64%,transparent_88%)] opacity-[0.94] blur-3xl" aria-hidden="true" />
            <h1 className="font-display text-[3.95rem] font-bold leading-[0.96] tracking-normal text-[#21314b] dark:text-white dark:drop-shadow-[0_0_30px_rgba(255,255,255,0.16)] lg:text-[5.15rem]">
              <span className="block">Réservez, commandez et profitez</span>
              <span className="block italic text-[#ff6b1c]">des meilleures offres food à Genève</span>
            </h1>
            <p className="mx-auto max-w-[760px] text-[1.35rem] font-medium text-[#33445e] dark:text-slate-100 md:text-[1.55rem]">
              Gagnez du temps, cumulez des <span className="font-semibold text-[#ff6b1c]">Miamz</span> et transformez vos repas en impact solidaire.
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

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="submit"
                className="group relative h-[68px] overflow-hidden rounded-full bg-[#ff6b1c] px-6 text-base font-extrabold uppercase tracking-[0.06em] text-white shadow-[0_22px_46px_rgba(255,107,28,0.34)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#ff7528] hover:shadow-[0_26px_54px_rgba(255,107,28,0.42)] active:translate-y-0"
              >
                <span className="pointer-events-none absolute inset-x-10 top-1 h-12 rounded-full bg-white/20 blur-2xl" />
                <span className="relative inline-flex items-center justify-center gap-2">
                  <Search className="h-5 w-5" />
                  Je veux manger
                </span>
              </button>
              <button
                type="button"
                onClick={() => navigate("/restaurateurs/geneve")}
                className="h-[68px] rounded-full border border-white/90 bg-white px-6 text-base font-extrabold uppercase tracking-[0.05em] text-[#25354e] shadow-[0_18px_40px_rgba(104,70,29,0.14)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#fff7f1] active:translate-y-0 dark:border-orange-200/30 dark:bg-slate-950/90 dark:text-white"
              >
                <span className="inline-flex items-center justify-center gap-2">
                  <ChefHat className="h-5 w-5 text-[#ff6b1c]" />
                  Je suis restaurateur
                </span>
              </button>
            </div>
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
              <span className="text-sm font-bold text-[#25354e] dark:text-white">Restaurants locaux partenaires</span>
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

      <Dialog open={showNewsletterConditions} onOpenChange={setShowNewsletterConditions}>
        <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-lg rounded-2xl p-0">
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
