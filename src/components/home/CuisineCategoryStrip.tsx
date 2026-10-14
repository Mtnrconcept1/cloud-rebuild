import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Utensils } from "lucide-react";

import SectionShowcaseHeader from "@/components/home/SectionShowcaseHeader";

type CuisineCategory = {
  slug: string;
  label: string;
  imageSrc: string;
};

// Visuels carrés avec intitulé intégré. Les autres catégories gardent leur ancien rendu.
const CATEGORIES_3D = new Set([
  "chinois", "creole", "suisse", "francais", "gastronomique", "grillades",
  "halal", "healthy", "indien", "japonais", "kebab", "libanais",
  "marocain", "mediterraneen", "mexicain", "pakistanais", "pates",
  "patisserie", "petit-dejeuner", "pizza", "poke", "ramen",
  "salades", "sandwich", "street-food", "sushi", "thai", "turc",
  "vegan", "vegetarien",
]);

const CUISINE_CATEGORIES: CuisineCategory[] = [
  { slug: "gastronomique", label: "Gastronomique", imageSrc: "/images/miniatures/12_gastronomique.webp" },
  { slug: "italien", label: "Italien", imageSrc: "/images/miniatures/17_italien.webp" },
  { slug: "pizza", label: "Pizza", imageSrc: "/images/miniatures/25_pizza.webp" },
  { slug: "sushi", label: "Sushi", imageSrc: "/images/miniatures/26_sushi.webp" },
  { slug: "bistro", label: "Bistro", imageSrc: "/images/miniatures/03_bistro.webp" },
  { slug: "burger", label: "Burger", imageSrc: "/images/miniatures/06_burger.webp" },
  { slug: "japonais", label: "Japonais", imageSrc: "/images/miniatures/18_japonais.webp" },
  { slug: "francais", label: "Français", imageSrc: "/images/miniatures/11_francais.webp" },
  { slug: "ramen", label: "Ramen", imageSrc: "/images/miniatures/27_ramen.webp" },
  { slug: "chinois", label: "Chinois", imageSrc: "/images/miniatures/08_chinois.webp" },
  { slug: "thai", label: "Thaï", imageSrc: "/images/miniatures/28_thai.webp" },
  { slug: "indien", label: "Indien", imageSrc: "/images/miniatures/16_indien.webp" },
  { slug: "libanais", label: "Libanais", imageSrc: "/images/miniatures/20_libanais.webp" },
  { slug: "turc", label: "Turc", imageSrc: "/images/miniatures/29_turc.webp" },
  { slug: "kebab", label: "Kebab", imageSrc: "/images/miniatures/19_kebab.webp" },
  { slug: "mexicain", label: "Mexicain", imageSrc: "/images/miniatures/23_mexicain.webp" },
  { slug: "marocain", label: "Marocain", imageSrc: "/images/miniatures/21_marocain.webp" },
  { slug: "mediterraneen", label: "Méditerranéen", imageSrc: "/images/miniatures/22_mediterranee.webp" },
  { slug: "africain", label: "Africain", imageSrc: "/images/miniatures/01_africain.webp" },
  { slug: "creole", label: "Créole", imageSrc: "/images/miniatures/09_creole.webp" },
  { slug: "americain", label: "Américain", imageSrc: "/images/miniatures/02_americain.webp" },
  { slug: "suisse", label: "Fondue Suisse", imageSrc: "/images/miniatures/34_fondue-suisse.webp" },
  { slug: "pates", label: "Pâtes", imageSrc: "/images/miniatures/33_pates.webp" },
  { slug: "grillades", label: "Grillades", imageSrc: "/images/miniatures/13_grillades.webp" },
  { slug: "pakistanais", label: "Pakistanais", imageSrc: "/images/miniatures/24_pakistanais.webp" },
  { slug: "halal", label: "Halal", imageSrc: "/images/miniatures/14_halal.webp" },
  { slug: "vegetarien", label: "Végétarien", imageSrc: "/images/miniatures/38_vegetarien.webp" },
  { slug: "vegan", label: "Vegan", imageSrc: "/images/miniatures/39_vegan.webp" },
  { slug: "healthy", label: "Healthy", imageSrc: "/images/miniatures/15_healthy.webp" },
  { slug: "salades", label: "Salades", imageSrc: "/images/miniatures/30_salades.webp" },
  { slug: "poke", label: "Poké", imageSrc: "/images/miniatures/31_poke.webp" },
  { slug: "brunch", label: "Brunch", imageSrc: "/images/miniatures/05_brunch.webp" },
  { slug: "petit-dejeuner", label: "Petit-déjeuner", imageSrc: "/images/miniatures/32_petit-dejeuner.webp" },
  { slug: "boulangerie", label: "Boulangerie", imageSrc: "/images/miniatures/04_boulangerie.webp" },
  { slug: "patisserie", label: "Pâtisserie", imageSrc: "/images/miniatures/35_patisserie.webp" },
  { slug: "desserts", label: "Desserts", imageSrc: "/images/miniatures/10_desserts.webp" },
  { slug: "cafe", label: "Café", imageSrc: "/images/miniatures/07_cafe.webp" },
  { slug: "sandwich", label: "Sandwich", imageSrc: "/images/miniatures/36_sandwich.webp" },
  { slug: "street-food", label: "Street-food", imageSrc: "/images/miniatures/37_street-food.webp" },
].map((category) => CATEGORIES_3D.has(category.slug)
  ? { ...category, imageSrc: `/miniatures-3d/${category.slug === "suisse" ? "fondue-suisse" : category.slug}.webp` }
  : category,
).sort((a, b) => a.label.localeCompare(b.label, "fr"));

