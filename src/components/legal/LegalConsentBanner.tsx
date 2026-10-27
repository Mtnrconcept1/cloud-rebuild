import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { CheckCircle2, Settings2, ShieldCheck, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
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
  { key: "marketing", title: "Marketing", description: "Mesurer et attribuer les campagnes sponsorisées et communications. Ce choix ne vous inscrit pas aux e-mails commerciaux." },
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

  const commit = (next: ConsentPreferences) => {
    setPreferences(next);
    void saveConsent(next, details ? "settings" : "banner");
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => { setPreferences(readConsent()?.preferences ?? DEFAULT_CONSENT); setDetails(true); setOpen(true); }}
        className={cn(
          "fixed z-[1300] max-w-[calc(100vw-1.5rem)] items-center gap-2 rounded-full border border-border/80 bg-background/95 px-4 py-2 text-xs font-semibold shadow-lg backdrop-blur-xl hover:border-primary/60 hover:text-primary",
          pathname === "/" ? "hidden lg:inline-flex" : "inline-flex",
          "left-[calc(env(safe-area-inset-left,0px)+0.75rem)] md:bottom-4 md:left-auto md:right-4",
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="flex max-w-3xl flex-col gap-0 overflow-hidden border-orange-200 bg-white p-0 dark:border-orange-300/25 dark:bg-slate-950">
        <div data-dialog-scroll-area className="min-h-0 space-y-5 overflow-y-auto overscroll-contain p-5 sm:p-6">
          <div className="flex gap-4">
            <div className="hidden h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary sm:grid"><ShieldCheck className="h-6 w-6" /></div>
            <div className="space-y-2">
              <DialogTitle className="text-lg font-bold">Vos choix de confidentialité</DialogTitle>
              <DialogDescription className="text-sm leading-6">
                Les technologies nécessaires restent actives pour la sécurité, la connexion, le panier et les paiements. Les autres catégories sont facultatives et peuvent être refusées sans empêcher la consultation du site. Sans choix initial, les catégories facultatives restent désactivées. Fermer les réglages conserve votre choix précédent.
              </DialogDescription>
              <div className="flex flex-wrap gap-3 text-xs font-semibold text-muted-foreground">
                <Link to="/cgu" onClick={() => setOpen(false)} className="hover:text-primary hover:underline">Conditions clients</Link>
                <Link to="/politique-confidentialite" onClick={() => setOpen(false)} className="hover:text-primary hover:underline">Confidentialité</Link>
                <Link to="/cookies" onClick={() => setOpen(false)} className="hover:text-primary hover:underline">Inventaire des traceurs</Link>
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

        </div>
          <div className="grid shrink-0 gap-2 border-t bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:grid-cols-3 dark:bg-slate-950">
            <Button variant="outline" className="h-11 gap-2" onClick={() => commit(DEFAULT_CONSENT)}>
              <XCircle className="h-4 w-4" /> Tout refuser
            </Button>
            <Button variant="outline" className="h-11 gap-2" onClick={() => setDetails(true)}>
              <Settings2 className="h-4 w-4" /> Personnaliser
            </Button>
            <Button className="h-11 gap-2" onClick={() => commit(details ? preferences : { necessary: true, analytics: true, marketing: true, personalization: true, geolocation: true })}>
              <CheckCircle2 className="h-4 w-4" /> {details ? "Enregistrer" : "Tout accepter"}
            </Button>
          </div>
      </DialogContent>
    </Dialog>
  );
}
