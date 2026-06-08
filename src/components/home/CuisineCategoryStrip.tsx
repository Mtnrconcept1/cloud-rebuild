import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";

type CuisineCategory = {
  slug: string;
  label: string;
  imageSrc: string;
};

const CUISINE_CATEGORIES: CuisineCategory[] = [
  { slug: "gastronomique", label: "Gastronomique", imageSrc: "/images/miniatures/12_gastronomique.png" },
  { slug: "italien", label: "Italien", imageSrc: "/images/miniatures/17_italien.png" },
  { slug: "pizza", label: "Pizza", imageSrc: "/images/miniatures/25_pizza.png" },
  { slug: "sushi", label: "Sushi", imageSrc: "/images/miniatures/26_sushi.png" },
  { slug: "bistro", label: "Bistro", imageSrc: "/images/miniatures/03_bistro.png" },
  { slug: "burger", label: "Burger", imageSrc: "/images/miniatures/06_burger.png" },
  { slug: "japonais", label: "Japonais", imageSrc: "/images/miniatures/18_japonais.png" },
  { slug: "francais", label: "Français", imageSrc: "/images/miniatures/11_francais.png" },
  { slug: "ramen", label: "Ramen", imageSrc: "/images/miniatures/27_ramen.png" },
  { slug: "chinois", label: "Chinois", imageSrc: "/images/miniatures/08_chinois.png" },
  { slug: "thai", label: "Thaï", imageSrc: "/images/miniatures/28_thai.png" },
  { slug: "indien", label: "Indien", imageSrc: "/images/miniatures/16_indien.png" },
  { slug: "libanais", label: "Libanais", imageSrc: "/images/miniatures/20_libanais.png" },
  { slug: "turc", label: "Turc", imageSrc: "/images/miniatures/29_turc.png" },
  { slug: "kebab", label: "Kebab", imageSrc: "/images/miniatures/19_kebab.png" },
  { slug: "mexicain", label: "Mexicain", imageSrc: "/images/miniatures/23_mexicain.png" },
  { slug: "marocain", label: "Marocain", imageSrc: "/images/miniatures/21_marocain.png" },
  { slug: "mediterraneen", label: "Méditerranéen", imageSrc: "/images/miniatures/22_mediterranee.png" },
  { slug: "africain", label: "Africain", imageSrc: "/images/miniatures/01_africain.png" },
  { slug: "creole", label: "Créole", imageSrc: "/images/miniatures/09_creole.png" },
  { slug: "americain", label: "Américain", imageSrc: "/images/miniatures/02_americain.png" },
  { slug: "suisse", label: "Fondue Suisse", imageSrc: "/images/miniatures/34_fondue-suisse.png" },
  { slug: "pates", label: "Pâtes", imageSrc: "/images/miniatures/33_pates.png" },
  { slug: "grillades", label: "Grillades", imageSrc: "/images/miniatures/13_grillades.png" },
  { slug: "pakistanais", label: "Pakistanais", imageSrc: "/images/miniatures/24_pakistanais.png" },
  { slug: "halal", label: "Halal", imageSrc: "/images/miniatures/14_halal.png" },
  { slug: "vegetarien", label: "Végétarien", imageSrc: "/images/miniatures/38_vegetarien.png" },
  { slug: "vegan", label: "Vegan", imageSrc: "/images/miniatures/39_vegan.png" },
  { slug: "healthy", label: "Healthy", imageSrc: "/images/miniatures/15_healthy.png" },
  { slug: "salades", label: "Salades", imageSrc: "/images/miniatures/30_salades.png" },
  { slug: "poke", label: "Poké", imageSrc: "/images/miniatures/31_poke.png" },
  { slug: "brunch", label: "Brunch", imageSrc: "/images/miniatures/05_brunch.png" },
  { slug: "petit-dejeuner", label: "Petit-déjeuner", imageSrc: "/images/miniatures/32_petit-dejeuner.png" },
  { slug: "boulangerie", label: "Boulangerie", imageSrc: "/images/miniatures/04_boulangerie.png" },
  { slug: "patisserie", label: "Pâtisserie", imageSrc: "/images/miniatures/35_patisserie.png" },
  { slug: "desserts", label: "Desserts", imageSrc: "/images/miniatures/10_desserts.png" },
  { slug: "cafe", label: "Café", imageSrc: "/images/miniatures/07_cafe.png" },
  { slug: "sandwich", label: "Sandwich", imageSrc: "/images/miniatures/36_sandwich.png" },
  { slug: "street-food", label: "Street-food", imageSrc: "/images/miniatures/37_street-food.png" },
].sort((a, b) => a.label.localeCompare(b.label, "fr"));

