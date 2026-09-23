import { ArrowRight, Check } from "lucide-react";
import { Link } from "react-router-dom";

import DesktopHomeExperienceConnected from "@/components/home/DesktopHomeExperienceConnected";

export default function DesktopHomeHero() {
  return (
    <>
      <section
        data-testid="desktop-home-hero"
        className="relative hidden h-[310px] overflow-hidden border-b border-black/10 bg-[#f6b01b] lg:block"
        aria-label="Découvrir les restaurants TOK à Genève"
      >
        <div
          className="absolute inset-0 bg-[url('/chefbg.webp')] bg-cover bg-[position:center_42%] bg-no-repeat"
          aria-hidden="true"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(247,177,27,0.94)_0%,rgba(247,177,27,0.72)_24%,rgba(247,177,27,0.12)_48%,rgba(247,177,27,0.08)_72%,rgba(247,177,27,0.3)_100%)]" aria-hidden="true" />
        <div className="absolute inset-y-0 left-0 w-[64%] bg-[radial-gradient(circle_at_52%_48%,rgba(255,255,255,0.12),transparent_38%)]" aria-hidden="true" />

        <div className="absolute inset-y-0 left-0 z-20 flex w-[35%] items-center pl-[clamp(2rem,3.2vw,4.3rem)]">
          <div className="-rotate-2">
            <h2 className="relative inline-block bg-black px-5 pb-4 pt-3 text-white shadow-[0_12px_28px_rgba(0,0,0,0.28)] [clip-path:polygon(1%_5%,98%_0,100%_87%,3%_100%)]">
              <span className="block text-[clamp(2rem,3.15vw,3.65rem)] font-black italic leading-[0.88] tracking-[-0.055em]">GENÈVE</span>
              <span className="mt-1 block whitespace-nowrap text-[clamp(1.55rem,2.5vw,2.95rem)] font-black italic leading-[0.88] tracking-[-0.05em]">
                À TABLE AVEC <span className="text-[#ffd400]">TOK !</span>
              </span>
            </h2>
            <p className="-mt-1 ml-8 inline-block rotate-1 bg-[#ffd400] px-7 py-2 text-[clamp(0.83rem,1.05vw,1.08rem)] font-black italic text-[#171717] shadow-[0_8px_16px_rgba(0,0,0,0.14)] [clip-path:polygon(3%_12%,100%_0,97%_88%,0_100%)]">
              Les meilleures tables, aux meilleurs prix.
            </p>
          </div>
        </div>

        <div className="absolute left-[44%] top-[34px] z-30 -rotate-6 rounded-[50%] border-[3px] border-black bg-white px-3 py-2 text-lg font-black italic text-black shadow-md">
          Miamz!
        </div>

        <div className="absolute right-[19%] top-[70px] z-20 w-[18%] -rotate-2 text-[clamp(1rem,1.3vw,1.4rem)] font-black italic leading-[1.05] text-[#171717] drop-shadow-[0_1px_0_rgba(255,255,255,0.9)]">
          <span className="block">Bonnes tables</span>
          <span className="block">Bons moments</span>
          <span className="block">Toujours avec TOK !</span>
        </div>

        <aside className="absolute inset-y-0 right-0 z-30 flex w-[18%] min-w-[245px] flex-col justify-center bg-[linear-gradient(135deg,rgba(255,217,0,0.94)_0%,rgba(255,189,0,0.96)_62%,rgba(255,157,0,0.98)_100%)] px-[clamp(1rem,1.8vw,2rem)] text-[#111] shadow-[-18px_0_30px_rgba(0,0,0,0.08)]">
          <p className="text-[clamp(1.12rem,1.55vw,1.65rem)] font-black italic leading-[0.98] tracking-[-0.035em]">
            Des expériences gastronomiques jusqu’à <span className="text-[#ef2d16]">-50%</span>
          </p>
          <ul className="mt-3 space-y-1 text-[clamp(0.72rem,0.82vw,0.88rem)] font-bold leading-tight">
            <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 stroke-[3]" />Les meilleures tables</li>
            <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 stroke-[3]" />Réservation instantanée</li>
            <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 stroke-[3]" />Offres exclusives</li>
            <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 stroke-[3]" />Sans attente</li>
          </ul>
          <Link
            to="/recherche?sort=promotion&promo=true"
            className="mt-3 inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[#ff391c] px-4 text-sm font-black text-white shadow-[0_10px_20px_rgba(216,45,16,0.28)] transition hover:bg-[#ed2f14]"
          >
            Voir toutes les offres <ArrowRight className="h-4 w-4" />
          </Link>
        </aside>
      </section>
      <DesktopHomeExperienceConnected />
    </>
  );
}
