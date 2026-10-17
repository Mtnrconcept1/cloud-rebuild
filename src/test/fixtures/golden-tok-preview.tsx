import { createRoot } from "react-dom/client";
import type { ComponentProps } from "react";
import { Bell, ChefHat, Menu, Search, ShoppingCart, User } from "lucide-react";
import { FeatureWizard } from "@/components/FeatureWizard";
import { ChefTableDropCard } from "@/pages/ChefsTable";
import "@/index.css";
import "@/styles/golden-tok-chefs-table.css";
import "@/styles/golden-tok-chefs-table-v2.css";
import "@/styles/golden-tok-chefs-table-v3.css";
import "@/styles/golden-tok-chefs-table-hero.css";
import "@/styles/golden-tok-chefs-table-v4.css";
import "@/styles/golden-tok-chefs-table-v5.css";
import "@/styles/golden-tok-chefs-table-v6.css";


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
    {/* Minimal public navbar fixture, matching the route-scoped TOK header's DOM/classes. */}
    <div className="tok-golden-utility hidden border-b lg:block">
      <div className="mx-auto flex h-9 max-w-[1400px] items-center justify-end gap-4 px-4 text-xs">
        <span>Pour les restaurateurs</span><span>TOK Connect</span><span>Aide</span>
      </div>
    </div>
    <header className="tok-site-header tok-golden-nav sticky top-0 z-[70] w-full border-b bg-background">
      <div className="mx-auto flex h-16 w-full max-w-[1400px] items-center justify-between gap-2 px-3 md:h-20 md:px-8">
        <a href="#la-tok-dor-offres" aria-label="Golden TOK" className="flex min-h-11 min-w-11 shrink-0 items-center gap-2">
          <img src="/Image%20Codex%203%20sept.%202026,%2002_31_12.png" alt="Tok" width={98} height={64} className="h-11 w-auto object-contain md:h-16" />
        </a>
        <nav className="hidden items-center gap-6 text-sm xl:flex" aria-label="Navigation de démonstration">
          <span>Explorer</span><span>Actualités</span><span>Anti-gaspi</span><span>Ventes flash</span><span>Tok One</span><span>Plus</span>
        </nav>
        <div className="golden-tok-nav-actions flex shrink-0 items-center gap-1">
          <a href="#la-tok-dor-offres" aria-label="Rechercher" className="golden-tok-mobile-search inline-flex h-10 w-10 items-center justify-center"><Search size={20} /></a>
          <a href="#la-tok-dor-offres" aria-label="Panier" className="golden-tok-mobile-cart inline-flex h-10 w-10 items-center justify-center"><ShoppingCart size={20} /></a>
          <button type="button" aria-label="Compte" className="golden-tok-route-account inline-flex h-11 w-11 items-center justify-center rounded-full"><User size={20} /></button>
          <button type="button" aria-label="Ouvrir le menu" className="golden-tok-route-menu inline-flex h-11 w-11 items-center justify-center 2xl:hidden"><Menu size={23} /></button>
        </div>
      </div>
    </header>
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