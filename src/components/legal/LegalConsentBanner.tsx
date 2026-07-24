import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, ChevronDown, MapPin, Settings2, ShieldCheck, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  DEFAULT_PRIVACY_CATEGORIES,
  PRIVACY_CONSENT_OPEN_EVENT,
  readPrivacyConsent,
  type OptionalPrivacyCategory,
  type PrivacyConsentCategories,
  type PrivacyConsentSource,
} from "@/lib/privacyConsentState";
import {
  persistPrivacyConsent,
  retryPendingPrivacyConsentSync,
} from "@/lib/privacyConsentSync";

const categoryCopy: Array<{
  key: "necessary" | OptionalPrivacyCategory;
  title: string;
  description: string;
}> = [
  {
    key: "necessary",
    title: "Nécessaires",
    description: "Connexion, sécurité, panier, préférences de confidentialité et fonctionnement indispensable.",
  },
  {
    key: "analytics",
    title: "Mesure d’audience",
    description: "Comprendre les pages et fonctionnalités utilisées sans vendre vos données personnelles.",
  },
  {
    key: "marketing",
    title: "Marketing et attribution",
    description: "Mesurer les contenus sponsorisés, limiter leur répétition et attribuer une conversion.",
  },
  {
    key: "personalization",
    title: "Personnalisation",
    description: "Adapter l’ordre des restaurants, contenus et recommandations à vos interactions autorisées.",
  },
  {
    key: "geolocation",
    title: "Localisation",
    description: "Demander votre position pour les restaurants proches. Le navigateur ou le téléphone demandera aussi son autorisation.",
  },
];

function allOptionalCategories(value: boolean): PrivacyConsentCategories {
  return {
    necessary: true,
    analytics: value,
    marketing: value,
    personalization: value,
    geolocation: value,
  };
}

export default function LegalConsentBanner() {
  const existingConsent = useMemo(() => readPrivacyConsent(), []);
  const [open, setOpen] = useState(!existingConsent);
  const [showDetails, setShowDetails] = useState(Boolean(existingConsent));
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<PrivacyConsentCategories>(
    existingConsent?.categories || DEFAULT_PRIVACY_CATEGORIES,
  );
  const [source, setSource] = useState<PrivacyConsentSource>(existingConsent ? "settings" : "banner");

  useEffect(() => {
    void retryPendingPrivacyConsentSync();

    const handleOpen = () => {
      const current = readPrivacyConsent();
      setCategories(current?.categories || DEFAULT_PRIVACY_CATEGORIES);
      setSource("settings");
      setShowDetails(true);
      setOpen(true);
    };

    window.addEventListener(PRIVACY_CONSENT_OPEN_EVENT, handleOpen);
    return () => window.removeEventListener(PRIVACY_CONSENT_OPEN_EVENT, handleOpen);
  }, []);

  const updateCategory = (key: OptionalPrivacyCategory, checked: boolean) => {
    setCategories((current) => ({ ...current, [key]: checked }));
  };

  const save = async (
    nextCategories: PrivacyConsentCategories,
    action: "accept_all" | "reject_all" | "save_preferences" | "withdraw",
  ) => {
    setSaving(true);
    setCategories(nextCategories);
    await persistPrivacyConsent({ categories: nextCategories, action, source });
    setSaving(false);
    setOpen(false);
  };

  if (!open) return null;

  const hasOptionalConsent = categories.analytics
    || categories.marketing
    || categories.personalization
    || categories.geolocation;

  return (
    <div className="fixed inset-0 z-[1300] flex items-end justify-center bg-slate-950/45 px-3 py-3 backdrop-blur-sm sm:items-center sm:px-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="privacy-consent-title"
        className={cn(
          "mx-auto max-h-[calc(100dvh-1.5rem)] w-full max-w-3xl overflow-y-auto rounded-3xl border border-orange-200 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.28)]",
          "dark:border-orange-300/25 dark:bg-slate-950 dark:shadow-[0_24px_80px_rgba(0,0,0,0.55)]",
        )}
      >
        <div className="space-y-5 p-5 sm:p-6">
          <div className="flex gap-4">
            <div className="hidden h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary sm:grid">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div className="min-w-0 space-y-2">
              <p id="privacy-consent-title" className="text-lg font-bold text-foreground">
                Vos choix de confidentialité
              </p>
              <p className="text-sm leading-6 text-muted-foreground">
                Les technologies nécessaires restent actives. Les mesures d’audience, le marketing, la personnalisation et la localisation sont désactivés tant que vous ne les acceptez pas. Ce choix est indépendant de l’acceptation des contrats lors d’une inscription, commande ou réservation.
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-muted-foreground">
                <Link to="/politique-confidentialite" className="hover:text-primary hover:underline">Confidentialité</Link>
                <Link to="/cookies" className="hover:text-primary hover:underline">Cookies et inventaire</Link>
                <a href="/legal/index.html" className="hover:text-primary hover:underline">Documents contractuels</a>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowDetails((value) => !value)}
            className="flex w-full items-center justify-between rounded-2xl border border-border bg-muted/35 px-4 py-3 text-left text-sm font-semibold text-foreground"
            aria-expanded={showDetails}
          >
            <span className="inline-flex items-center gap-2"><Settings2 className="h-4 w-4" /> Personnaliser mes choix</span>
            <ChevronDown className={cn("h-4 w-4 transition-transform", showDetails && "rotate-180")} />
          </button>

          {showDetails ? (
            <div className="space-y-2">
              {categoryCopy.map((category) => {
                const necessary = category.key === "necessary";
                const checked = necessary ? true : categories[category.key];
                return (
                  <div key={category.key} className="flex items-start justify-between gap-4 rounded-2xl border border-border/80 p-4">
                    <div className="space-y-1">
                      <p className="flex items-center gap-2 text-sm font-bold text-foreground">
                        {category.key === "geolocation" ? <MapPin className="h-4 w-4 text-primary" /> : null}
                        {category.title}
                      </p>
                      <p className="text-xs leading-5 text-muted-foreground">{category.description}</p>
                    </div>
                    <Switch
                      checked={checked}
                      disabled={necessary || saving}
                      onCheckedChange={(value) => {
                        if (!necessary) updateCategory(category.key, value);
                      }}
                      aria-label={`${category.title} ${checked ? "activé" : "désactivé"}`}
                    />
                  </div>
                );
              })}
            </div>
          ) : null}

          <div className="grid gap-2 sm:grid-cols-3">
            <Button
              type="button"
              variant="outline"
              className="h-11 gap-2 rounded-2xl"
              disabled={saving}
              onClick={() => void save(allOptionalCategories(false), existingConsent || hasOptionalConsent ? "withdraw" : "reject_all")}
            >
              <XCircle className="h-4 w-4" />
              Tout refuser
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="h-11 rounded-2xl"
              disabled={saving}
              onClick={() => void save(categories, "save_preferences")}
            >
              Enregistrer mes choix
            </Button>
            <Button
              type="button"
              className="h-11 gap-2 rounded-2xl bg-primary text-primary-foreground shadow-[0_14px_30px_rgba(249,115,22,0.24)] hover:bg-primary/90"
              disabled={saving}
              onClick={() => void save(allOptionalCategories(true), "accept_all")}
            >
              <CheckCircle2 className="h-4 w-4" />
              Tout accepter
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
