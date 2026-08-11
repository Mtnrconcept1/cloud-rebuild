import { Link } from "react-router-dom";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { LEGAL_DOCUMENTS, LEGAL_EFFECTIVE_DATE_FR } from "@/lib/legalDocuments";

const sections = [
  {
    title: "1. Responsable du traitement",
    paragraphs: [
      "TOK traite les données personnelles nécessaires à l'exploitation de la plateforme et des services effectivement proposés.",
      "Pour toute demande relative à vos données personnelles, vous pouvez écrire à privacy@thetok.ch.",
    ],
  },
  {
    title: "2. Données que nous pouvons traiter",
    bullets: [
      "Compte et identité : nom, prénom, adresse e-mail, téléphone, photo de profil, préférences, rôle et informations de connexion.",
      "Commandes à emporter : restaurant, articles, quantités, créneau de retrait, instructions, statut, remboursements et historique.",
      "Réservations : restaurant, date, heure, nombre de personnes, demandes particulières, statut et historique.",
      "Paiements : montant, devise, statut et identifiants techniques nécessaires au rapprochement. TOK ne conserve pas le numéro complet de carte lorsqu'un prestataire de paiement traite la transaction.",
      "Restaurants partenaires : identité commerciale, coordonnées, informations contractuelles, informations de facturation, justificatifs d'onboarding et paramètres nécessaires au service.",
      "Localisation : ville, adresse recherchée, position approximative ou GPS uniquement lorsque vous l'autorisez, notamment pour afficher des établissements pertinents à proximité.",
      "Actualités et interactions : publications, commentaires, likes, sauvegardes, signalements, blocages et préférences déduites de vos interactions.",
      "Support : messages, pièces jointes, incidents signalés et historique nécessaire à leur résolution.",
      "Données techniques : adresse IP, type d'appareil, navigateur, version de l'application, erreurs, performances et événements de sécurité nécessaires à l'exploitation du service.",
      "Fonctions d'intelligence artificielle : contenu de la demande, résultat et métadonnées strictement nécessaires lorsque vous utilisez une fonction IA.",
    ],
  },
  {
    title: "3. Finalités",
    bullets: [
      "Créer, authentifier et sécuriser les comptes.",
      "Traiter les commandes à emporter, réservations, paiements, remboursements et demandes de support.",
      "Afficher les restaurants, menus, offres et contenus pertinents.",
      "Gérer les programmes de fidélité, avantages et abonnements effectivement activés.",
      "Permettre aux restaurants de gérer leurs informations, menus, commandes, réservations, campagnes, factures et contenus.",
      "Prévenir la fraude, les abus, les accès non autorisés et les incidents de sécurité.",
      "Respecter nos obligations contractuelles, comptables et légales.",
      "Améliorer le fonctionnement et la qualité de TOK à partir de mesures agrégées ou nécessaires au diagnostic.",
    ],
  },
  {
    title: "4. Fondement et proportionnalité",
    paragraphs: [
      "TOK traite les données lorsqu'elles sont nécessaires à l'exécution d'un service demandé, au respect d'une obligation légale, à la sécurité et à la prévention des abus, ou lorsque vous avez donné un consentement lorsque celui-ci est requis.",
      "Nous cherchons à limiter les données traitées à ce qui est nécessaire pour la finalité annoncée et à ne pas réutiliser les données de manière incompatible avec cette finalité.",
    ],
  },
  {
    title: "5. Destinataires et prestataires",
    bullets: [
      "Restaurants partenaires : uniquement les informations nécessaires à la préparation d'une commande à emporter, à une réservation, au service client ou à la facturation concernée.",
      "Stripe : paiements, remboursements, abonnements et reversements lorsque ce prestataire est utilisé.",
      "Apple : gestion d'un achat ou abonnement numérique effectué par l'intermédiaire de l'App Store lorsque ce parcours est utilisé.",
      "Supabase : authentification, base de données, stockage et fonctions serveur.",
      "Vercel et fournisseurs d'hébergement : mise à disposition et exploitation des services web concernés.",
      "Fournisseurs de messagerie et notifications : envoi des messages nécessaires au service ou demandés par l'utilisateur.",
      "OpenAI ou autre fournisseur IA activé : uniquement pour les fonctions d'intelligence artificielle effectivement utilisées et selon le périmètre nécessaire à la demande.",
      "Autorités ou conseils : uniquement lorsque la loi l'exige ou lorsque cela est nécessaire à la défense de droits légitimes.",
    ],
  },
  {
    title: "6. Transferts à l'étranger",
    paragraphs: [
      "Certains prestataires peuvent traiter des données en dehors de la Suisse. Lorsque le droit applicable l'exige, TOK utilise les garanties prévues pour encadrer ces transferts et limite les données transmises au besoin du service.",
    ],
  },
  {
    title: "7. Conservation",
    paragraphs: [
      "Les données sont conservées pendant la durée nécessaire au service puis supprimées, anonymisées ou archivées pendant la durée requise par les obligations légales, comptables, contractuelles, de sécurité ou de preuve.",
      "Les durées peuvent varier selon la catégorie : compte actif, commande, réservation, facture, paiement, consentement, litige, sécurité ou support.",
    ],
  },
  {
    title: "8. Sécurité",
    paragraphs: [
      "TOK met en œuvre des mesures techniques et organisationnelles destinées à limiter l'accès non autorisé, la perte, l'altération ou la divulgation de données. Les accès sont limités selon les besoins et les actions sensibles font l'objet de contrôles appropriés.",
      "Aucun système n'offre une sécurité absolue. Si vous pensez que votre compte ou vos données ont été compromis, contactez-nous rapidement.",
    ],
  },
  {
    title: "9. Vos droits",
    paragraphs: [
      "Selon le droit applicable, vous pouvez notamment demander l'accès aux données vous concernant, leur rectification, leur suppression lorsque les conditions sont réunies, ou des informations sur leur traitement.",
      "Certaines données doivent être conservées malgré une demande de suppression lorsqu'une obligation légale, comptable, de prévention de la fraude ou de défense de droits l'exige.",
      "Vous pouvez également initier la suppression de votre compte depuis les fonctions prévues dans l'application.",
    ],
  },
  {
    title: "10. Cookies, mesures d'audience et communications",
    paragraphs: [
      "Les cookies et technologies similaires sont décrits dans la Politique cookies. Les communications commerciales sont envoyées selon vos choix et peuvent être désactivées au moyen des mécanismes proposés.",
    ],
  },
  {
    title: "11. Modifications",
    paragraphs: [
      "Cette politique peut être mise à jour en cas d'évolution du service ou du cadre légal. Sa version et sa date d'effet sont indiquées en tête de page. Une nouvelle acceptation sera demandée lorsque cela est nécessaire.",
    ],
  },
] as const;

