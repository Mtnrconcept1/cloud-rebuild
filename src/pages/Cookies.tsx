import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Cookie, MapPin, Settings2, ShieldCheck, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import {
  PRIVACY_CONSENT_CHANGE_EVENT,
  PRIVACY_CONSENT_VERSION,
  PRIVACY_TECHNOLOGY_INVENTORY,
  openPrivacyConsentSettings,
  readPrivacyConsent,
  type StoredPrivacyConsent,
} from "@/lib/privacyConsentState";

const categoryLabels = {
  necessary: "Nécessaires",
  analytics: "Mesure d’audience",
  marketing: "Marketing",
  personalization: "Personnalisation",
  geolocation: "Localisation",
} as const;

export default function Cookies() {
  useSeoMeta({
    title: "Cookies et préférences | TOK",
    description: "Consultez l’inventaire exact des cookies et technologies TOK et modifiez vos choix à tout moment.",
    path: "/cookies",
  });

  const [consent, setConsent] = useState<StoredPrivacyConsent | null>(() => readPrivacyConsent());

  useEffect(() => {
    const refresh = () => setConsent(readPrivacyConsent());
    window.addEventListener(PRIVACY_CONSENT_CHANGE_EVENT, refresh);
    return () => window.removeEventListener(PRIVACY_CONSENT_CHANGE_EVENT, refresh);
  }, []);

  return (
    <div className="container max-w-5xl space-y-10 py-12 md:py-20">
      <header className="space-y-4">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
          <Cookie className="h-4 w-4" /> Version {PRIVACY_CONSENT_VERSION}
        </div>
        <h1 className="font-display text-4xl font-bold">Cookies, technologies similaires et préférences</h1>
        <p className="max-w-3xl text-foreground/80 leading-relaxed">
          Les technologies strictement nécessaires restent actives afin de sécuriser la connexion, le panier et vos choix. Les catégories facultatives sont désactivées par défaut et ne sont utilisées qu’après votre décision explicite.
        </p>
      </header>

      <section className="rounded-3xl border border-primary/20 bg-primary/5 p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h2 className="flex items-center gap-2 text-xl font-bold"><Settings2 className="h-5 w-5 text-primary" /> Mes préférences actuelles</h2>
            <p className="text-sm text-muted-foreground">
              {consent
                ? `Décision enregistrée le ${new Date(consent.clientRecordedAt).toLocaleString("fr-CH")}. ${consent.pendingSync ? "Synchronisation serveur en attente." : "Preuve serveur enregistrée."}`
                : "Aucune décision facultative valide n’est enregistrée : toutes les catégories non nécessaires restent désactivées."}
            </p>
          </div>
          <Button type="button" className="rounded-2xl" onClick={openPrivacyConsentSettings}>
            Modifier ou retirer mon consentement
          </Button>
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {(Object.keys(categoryLabels) as Array<keyof typeof categoryLabels>).map((category) => {
            const enabled = category === "necessary" || consent?.categories[category] === true;
            return (
              <div key={category} className="flex items-center gap-2 rounded-2xl border bg-background p-3 text-sm font-semibold">
                {enabled ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-muted-foreground" />}
                {categoryLabels[category]}
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-2xl font-bold">Inventaire des technologies utilisées</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            L’inventaire couvre les cookies, stockages locaux, identifiants, autorisations système et événements serveur connus dans l’application TOK. Aucun cookie publicitaire tiers n’est actuellement déclaré.
          </p>
        </div>

        <div className="space-y-3">
          {PRIVACY_TECHNOLOGY_INVENTORY.map((item) => (
            <article key={item.id} className="rounded-3xl border border-border bg-card p-5 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold text-foreground">{item.name}</h3>
                    <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                      {categoryLabels[item.category]}
                    </span>
                    {item.required ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                        <ShieldCheck className="h-3.5 w-3.5" /> Toujours actif
                      </span>
                    ) : null}
                  </div>
                  <p className="text-sm leading-6 text-foreground/80">{item.purpose}</p>
                </div>
                {item.category === "geolocation" ? <MapPin className="h-6 w-6 shrink-0 text-primary" /> : null}
              </div>
              <dl className="mt-4 grid gap-3 border-t pt-4 text-sm sm:grid-cols-3">
                <div><dt className="font-semibold text-muted-foreground">Fournisseur</dt><dd>{item.provider}</dd></div>
                <div><dt className="font-semibold text-muted-foreground">Support</dt><dd>{item.storage}</dd></div>
                <div><dt className="font-semibold text-muted-foreground">Durée</dt><dd>{item.duration}</dd></div>
              </dl>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <article className="rounded-3xl border p-5">
          <h2 className="text-xl font-bold">Refus et retrait</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            « Tout refuser » est présenté au même niveau que « Tout accepter ». Vous pouvez rouvrir les réglages depuis cette page ou le pied de page. Le retrait supprime les stockages facultatifs connus et bloque les nouveaux appels concernés.
          </p>
        </article>
        <article className="rounded-3xl border p-5">
          <h2 className="text-xl font-bold">Permission système distincte</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            L’accord TOK pour la localisation ne remplace jamais la permission du navigateur, d’iOS ou d’Android. Vous pouvez également retirer cette permission dans les réglages de votre appareil.
          </p>
        </article>
      </section>

      <section className="rounded-3xl border border-orange-200 bg-orange-50 p-5 text-sm leading-6 text-orange-950 dark:border-orange-300/20 dark:bg-orange-950/20 dark:text-orange-100">
        <h2 className="font-bold">Documents liés</h2>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 font-semibold">
          <Link to="/politique-confidentialite" className="underline">Politique de confidentialité</Link>
          <Link to="/cgu" className="underline">Conditions clients</Link>
          <a href="/legal/index.html" className="underline">Centre des documents contractuels</a>
        </div>
      </section>
    </div>
  );
}
