import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { CheckCircle2, Settings2, ShieldCheck, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  CONSENT_EVENT,
  DEFAULT_CONSENT,
  type ConsentPreferences,
  readConsent,
  saveConsent,
} from "@/lib/consent";
import { cn } from "@/lib/utils";

const categories: Array<{
  key: Exclude<keyof ConsentPreferences, "necessary">;
  title: string;
  description: string;
}> = [
  { key: "analytics", title: "Mesure d’audience", description: "Mesurer les performances, erreurs et parcours sous forme agrégée." },
  { key: "marketing", title: "Marketing", description: "Mesurer et attribuer les campagnes sponsorisées et communications commerciales." },
  { key: "personalization", title: "Personnalisation", description: "Adapter les contenus, recommandations et préférences à votre usage." },
  { key: "geolocation", title: "Géolocalisation", description: "Utiliser votre position avec votre autorisation pour les résultats et services locaux." },
];

export default function LegalConsentBanner() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState(false);
  const [preferences, setPreferences] = useState<ConsentPreferences>(DEFAULT_CONSENT);
  const isRestaurantMobileOverview = pathname === "/dashboard";

  useEffect(() => {
    const stored = readConsent();
    setPreferences(stored?.preferences ?? DEFAULT_CONSENT);
    setOpen(!stored);

    const openSettings = () => {
      setPreferences(readConsent()?.preferences ?? DEFAULT_CONSENT);
      setDetails(true);
      setOpen(true);
    };
    const sync = () => setPreferences(readConsent()?.preferences ?? DEFAULT_CONSENT);
    window.addEventListener("tok:open-consent-settings", openSettings);
    window.addEventListener(CONSENT_EVENT, sync);
    return () => {
      window.removeEventListener("tok:open-consent-settings", openSettings);
      window.removeEventListener(CONSENT_EVENT, sync);
    };
  }, []);

  const commit = async (next: ConsentPreferences) => {
    setPreferences(next);
    await saveConsent(next, details ? "settings" : "banner");
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => { setDetails(true); setOpen(true); }}
        className={cn(
          "fixed z-[1300] inline-flex max-w-[calc(100vw-1.5rem)] items-center gap-2 rounded-full border border-border/80 bg-background/95 px-4 py-2 text-xs font-semibold shadow-lg backdrop-blur-xl hover:border-primary/60 hover:text-primary",
          "left-[calc(env(safe-area-inset-left,0px)+0.75rem)] md:bottom-4 md:left-4",
          isRestaurantMobileOverview
            ? "bottom-[calc(env(safe-area-inset-bottom,0px)+5.25rem)]"
            : "bottom-[calc(env(safe-area-inset-bottom,0px)+1rem)]",
        )}
      >
        <Settings2 className="h-4 w-4 shrink-0" />
        <span className="truncate">Gérer mes cookies</span>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="consent-title"
        className={cn("mx-auto w-full max-w-3xl overflow-hidden rounded-3xl border border-orange-200 bg-white shadow-2xl", "dark:border-orange-300/25 dark:bg-slate-950")}
      >
        <div className="space-y-5 p-5 sm:p-6">
          <div className="flex gap-4">
            <div className="hidden h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary sm:grid"><ShieldCheck className="h-6 w-6" /></div>
            <div className="space-y-2">
              <h2 id="consent-title" className="text-lg font-bold">Vos choix de confidentialité</h2>
              <p className="text-sm leading-6 text-muted-foreground">
                Les technologies nécessaires restent actives pour la sécurité, la connexion, le panier et les paiements. Les autres catégories sont facultatives et peuvent être refusées sans empêcher la consultation du site.
              </p>
              <div className="flex flex-wrap gap-3 text-xs font-semibold text-muted-foreground">
                <Link to="/cgu" className="hover:text-primary hover:underline">Conditions clients</Link>
                <Link to="/politique-confidentialite" className="hover:text-primary hover:underline">Confidentialité</Link>
                <Link to="/cookies" className="hover:text-primary hover:underline">Inventaire des traceurs</Link>
              </div>
            </div>
          </div>

          {details ? (
            <div className="space-y-3 rounded-2xl border bg-muted/20 p-4">
              <div className="flex items-center justify-between gap-4">
                <div><p className="font-semibold">Nécessaires</p><p className="text-xs text-muted-foreground">Sécurité, authentification, panier, paiement et préférences essentielles.</p></div>
                <Switch checked disabled aria-label="Cookies nécessaires toujours actifs" />
              </div>
              {categories.map((category) => (
                <div key={category.key} className="flex items-center justify-between gap-4 border-t pt-3">
                  <div><p className="font-semibold">{category.title}</p><p className="text-xs text-muted-foreground">{category.description}</p></div>
                  <Switch
                    checked={preferences[category.key]}
                    onCheckedChange={(checked) => setPreferences((current) => ({ ...current, [category.key]: checked, necessary: true }))}
                    aria-label={category.title}
                  />
                </div>
              ))}
            </div>
          ) : null}

          <div className="grid gap-2 sm:grid-cols-3">
            <Button variant="outline" className="h-11 gap-2" onClick={() => void commit(DEFAULT_CONSENT)}>
              <XCircle className="h-4 w-4" /> Tout refuser
            </Button>
            <Button variant="outline" className="h-11 gap-2" onClick={() => setDetails(true)}>
              <Settings2 className="h-4 w-4" /> Personnaliser
            </Button>
            <Button className="h-11 gap-2" onClick={() => void commit(details ? preferences : { necessary: true, analytics: true, marketing: true, personalization: true, geolocation: true })}>
              <CheckCircle2 className="h-4 w-4" /> {details ? "Enregistrer" : "Tout accepter"}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
