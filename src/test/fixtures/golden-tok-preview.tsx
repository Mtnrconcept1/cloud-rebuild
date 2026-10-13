import { createRoot } from "react-dom/client";
import type { ComponentProps } from "react";
import { Bell, ChefHat } from "lucide-react";
import { FeatureWizard } from "@/components/FeatureWizard";
import { ChefTableDropCard } from "@/pages/ChefsTable";
import "@/index.css";
import "@/styles/golden-tok-chefs-table.css";
import "@/styles/golden-tok-chefs-table-v2.css";
import "@/styles/golden-tok-chefs-table-v3.css";
import "@/styles/golden-tok-chefs-table-hero.css";
import "@/styles/golden-tok-chefs-table-v4.css";
import "@/styles/golden-tok-chefs-table-v5.css";


const sampleDrop: ComponentProps<typeof ChefTableDropCard>["drop"] = {
  id: "golden-tok-browser-sample",
  chef: "Chef partenaire TOK",
  restaurant: "Restaurant de démonstration",
  restaurantAddress: "Genève, Suisse",
  restaurantId: "golden-tok-browser-sample",
  dish: "Création gastronomique exclusive",
  description: "Une expérience imaginée par notre chef, composée d'ingrédients sélectionnés.",
  price: 95,
  originalPrice: 130,
  savingsAmount: 35,
  discountPercent: 27,
  totalPortions: 30,
  remaining: 20,
  image: "/images/octopus-fine-dining.jpeg",
  rating: 4.7,
  cuisine: "Gastronomie",
  dropTime: "2026-10-20T19:30:00",
  serviceTimeLabel: "19:30",
  dropMomentLabel: "Mardi 20 octobre",
  hasDiscount: true,
  isVip: false,
  requiredMiamzPoints: 0,
  serviceSettings: null,
  quickTimeSlots: ["19:00", "19:30"],
};

/** CI-only visual fixture: actual Golden TOK component, no auth or backend mocks. */
createRoot(document.getElementById("root")!).render(
  <>
    <header className="tok-site-header relative z-50 flex min-h-[80px] items-center justify-between gap-4 border-b border-amber-200 bg-[#fffdf8] px-4 md:px-10">
      <a href="#la-tok-dor-offres" aria-label="Golden TOK" className="shrink-0">
        <img src="/Image%20Codex%203%20sept.%202026,%2002_31_12.png" alt="Tok" width={92} height={76} className="h-14 w-auto object-contain md:h-16" />
      </a>
      <nav className="hidden items-center gap-7 text-sm text-stone-700 md:flex" aria-label="Navigation de démonstration">
        <span>Explorer</span><span>Actualités</span><span>Anti-gaspi</span><span>Ventes flash</span><span>Tok One</span>
      </nav>
      <span className="text-xs font-semibold text-amber-800">GOLDEN TOK</span>
    </header>
    <div className="flex h-[50px] items-center bg-[#faf7ef] px-3" data-golden-tok-backbar>
      <span className="rounded-full border border-amber-100 bg-white px-4 py-2 text-xs font-medium text-stone-800">← Retour</span>
    </div>
    <FeatureWizard
      title="La Tok d’Or"
      subtitle="Plats signature en édition ultra-limitée"
      icon={ChefHat}
      colorClass="amber-500"
      steps={[{ id: "selection", label: "Sélection" }, { id: "confirm", label: "Confirmation" }]}
      currentStepId="selection"
      headerAction={
        <button type="button" className="inline-flex items-center gap-2">
          <Bell className="h-4 w-4" aria-hidden="true" />
          Activer les notifications
        </button>
      }
    >
      <div className="space-y-8">
        <div id="la-tok-dor-offres" className="flex items-center justify-between gap-3 rounded-2xl border border-amber-500/20 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-rose-500/10 p-4">
          <p className="text-sm font-medium"><strong className="text-amber-700">20 portions</strong> disponibles sur la sélection live</p>
          <span className="rounded-full border border-amber-300 px-3 py-1 text-xs">Live</span>
        </div>
        <div className="grid gap-6" data-golden-tok-offers aria-label="Offres La Tok d’Or">
          <ChefTableDropCard
            drop={sampleDrop}
            index={0}
            isReserved={false}
            selectedTime={null}
            selectedPartySize={null}
            hasUser={false}
            authLoading={false}
            isTokOneMember={false}
            tokOneLoading={false}
            onToggleReserve={() => {}}
            onQuickTimeSelect={() => {}}
          />
        </div>
      </div>
    </FeatureWizard>
  </>,
);