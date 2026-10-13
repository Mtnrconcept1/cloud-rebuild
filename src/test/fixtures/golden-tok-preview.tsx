import { createRoot } from "react-dom/client";
import { Bell, ChefHat } from "lucide-react";
import { FeatureWizard } from "@/components/FeatureWizard";
import "@/index.css";
import "@/styles/golden-tok-chefs-table.css";
import "@/styles/golden-tok-chefs-table-v2.css";
import "@/styles/golden-tok-chefs-table-v3.css";
import "@/styles/golden-tok-chefs-table-hero.css";
import "@/styles/golden-tok-chefs-table-v4.css";
import "@/styles/golden-tok-chefs-table-v5.css";

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
        <div id="la-tok-dor-offres" className="rounded-2xl border border-amber-200 bg-white p-5 text-stone-800">
          <p className="text-xs uppercase tracking-widest text-amber-700">GOLDEN TOK — COLLECTION LIMITÉE</p>
          <h2 className="mt-2 font-serif text-2xl">Les créations disponibles</h2>
          <p className="mt-2 text-sm">Consultez les expériences exclusives des restaurants partenaires.</p>
        </div>
      </div>
    </FeatureWizard>
  </>,
);