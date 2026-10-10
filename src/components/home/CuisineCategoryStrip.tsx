import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Utensils } from "lucide-react";

import SectionShowcaseHeader from "@/components/home/SectionShowcaseHeader";

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

function CuisinePhoto({ src, isActive }: { src: string; isActive: boolean }) {
  return (
    <div className={["h-16 w-16 overflow-hidden rounded-full border transition-colors md:h-20 md:w-20", isActive ? "border-primary ring-2 ring-primary/25" : "border-border group-hover:border-primary"].join(" ")}>
      <img src={src} alt="" width={80} height={80} loading="lazy" decoding="async" className="h-full w-full object-cover" />
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
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  };

  const handleClick = (slug: string) => {
    navigate(`/recherche?q=${encodeURIComponent(slug)}`);
  };

  return (
    <section className="relative overflow-hidden py-6 md:py-8">
      <div className="container px-4">
        <SectionShowcaseHeader
          title="À chaque envie, sa cuisine"
          subtitle="À votre goût"
          icon={Utensils}
          iconColor="text-primary"
          imageSrc="/desig app/assiette.png"
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
          className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-3 pt-4 md:gap-4"
        >
          {CUISINE_CATEGORIES.map((cat) => {
            const isActive = cat.slug === activeSlug;

            return (
              <button
                key={cat.slug}
                type="button"
                onClick={() => handleClick(cat.slug)}
                className="group flex min-h-11 w-24 shrink-0 snap-start flex-col items-center gap-2 rounded-xl px-1 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                aria-pressed={isActive}
                aria-label={cat.label}
              >
                <CuisinePhoto src={cat.imageSrc} isActive={isActive} />
                <span
                  className={[
                    "w-full text-center text-xs font-medium leading-5",
                    isActive ? "text-primary" : "text-muted-foreground group-hover:text-primary",
                  ].join(" ")}
                >
                  {cat.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
