import React, { useCallback } from "react";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import { ChevronLeft, ChevronRight, Sparkles, Target, Zap } from "lucide-react";
import { Link } from "react-router-dom";

import { useActiveFeatures } from "@/lib/featureFlags";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const PROMOS = [
  {
    title: "Offres Anti-Gaspi",
    desc: "Sauvez des repas delicieux a prix reduit.",
    img: "/images/lebanese-mezze.jpeg",
    link: "/anti-gaspi",
    badge: "Populaire",
    icon: Zap,
    feature: "anti-gaspi",
  },
  {
    title: "Programme Fidelite",
    desc: "Gagnez des Miamz a chaque commande.",
    img: "/images/mixed-grill-platter.jpeg",
    link: "/profil",
    badge: "Nouveau",
    icon: Sparkles,
  },
  {
    title: "La Table du Chef",
    desc: "Decouvrez des plats exclusifs en edition limitee.",
    img: "/images/octopus-fine-dining.jpeg",
    link: "/chefs-table",
    badge: "Exclusif",
    icon: Target,
    feature: "chefs-table",
  },
];

export default function PromoCarousel() {
  const activeFeatures = useActiveFeatures();
  const visiblePromos = PROMOS.filter((promo) => !promo.feature || activeFeatures.has(promo.feature));
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true }, [Autoplay({ delay: 5000 })]);
  const scrollPrev = useCallback(() => emblaApi && emblaApi.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi && emblaApi.scrollNext(), [emblaApi]);

  if (visiblePromos.length === 0) return null;

  return (
    <div className="relative group max-w-[1400px] mx-auto overflow-hidden rounded-3xl shadow-xl">
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex">
          {visiblePromos.map((promo, index) => (
            <div key={`${promo.link}-${index}`} className="flex-[0_0_100%] min-w-0 relative">
              <div className="absolute inset-0 z-10 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              <img src={promo.img} alt={promo.title} className="h-[300px] w-full object-cover md:h-[450px]" />
              <div className="absolute inset-0 z-20 flex flex-col justify-end space-y-4 p-8 text-white md:p-16">
                <div className="flex items-center gap-2">
                  <Badge className="border-none bg-white/20 text-white backdrop-blur-md">
                    <promo.icon className="mr-1 h-3 w-3" />
                    {promo.badge}
                  </Badge>
                </div>
                <div className="max-w-2xl space-y-2">
                  <h2 className="font-display text-4xl font-bold tracking-tight md:text-6xl">{promo.title}</h2>
                  <p className="text-lg font-medium text-white/80 md:text-xl">{promo.desc}</p>
                </div>
                <div className="pt-4">
                  <Button size="lg" className="rounded-full px-8 shadow-lg shadow-primary/20" asChild>
                    <Link to={promo.link}>En savoir plus</Link>
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={scrollPrev}
        className="absolute left-4 top-1/2 z-30 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white opacity-0 backdrop-blur-md transition-opacity hover:bg-white/20 group-hover:opacity-100"
      >
        <ChevronLeft className="h-6 w-6" />
      </button>
      <button
        onClick={scrollNext}
        className="absolute right-4 top-1/2 z-30 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white opacity-0 backdrop-blur-md transition-opacity hover:bg-white/20 group-hover:opacity-100"
      >
        <ChevronRight className="h-6 w-6" />
      </button>

      <div className="absolute bottom-6 left-1/2 z-30 flex -translate-x-1/2 gap-2">
        {visiblePromos.map((promo, index) => (
          <div key={`${promo.link}-dot-${index}`} className="h-1.5 w-1.5 rounded-full bg-white/50" />
        ))}
      </div>
    </div>
  );
}