export default function PolitiqueConfidentialite() {
  useSeoMeta({
    title: "Politique de confidentialité | TOK",
    description: "Données traitées par TOK, finalités, prestataires, conservation, sécurité et droits des personnes.",
    path: "/politique-confidentialite",
  });

  return (
    <div className="container max-w-4xl space-y-12 py-12 md:py-20">
      <div className="space-y-4">
        <h1 className="font-display text-4xl font-bold">Politique de confidentialité</h1>
        <p className="text-muted-foreground">
          Version {LEGAL_DOCUMENTS.privacy.version} — applicable dès le {LEGAL_EFFECTIVE_DATE_FR}
        </p>
      </div>

      <div className="prose prose-foodhub max-w-none space-y-8">
        {sections.map((section) => (
          <section key={section.title} className="space-y-4">
            <h2 className="text-2xl font-semibold">{section.title}</h2>
            {"paragraphs" in section
              ? section.paragraphs?.map((paragraph) => (
                  <p key={paragraph} className="text-foreground/80 leading-relaxed">
                    {paragraph}
                  </p>
                ))
              : null}
            {"bullets" in section && section.bullets ? (
              <ul className="list-disc space-y-2 pl-6 text-foreground/80">
                {section.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}

        <section className="rounded-2xl border bg-muted/30 p-5 text-sm text-foreground/80">
          Consultez également nos <Link className="font-medium text-primary underline" to={LEGAL_DOCUMENTS.cgu.path}>Conditions générales d'utilisation</Link>.
        </section>
      </div>
    </div>
  );
}