function CuisinePhoto({ src, label, isActive, hasIntegratedLabel }: { src: string; label: string; isActive: boolean; hasIntegratedLabel: boolean }) {
  return (
    <span
      className={[
        "flex h-20 w-20 items-center justify-center rounded-[20px] border bg-background shadow-[0_6px_20px_rgba(15,23,42,0.06)] transition-[border-color,box-shadow] sm:h-24 sm:w-24 md:h-36 md:w-36 md:rounded-[26px]",
        isActive ? "border-primary ring-2 ring-primary/20" : "border-border/80 group-hover:border-primary/60 group-hover:shadow-md",
      ].join(" ")}
    >
      {hasIntegratedLabel ? (
        <img
          src={src}
          alt={`Cuisine ${label} : illustration photographique de la catégorie`}
          width={144}
          height={144}
          loading="lazy"
          decoding="async"
          className="h-full w-full rounded-[19px] object-contain sm:rounded-[23px] md:rounded-[25px]"
        />
      ) : (
        <span className="h-16 w-16 overflow-hidden rounded-full border border-border/50 sm:h-[72px] sm:w-[72px] md:h-24 md:w-24">
          <img src={src} alt={`Cuisine ${label}`} width={96} height={96} loading="lazy" decoding="async" className="h-full w-full object-cover" />
        </span>
      )}
    </span>
  );
}

export default function CuisineCategoryStrip({ activeSlug, homeVariant = false }: { activeSlug?: string; homeVariant?: boolean }) {
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    const amount = 240;
    scrollRef.current.scrollBy({
      left: direction === "left" ? -amount : amount,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  };

  const handleClick = (slug: string) => {
    navigate(`/recherche?q=${encodeURIComponent(slug)}`);
  };

  return (
    <section className={homeVariant ? "tok-home-cuisine-strip relative overflow-hidden py-6 md:py-8" : "relative overflow-hidden py-6 md:py-8"}>
      <div className="container px-4">
        <SectionShowcaseHeader
          title={homeVariant ? "Explorez par cuisine" : "À chaque envie, sa cuisine"}
          subtitle="À votre goût"
          icon={Utensils}
          iconColor="text-primary"
          imageSrc="/images/section-headers/tok-editorial-cuisine-full.webp"
          description="Des saveurs du monde, près de chez vous."
          theme="orange"
          className="mb-4"
          actions={
            <div className="hidden items-center gap-1.5 md:flex">
              <button
                type="button"
                onClick={() => scroll("left")}
                className="grid h-[44px] w-[44px] place-items-center rounded-full border border-border bg-background shadow-sm transition hover:bg-muted"
                aria-label="Défiler à gauche"
              >
                <ChevronLeft className="h-4.5 w-4.5" />
              </button>
              <button
                type="button"
                onClick={() => scroll("right")}
                className="grid h-[44px] w-[44px] place-items-center rounded-full border border-border bg-background shadow-sm transition hover:bg-muted"
                aria-label="Défiler à droite"
              >
                <ChevronRight className="h-4.5 w-4.5" />
              </button>
            </div>
          }
        />

        <div
          ref={scrollRef}
          className="flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-3 pt-4 md:gap-4"
        >
          {CUISINE_CATEGORIES.map((cat) => {
            const isActive = cat.slug === activeSlug;

            return (
              <button
                key={cat.slug}
                type="button"
                onClick={() => handleClick(cat.slug)}
                className="group flex min-h-11 w-[84px] shrink-0 snap-start flex-col items-center gap-2 rounded-xl px-0.5 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:w-28 md:w-40"
                aria-pressed={isActive}
                aria-label={cat.label}
              >
                <CuisinePhoto src={cat.imageSrc} label={cat.label} isActive={isActive} hasIntegratedLabel={CATEGORIES_3D.has(cat.slug)} />
                {!CATEGORIES_3D.has(cat.slug) && (
                  <span
                    className={[
                      "w-full break-words text-center text-[13px] font-bold leading-snug tracking-tight transition-colors sm:text-base md:text-lg md:leading-6",
                      isActive ? "text-primary" : "text-foreground group-hover:text-primary",
                    ].join(" ")}
                  >
                    {cat.label}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