function CuisinePhoto({
  src,
  label,
  isActive,
}: {
  src: string;
  label: string;
  isActive: boolean;
}) {
  return (
    <div className="relative h-[101px] w-[101px] md:h-[117px] md:w-[117px]">
      <div
        className={[
          "relative h-full w-full overflow-hidden rounded-[35px] md:rounded-[40px]",
          "transition-all duration-300",
          isActive
            ? "scale-105 ring-2 ring-[#E63900]/70 shadow-[0_10px_24px_rgba(230,57,0,0.24)] dark:ring-orange-300/80 dark:shadow-[0_0_34px_rgba(249,115,22,0.34)]"
            : "ring-1 ring-black/5 shadow-[0_6px_18px_rgba(15,23,42,0.08)] group-hover:-translate-y-1 group-hover:shadow-[0_12px_28px_rgba(15,23,42,0.14)] dark:ring-white/12 dark:shadow-[0_16px_42px_rgba(0,0,0,0.42)] dark:group-hover:shadow-[0_0_32px_rgba(249,115,22,0.20)]",
        ].join(" ")}
      >
        <img
          src={src}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          className={[
            "h-full w-full object-cover transition-transform duration-500 ease-out",
            isActive ? "scale-110" : "group-hover:scale-110",
          ].join(" ")}
        />
        <div
          className={[
            "absolute inset-0 bg-gradient-to-b transition-opacity duration-300",
            isActive
              ? "from-white/8 via-transparent to-[#E63900]/22 dark:to-orange-500/36"
              : "from-white/18 via-transparent to-black/20 group-hover:to-black/28 dark:from-white/8 dark:to-black/44 dark:group-hover:to-orange-950/42",
          ].join(" ")}
        />
        <div className="absolute inset-[8px] rounded-[27px] border border-white/35 md:inset-[9px] md:rounded-[32px]" />
      </div>

      <div
        aria-hidden="true"
        className={[
          "pointer-events-none absolute left-1/2 top-[-18px] z-10 ml-4 -translate-x-1/2 md:top-[-22px] md:ml-5",
          "origin-bottom-left transition-transform duration-300 ease-out",
          "group-hover:scale-110 group-hover:-rotate-[8deg]",
        ].join(" ")}
      >
        <span
          className={[
            "inline-flex items-center justify-center bg-no-repeat",
            "px-3.5 pt-2 pb-5 md:px-4 md:pt-2.5 md:pb-6",
            "text-center text-[12px] leading-none tracking-wide antialiased md:text-[14px]",
            "whitespace-nowrap drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)]",
            isActive ? "text-[#E63900]" : "text-stone-900 dark:text-slate-950",
          ].join(" ")}
          style={{
            backgroundImage: "url(/images/miniatures/bulle.png)",
            backgroundSize: "100% 100%",
            fontFamily: "'Bubblegum Sans', cursive",
          }}
        >
          {label}
        </span>
      </div>
    </div>
  );
}

export default function CuisineCategoryStrip({ activeSlug }: { activeSlug?: string }) {
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    const amount = 240;
    scrollRef.current.scrollBy({
      left: direction === "left" ? -amount : amount,
      behavior: "smooth",
    });
  };

  const handleClick = (slug: string) => {
    navigate(`/recherche?q=${encodeURIComponent(slug)}`);
  };

  return (
    <section className="relative overflow-hidden bg-background py-4 dark:bg-[radial-gradient(circle_at_20%_0%,rgba(249,115,22,0.10),transparent_24rem)] md:py-6">
      <div className="container px-4">
        <div className="mb-4 flex items-center justify-between rounded-xl border border-primary/15 bg-primary/10 px-4 py-3 shadow-[0_12px_34px_rgba(15,23,42,0.045)] dark:border-orange-300/20 dark:bg-orange-500/15">
          <h2 className="font-display text-base font-bold text-foreground dark:text-white md:text-xl">Explorer par cuisine</h2>
          <div className="hidden items-center gap-1.5 md:flex">
            <button
              type="button"
              onClick={() => scroll("left")}
              className="neon-chip grid h-[44px] w-[44px] place-items-center rounded-full border border-border bg-background shadow-sm transition hover:bg-muted"
              aria-label="Défiler à gauche"
            >
              <ChevronLeft className="h-4.5 w-4.5" />
            </button>
            <button
              type="button"
              onClick={() => scroll("right")}
              className="neon-chip grid h-[44px] w-[44px] place-items-center rounded-full border border-border bg-background shadow-sm transition hover:bg-muted"
              aria-label="Défiler à droite"
            >
              <ChevronRight className="h-4.5 w-4.5" />
            </button>
          </div>
        </div>

        <div
          ref={scrollRef}
          className="flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-4 pt-8 scrollbar-hide md:gap-5 md:pt-10"
        >
          {CUISINE_CATEGORIES.map((cat, index) => {
            const isActive = cat.slug === activeSlug;

            return (
              <motion.button
                key={cat.slug}
                type="button"
                onClick={() => handleClick(cat.slug)}
                initial={{ opacity: 0, scale: 0.9, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ delay: index * 0.03, type: "spring", stiffness: 260, damping: 20 }}
                className="group flex shrink-0 snap-start flex-col items-center gap-2.5"
                style={{ minWidth: 112 }}
                aria-label={cat.label}
              >
                <CuisinePhoto src={cat.imageSrc} label={cat.label} isActive={isActive} />
                <span
                  className={[
                    "w-full max-w-[117px] text-center text-[12px] font-bold transition-colors line-clamp-1 md:text-[14px]",
                    isActive ? "text-[#E63900] dark:text-orange-300 dark:drop-shadow-[0_0_14px_rgba(249,115,22,0.36)]" : "text-stone-600 group-hover:text-[#E63900] dark:text-slate-200 dark:group-hover:text-orange-300",
                  ].join(" ")}
                >
                  {cat.label}
                </span>
              </motion.button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
