import React, { useCallback } from "react";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import { ChevronLeft, ChevronRight, Zap, Target, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";

const PROMOS = [
  { title: "Offres Anti-Gaspi", desc: "Sauvez des repas délicieux à prix réduit.", img: "/images/lebanese-mezze.jpeg", link: "/anti-gaspi", badge: "Populaire", icon: Zap, color: "from-emerald-500 to-teal-700" },
  { title: "Programme Fidélité", desc: "Gagnez des Miamz à chaque commande.", img: "/images/mixed-grill-platter.jpeg", link: "/profil", badge: "Nouveau", icon: Sparkles, color: "from-primary to-orange-700" },
  { title: "Chef's Table", desc: "Découvrez des plats exclusifs en édition limitée.", img: "/images/octopus-fine-dining.jpeg", link: "/chefs-table", badge: "Exclusif", icon: Target, color: "from-indigo-500 to-purple-700" },
];

export default function PromoCarousel() {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true }, [Autoplay({ delay: 5000 })]);
  const scrollPrev = useCallback(() => emblaApi && emblaApi.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi && emblaApi.scrollNext(), [emblaApi]);

  return (
    <div className="relative group max-w-[1400px] mx-auto overflow-hidden rounded-3xl shadow-xl">
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex">
          {PROMOS.map((promo, i) => (
            <div key={i} className="flex-[0_0_100%] min-w-0 relative">
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent z-10" />
              <img src={promo.img} alt={promo.title} className="w-full h-[300px] md:h-[450px] object-cover" />
              <div className="absolute inset-0 z-20 flex flex-col justify-end p-8 md:p-16 space-y-4 text-white">
                <div className="flex items-center gap-2">
                  <Badge className="bg-white/20 backdrop-blur-md border-none text-white"><promo.icon className="h-3 w-3 mr-1" />{promo.badge}</Badge>
                </div>
                <div className="space-y-2 max-w-2xl">
                  <h2 className="font-display text-4xl md:text-6xl font-bold tracking-tight">{promo.title}</h2>
                  <p className="text-white/80 text-lg md:text-xl font-medium">{promo.desc}</p>
                </div>
                <div className="pt-4">
                  <Button size="lg" className="rounded-full px-8 shadow-lg shadow-primary/20" asChild><Link to={promo.link}>En savoir plus</Link></Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <button onClick={scrollPrev} className="absolute left-4 top-1/2 -translate-y-1/2 z-30 w-12 h-12 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/20"><ChevronLeft className="h-6 w-6" /></button>
      <button onClick={scrollNext} className="absolute right-4 top-1/2 -translate-y-1/2 z-30 w-12 h-12 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/20"><ChevronRight className="h-6 w-6" /></button>
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex gap-2">{PROMOS.map((_, i) => <div key={i} className="w-1.5 h-1.5 rounded-full bg-white/50" />)}</div>
    </div>
  );
}
