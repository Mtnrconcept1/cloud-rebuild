import { useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";

type CuisineCategory = {
  slug: string;
  label: string;
  emoji: string;
};

// We use emojicdn with the 'apple' style which provides very high-quality 
// 3D-like minimalist PNGs that fit perfectly into modern UI squircles.
const EmojiIcon = ({ symbol, isAnimating }: { symbol: string, isAnimating?: boolean }) => {
  return (
    <motion.img 
      src={`https://emojicdn.elk.sh/${symbol}?style=apple`} 
      alt="icon"
      className="w-full h-full object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.4)] saturate-[1.15]"
      crossOrigin="anonymous"
      loading="lazy"
      animate={isAnimating ? {
        y: [0, -18, 0],
        rotate: [0, -10, 10, -5, 5, 0],
        scale: [1, 1.15, 1]
      } : {
        y: 0,
        rotate: 0,
        scale: 1
      }}
      transition={{
        duration: 0.8,
        ease: "easeInOut"
      }}
    />
  );
};

const CUISINE_CATEGORIES: CuisineCategory[] = [
  { slug: "gastronomique", label: "Gastronomique", emoji: "🛎️" },
  { slug: "italien", label: "Italien", emoji: "🍕" },
  { slug: "pizza", label: "Pizza", emoji: "🍕" },
  { slug: "sushi", label: "Sushi", emoji: "🍣" },
  { slug: "bistro", label: "Bistro", emoji: "🍷" },
  { slug: "burger", label: "Burger", emoji: "🍔" },
  { slug: "japonais", label: "Japonais", emoji: "🍱" },
  { slug: "francais", label: "Français", emoji: "🥖" },
  { slug: "ramen", label: "Ramen", emoji: "🍜" },
  { slug: "chinois", label: "Chinois", emoji: "🥡" },
  { slug: "thai", label: "Thaï", emoji: "🍲" },
  { slug: "indien", label: "Indien", emoji: "🍛" },
  { slug: "libanais", label: "Libanais", emoji: "🧆" },
  { slug: "turc", label: "Turc", emoji: "🥙" },
  { slug: "kebab", label: "Kebab", emoji: "🥙" },
  { slug: "tacos", label: "Tacos", emoji: "🌮" },
  { slug: "mexicain", label: "Mexicain", emoji: "🌯" },
  { slug: "marocain", label: "Marocain", emoji: "🥘" },
  { slug: "mediterraneen", label: "Méditerranéen", emoji: "🥗" },
  { slug: "africain", label: "Africain", emoji: "🍗" },
  { slug: "creole", label: "Créole", emoji: "🦐" },
  { slug: "americain", label: "Américain", emoji: "🌭" },
  { slug: "suisse", label: "Suisse", emoji: "🫕" },
  { slug: "pates", label: "Pâtes", emoji: "🍝" },
  { slug: "grillades", label: "Grillades", emoji: "🥩" },
  { slug: "pakistanais", label: "Pakistanais", emoji: "🍛" },
  { slug: "halal", label: "Halal", emoji: "🍖" },
  { slug: "vegetarien", label: "Végétarien", emoji: "🥦" },
  { slug: "vegan", label: "Végan", emoji: "🥑" },
  { slug: "healthy", label: "Healthy", emoji: "🥗" },
  { slug: "salades", label: "Salades", emoji: "🥗" },
  { slug: "poke", label: "Poké", emoji: "🥣" },
  { slug: "brunch", label: "Brunch", emoji: "🥞" },
  { slug: "petit-dejeuner", label: "Petit-déj", emoji: "🥐" },
  { slug: "boulangerie", label: "Boulangerie", emoji: "🥨" },
  { slug: "patisserie", label: "Pâtisserie", emoji: "🧁" },
  { slug: "desserts", label: "Desserts", emoji: "🍰" },
  { slug: "cafe", label: "Café", emoji: "☕" },
  { slug: "sandwich", label: "Sandwich", emoji: "🥪" },
  { slug: "street-food", label: "Street Food", emoji: "🍟" },
].sort((a, b) => a.label.localeCompare(b.label, "fr"));


export default function CuisineCategoryStrip({ activeSlug }: { activeSlug?: string }) {
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [animatingIndex, setAnimatingIndex] = useState<number | null>(null);

  useEffect(() => {
    // Toutes les 8 secondes, on anime un icône au hasard
    const interval = setInterval(() => {
      setAnimatingIndex(Math.floor(Math.random() * CUISINE_CATEGORIES.length));
      
      // On retire l'état d'animation après 1 seconde pour que la boucle puisse se refaire
      setTimeout(() => setAnimatingIndex(null), 90000);
    }, 1500);

    return () => clearInterval(interval);
  }, []);

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
    <section className="relative bg-background py-4 md:py-6 overflow-hidden">
      <div className="container px-4">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-base font-bold text-foreground md:text-xl">Explorer par cuisine</h2>
          <div className="hidden md:flex items-center gap-1.5">
            <button
              onClick={() => scroll("left")}
              className="grid h-9 w-9 place-items-center rounded-full border border-border bg-background shadow-sm transition hover:bg-muted"
              aria-label="Défiler à gauche"
            >
              <ChevronLeft className="h-4.5 w-4.5" />
            </button>
            <button
              onClick={() => scroll("right")}
              className="grid h-9 w-9 place-items-center rounded-full border border-border bg-background shadow-sm transition hover:bg-muted"
              aria-label="Défiler à droite"
            >
              <ChevronRight className="h-4.5 w-4.5" />
            </button>
          </div>
        </div>

        {/* Scrollable strip */}
        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto pb-4 pt-1 -mt-1 scrollbar-hide snap-x snap-mandatory md:gap-5 px-1"
        >
          {CUISINE_CATEGORIES.map((cat, i) => {
            const isActive = cat.slug === activeSlug;
            return (
              <motion.button
                key={cat.slug}
                onClick={() => handleClick(cat.slug)}
                initial={{ opacity: 0, scale: 0.9, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ delay: i * 0.03, type: "spring", stiffness: 260, damping: 20 }}
                className="group flex flex-col items-center gap-2.5 snap-start shrink-0"
                style={{ minWidth: 84 }}
              >
                <div
                  className={`
                    relative h-[76px] w-[76px] md:h-[88px] md:w-[88px] flex items-center justify-center transition-all duration-300
                    rounded-[26px] md:rounded-[30px] 
                    ${isActive 
                      ? "bg-gradient-to-br from-[#FF7A00] to-[#E63900] shadow-[0_8px_20px_rgba(230,57,0,0.35)] scale-105 border-2 border-orange-200/50" 
                      : "bg-gradient-to-br from-white via-orange-50/70 to-orange-100 shadow-[0_4px_16px_rgba(249,115,22,0.1)] border border-white group-hover:shadow-[0_8px_24px_rgba(249,115,22,0.18)] group-hover:to-orange-200/80 group-hover:-translate-y-1"}
                  `}
                >
                  <div className="w-full h-full relative z-10 p-2.5">
                    <EmojiIcon symbol={cat.emoji} isAnimating={animatingIndex === i} />
                  </div>
                </div>
                <span 
                  className={`text-[12px] md:text-[14px] font-bold transition-colors line-clamp-1 w-full max-w-[88px] text-center
                    ${isActive 
                      ? "text-[#E63900]" 
                      : "text-stone-600 dark:text-stone-300 group-hover:text-[#E63900]"}
                  `}
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
