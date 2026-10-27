import { Link } from "react-router-dom";
import { Settings2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { TRACKER_INVENTORY } from "@/lib/cookieInventory";
import { openConsentSettings } from "@/lib/consent";
import { LEGAL_DOCUMENTS, LEGAL_EFFECTIVE_DATE_FR } from "@/lib/legalDocuments";
import LegalDocumentTools from "@/components/legal/LegalDocumentTools";

const categoryLabels = {
  necessary: "Nécessaire",
  analytics: "Mesure d’audience",
  marketing: "Marketing",
  personalization: "Personnalisation",
  geolocation: "Géolocalisation",
} as const;

const storageLabels = {
  cookie: "Cookie", localStorage: "Stockage local", sessionStorage: "Stockage de session",
  IndexedDB: "Stockage navigateur", "server event": "Événement serveur", "device permission": "Autorisation de l’appareil",
} as const;

export default function Cookies() {
  useSeoMeta({
    title: "Politique cookies et traceurs | TOK",
    description: "Inventaire des cookies, stockages, fournisseurs, finalités, durées et réglages de consentement TOK.",
    path: "/cookies",
  });

  return (
    <div className="container max-w-6xl space-y-10 py-12 md:py-20">
      <header className="space-y-4">
        <h1 className="font-display text-4xl font-bold">Politique cookies et traceurs</h1>
        <p className="text-muted-foreground">Version {LEGAL_DOCUMENTS.cookies.version} — applicable dès le {LEGAL_EFFECTIVE_DATE_FR}</p>
        <p className="max-w-4xl text-foreground/80 leading-relaxed">
          TOK sépare désormais l’acceptation contractuelle des choix relatifs aux traceurs. Les technologies nécessaires restent actives pour la sécurité, la connexion, le panier, le paiement et les fonctions explicitement demandées. Analytics, marketing, personnalisation et géolocalisation sont désactivés par défaut jusqu’à votre choix.
        </p>
        <p className="max-w-4xl text-sm leading-relaxed text-muted-foreground">Cette politique couvre aussi localStorage, IndexedDB, les identifiants et événements techniques : un traceur n’est pas toujours un cookie. Les messages et preuves indispensables à une commande, une réservation ou à la sécurité restent distincts de la mesure d’audience facultative.</p>
        <Button type="button" variant="outline" className="gap-2" onClick={openConsentSettings}>
          <Settings2 className="h-4 w-4" /> Modifier mes préférences
        </Button>
      </header>

      <LegalDocumentTools />

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Catégories</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border p-5"><h3 className="font-semibold">Nécessaires — toujours actifs</h3><p className="mt-2 text-sm text-muted-foreground">Authentification, sécurité, panier, checkout, prévention de la fraude, preuve du consentement et fonctions demandées.</p></div>
          <div className="rounded-2xl border p-5"><h3 className="font-semibold">Analytics — facultatifs</h3><p className="mt-2 text-sm text-muted-foreground">Mesure d’audience, erreurs non indispensables, performances et compréhension des parcours.</p></div>
          <div className="rounded-2xl border p-5"><h3 className="font-semibold">Marketing — facultatifs</h3><p className="mt-2 text-sm text-muted-foreground">Attribution des campagnes, publicité locale et mesure organique ou sponsorisée.</p></div>
          <div className="rounded-2xl border p-5"><h3 className="font-semibold">Personnalisation et géolocalisation — facultatifs</h3><p className="mt-2 text-sm text-muted-foreground">Recommandations, préférences et services proches de votre position avec autorisation de l’appareil.</p></div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Inventaire des technologies</h2>
        <p className="text-sm text-muted-foreground">Cet inventaire décrit les principales technologies utilisées, leur finalité, leur durée et les conditions de leur activation.</p>
        <div className="grid gap-4 lg:hidden">
          {TRACKER_INVENTORY.map((item) => <article key={`${item.provider}-${item.name}`} className="min-w-0 rounded-2xl border p-4">
            <h3 className="break-words font-semibold">{item.name}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{item.provider} · {storageLabels[item.storage]} · {categoryLabels[item.category]}</p>
            <dl className="mt-4 space-y-3 text-sm">
              <div><dt className="font-semibold">Finalité</dt><dd className="mt-1 text-foreground/80">{item.purpose}</dd></div>
              <div><dt className="font-semibold">Durée</dt><dd className="mt-1 text-foreground/80">{item.duration}</dd></div>
              <div><dt className="font-semibold">Activation</dt><dd className="mt-1 text-foreground/80">{item.activation}</dd></div>
            </dl>
          </article>)}
        </div>
        <div className="hidden overflow-x-auto rounded-2xl border lg:block">
          <table className="w-full min-w-[980px] text-left text-sm">
            <caption className="sr-only">Fournisseurs, catégories, finalités, durées et activation des technologies utilisées par TOK</caption>
            <thead className="bg-muted/50">
              <tr>
                <th className="p-3">Nom</th><th className="p-3">Fournisseur</th><th className="p-3">Stockage</th><th className="p-3">Catégorie</th><th className="p-3">Finalité</th><th className="p-3">Durée</th><th className="p-3">Activation</th>
              </tr>
            </thead>
            <tbody>
              {TRACKER_INVENTORY.map((item) => (
                <tr key={`${item.provider}-${item.name}`} className="border-t align-top">
                  <td className="p-3 font-medium">{item.name}</td>
                  <td className="p-3">{item.provider}</td>
                  <td className="p-3">{storageLabels[item.storage]}</td>
                  <td className="p-3">{categoryLabels[item.category]}</td>
                  <td className="p-3">{item.purpose}</td>
                  <td className="p-3">{item.duration}</td>
                  <td className="p-3">{item.activation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border p-5">
        <h2 className="text-2xl font-semibold">Retrait et preuve</h2>
        <p className="text-foreground/80 leading-relaxed">Vous pouvez modifier vos catégories à tout moment depuis le bouton « Gérer mes cookies ». Le nouveau choix remplace immédiatement le précédent dans le navigateur. Une preuve datée de la version et des catégories est enregistrée côté serveur lorsque le service est disponible, sans rendre les catégories facultatives obligatoires.</p>
        <p className="text-foreground/80 leading-relaxed">Le retrait bloque les nouveaux événements concernés et purge leurs files d’attente dans ce navigateur. Il ne peut pas annuler une requête déjà reçue ni effacer rétroactivement les données qu’un prestataire doit traiter selon sa politique. Pour demander un effacement, utilisez le contact indiqué dans la Politique de confidentialité.</p>
        <p className="text-foreground/80 leading-relaxed">Vous pouvez aussi retirer une permission de géolocalisation ou de notification dans les réglages de votre navigateur ou appareil. Les choix concernent le navigateur et le domaine utilisés : refaites-les sur un autre appareil, navigateur ou sous-domaine si nécessaire. La suppression du stockage navigateur réinitialise le choix local et fera réapparaître le bandeau ; elle ne supprime pas votre compte.</p>
        <p className="text-foreground/80 leading-relaxed">Tout refuser est proposé au même niveau que Tout accepter. Fermer le bandeau sans choisir ne vaut pas accord : les catégories facultatives restent désactivées. Le réglage Marketing des traceurs ne vaut pas inscription aux e-mails commerciaux ; leur désabonnement se fait depuis le lien présent dans ces e-mails.</p>
      </section>

      <section className="space-y-3 rounded-2xl border p-5">
        <h2 className="text-2xl font-semibold">Services tiers et permissions</h2>
        <p className="text-foreground/80 leading-relaxed">Une carte, un paiement, un contrôle anti-abus, une impression ou une notification demandée peut transmettre au prestataire l’adresse IP et les données indispensables au service. La géolocalisation facultative nécessite votre choix TOK et l’autorisation de l’appareil ; saisir une ville ou une adresse reste possible sans GPS. Une permission de notification est distincte d’un consentement marketing.</p>
        <div className="flex flex-wrap gap-4 text-sm underline underline-offset-4">
          <a href="https://stripe.com/fr-ch/cookie-settings" target="_blank" rel="noreferrer">Cookies Stripe</a>
          <a href="https://vercel.com/legal/privacy-notice" target="_blank" rel="noreferrer">Confidentialité Vercel</a>
          <a href="https://www.edoeb.admin.ch/fr/cookies-conseils-pratiques" target="_blank" rel="noreferrer">Conseils du PFPDT</a>
        </div>
      </section>

      <section className="space-y-3 border-t pt-8">
        <h2 className="text-2xl font-semibold">Documents liés</h2>
        <div className="flex flex-wrap gap-4 text-sm font-medium">
          <Link to="/cgu" className="text-primary hover:underline">Conditions clients</Link>
          <Link to="/conditions-restaurateurs" className="text-primary hover:underline">Conditions restaurateurs</Link>
          <Link to="/politique-confidentialite" className="text-primary hover:underline">Politique de confidentialité</Link>
          <Link to="/contact" className="text-primary hover:underline">Contact</Link>
        </div>
      </section>
    </div>
  );
}
