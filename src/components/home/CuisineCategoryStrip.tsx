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
  { slug: "gastronomique", label: "Gastronomique", imageSrc: "/images/octopus-fine-dining.jpeg" },
  { slug: "italien", label: "Italien", imageSrc: "/images/prosciutto e rucola.avif" },
  { slug: "pizza", label: "Pizza", imageSrc: "/images/pizza diavola.avif" },
  { slug: "sushi", label: "Sushi", imageSrc: "/images/california roll.jpg" },
  { slug: "bistro", label: "Bistro", imageSrc: "/images/octopus-fine-dining.jpeg" },
  { slug: "burger", label: "Burger", imageSrc: "/images/gourmet-burgers.jpeg" },
  { slug: "japonais", label: "Japonais", imageSrc: "/images/salmon roll.webp" },
  { slug: "francais", label: "Français", imageSrc: "/images/filets de perche.jpg" },
  { slug: "ramen", label: "Ramen", imageSrc: "/images/ramen miso.jpg" },
  { slug: "chinois", label: "Chinois", imageSrc: "/images/gyoza porc.webp" },
  { slug: "thai", label: "Thaï", imageSrc: "/images/thai-pad-thai.jpeg" },
  { slug: "indien", label: "Indien", imageSrc: "/images/indian-feast.jpeg" },
  { slug: "libanais", label: "Libanais", imageSrc: "/images/lebanese-mezze.jpeg" },
  { slug: "turc", label: "Turc", imageSrc: "/images/greek-gyros.jpeg" },
  { slug: "kebab", label: "Kebab", imageSrc: "/images/doner-kebab-plate.jpeg" },
  { slug: "tacos", label: "Tacos", imageSrc: "/images/tacos carnitas.webp" },
  { slug: "mexicain", label: "Mexicain", imageSrc: "/images/quesadillas.jpeg" },
  { slug: "marocain", label: "Marocain", imageSrc: "/images/mixed-grill-platter.jpeg" },
  { slug: "mediterraneen", label: "Méditerranéen", imageSrc: "/images/lebanese-mezze.jpeg" },
  { slug: "africain", label: "Africain", imageSrc: "/images/rotisserie-chicken.jpeg" },
  { slug: "creole", label: "Créole", imageSrc: "/images/mixed-grill-platter.jpeg" },
  { slug: "americain", label: "Américain", imageSrc: "/images/burgers-wings.jpeg" },
  { slug: "suisse", label: "Suisse", imageSrc: "/images/raclette.jpg" },
  { slug: "pates", label: "Pâtes", imageSrc: "/images/pasta-assortment.jpeg" },
  { slug: "grillades", label: "Grillades", imageSrc: "/images/mixed-grill-platter.jpeg" },
  { slug: "pakistanais", label: "Pakistanais", imageSrc: "/images/byriani.jpg" },
  { slug: "halal", label: "Halal", imageSrc: "/images/rotisserie-chicken.jpeg" },
  { slug: "vegetarien", label: "Végétarien", imageSrc: "/images/veggie burger.jpg" },
  { slug: "vegan", label: "Végan", imageSrc: "/images/acai bowl.jpg" },
  { slug: "healthy", label: "Healthy", imageSrc: "/images/poke-bowls.jpeg" },
  { slug: "salades", label: "Salades", imageSrc: "/images/fattouche.webp" },
  { slug: "poke", label: "Poké", imageSrc: "/images/poke-bowls.jpeg" },
  { slug: "brunch", label: "Brunch", imageSrc: "/images/acai bowl.jpg" },
  { slug: "petit-dejeuner", label: "Petit-déj", imageSrc: "/images/acai bowl.jpg" },
  { slug: "boulangerie", label: "Boulangerie", imageSrc: "/images/naan.jpeg" },
  { slug: "patisserie", label: "Pâtisserie", imageSrc: "/images/tarte aux noix.webp" },
  { slug: "desserts", label: "Desserts", imageSrc: "/images/1.webp" },
  { slug: "cafe", label: "Café", imageSrc: "/images/1.webp" },
  { slug: "sandwich", label: "Sandwich", imageSrc: "/images/falafel wrap.jpeg" },
  { slug: "street-food", label: "Street Food", imageSrc: "/images/lobster-roll-fries.jpeg" },
].sort((a, b) => a.label.localeCompare(b.label, "fr"));

function CuisinePhoto({
  src,
  isActive,
}: {
  src: string;
  isActive: boolean;
}) {
  return (
    <div
      className={[
        "relative h-[76px] w-[76px] overflow-hidden rounded-[26px] md:h-[88px] md:w-[88px] md:rounded-[30px]",
        "transition-all duration-300",
        isActive
          ? "scale-105 ring-2 ring-[#E63900]/70 shadow-[0_10px_24px_rgba(230,57,0,0.24)]"
          : "ring-1 ring-black/5 shadow-[0_6px_18px_rgba(15,23,42,0.08)] group-hover:-translate-y-1 group-hover:shadow-[0_12px_28px_rgba(15,23,42,0.14)]",
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
            ? "from-white/8 via-transparent to-[#E63900]/22"
            : "from-white/18 via-transparent to-black/20 group-hover:to-black/28",
        ].join(" ")}
      />
      <div className="absolute inset-[6px] rounded-[20px] border border-white/35 md:inset-[7px] md:rounded-[24px]" />
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
    <section className="relative overflow-hidden bg-background py-4 md:py-6">
      <div className="container px-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-base font-bold text-foreground md:text-xl">Explorer par cuisine</h2>
          <div className="hidden items-center gap-1.5 md:flex">
            <button
              type="button"
              onClick={() => scroll("left")}
              className="grid h-9 w-9 place-items-center rounded-full border border-border bg-background shadow-sm transition hover:bg-muted"
              aria-label="Défiler à gauche"
            >
              <ChevronLeft className="h-4.5 w-4.5" />
            </button>
            <button
              type="button"
              onClick={() => scroll("right")}
              className="grid h-9 w-9 place-items-center rounded-full border border-border bg-background shadow-sm transition hover:bg-muted"
              aria-label="Défiler à droite"
            >
              <ChevronRight className="h-4.5 w-4.5" />
            </button>
          </div>
        </div>

        <div
          ref={scrollRef}
          className="-mt-1 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-4 pt-1 scrollbar-hide md:gap-5"
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
                style={{ minWidth: 84 }}
              >
                <CuisinePhoto src={cat.imageSrc} isActive={isActive} />
                <span
                  className={[
                    "w-full max-w-[88px] text-center text-[12px] font-bold transition-colors line-clamp-1 md:text-[14px]",
                    isActive ? "text-[#E63900]" : "text-stone-600 group-hover:text-[#E63900] dark:text-stone-300",
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
