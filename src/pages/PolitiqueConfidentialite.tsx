import { Link } from "react-router-dom";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { LEGAL_DOCUMENTS, LEGAL_EFFECTIVE_DATE_FR, legalSectionId } from "@/lib/legalDocuments";
import { SUPPORT_EMAIL } from "@/lib/contact";
import LegalDocumentTools from "@/components/legal/LegalDocumentTools";

const sections = [
  {
    title: "1. Responsable du traitement",
    paragraphs: [
      "TOK traite les données personnelles nécessaires à l'exploitation de la plateforme et des services effectivement proposés.",
      `Pour une demande relative à vos données personnelles, écrivez à ${SUPPORT_EMAIL} avec l’objet « Données personnelles », ou utilisez la page Contact. Indiquez l’adresse de votre compte et la nature de votre demande, sans joindre de mot de passe ni de données bancaires complètes.`,
      "Le restaurant est responsable des traitements qu’il effectue pour exploiter son établissement et traiter sa relation avec ses clients. Lorsqu’un établissement utilise TOK pour gérer ses équipes ou ses propres campagnes, il doit informer les personnes concernées et disposer des autorisations nécessaires ; TOK fournit les outils dans le périmètre du service convenu.",
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
      "Campagnes et personnalisation : interactions, préférences et signaux d'intérêt nécessaires pour ordonner des contenus, mesurer une campagne ou appliquer vos choix de personnalisation.",
      "Notifications : identifiant technique de notification et préférences de réception lorsque vous activez ce canal.",
      "Intégrations TOK Connect : identité du partenaire, permissions accordées, actions réalisées et données strictement nécessaires à l'intégration autorisée.",
      "Création et impression : photos, logos, références, consignes, créations, validations et, pour une impression demandée, coordonnées du destinataire et de livraison nécessaires au prestataire.",
      "Équipe du restaurant, si les outils correspondants sont activés : identité professionnelle, invitations, rôles, planning, pointages et informations RH saisies par l’employeur et ses collaborateurs.",
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
      "Mémoriser vos choix de confidentialité et en conserver une preuve ; activer les mesures facultatives uniquement selon les catégories que vous autorisez.",
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
      "Services cartographiques et de recherche d’adresse, notamment OpenStreetMap et Photon/Komoot selon l’écran : fond de carte, adresse recherchée et informations techniques nécessaires à l’affichage ou à la recherche demandée.",
      "Apple : gestion d'un achat ou abonnement numérique effectué par l'intermédiaire de l'App Store lorsque ce parcours est utilisé.",
      "Supabase : authentification, base de données, stockage et fonctions serveur.",
      "Vercel et fournisseurs d'hébergement : mise à disposition et exploitation des services web concernés.",
      "Fournisseurs de messagerie et notifications : envoi des messages nécessaires au service ou demandés par l'utilisateur.",
      "Resend pour les e-mails et Google Firebase pour les notifications lorsque ces canaux sont utilisés ; Cloudflare pour les services de protection ou d’infrastructure activés ; Sentry pour les diagnostics facultatifs après votre accord à la mesure d’audience.",
      "OpenAI ou autre fournisseur IA activé : uniquement pour les fonctions d'intelligence artificielle effectivement utilisées et selon le périmètre nécessaire à la demande.",
      "Prestataire d’impression Cloudprinter et partenaires de production ou de transport concernés : création à imprimer, spécifications et coordonnées indispensables, uniquement si vous commandez ce service.",
      "Partenaires TOK Connect approuvés : uniquement les données nécessaires à l'action autorisée et dans la limite des permissions accordées.",
      "Autorités ou conseils : uniquement lorsque la loi l'exige ou lorsque cela est nécessaire à la défense de droits légitimes.",
    ],
  },
  {
    title: "6. Intégrations TOK Connect et partenaires autorisés",
    paragraphs: [
      "Lorsqu'un restaurant ou TOK autorise une intégration partenaire, le partenaire ne reçoit que les informations nécessaires aux fonctions qui lui ont été accordées. Les permissions peuvent être retirées ou limitées selon le service concerné.",
      "TOK conserve les éléments de traçabilité nécessaires à la sécurité, au support, à la preuve d'une action et au respect des obligations applicables, sans publier les secrets ou mécanismes internes de l'intégration.",
      "Si vous reliez votre compte à un assistant ou à une application tierce, vérifiez l’identité du partenaire et les permissions demandées avant de les accorder. Les données que vous saisissez directement chez ce partenaire relèvent aussi de sa propre politique. Retirer une permission bloque les accès futurs concernés sans supprimer les éléments qu’il doit légalement conserver.",
    ],
  },
  {
    title: "7. Transferts à l'étranger",
    paragraphs: [
      "Certains prestataires peuvent traiter des données en dehors de la Suisse. Lorsque le droit applicable l'exige, TOK utilise les garanties prévues pour encadrer ces transferts et limite les données transmises au besoin du service.",
      "La base principale du projet Supabase TOK est située en Suisse, dans la région de Zurich. Cette localisation ne signifie pas que tous les sous-traitants, services d’assistance ou services annexes traitent leurs données exclusivement en Suisse.",
      "Les services d’hébergement Vercel, de messagerie Resend, de notification Google Firebase, de protection Cloudflare et certains services IA ou de paiement peuvent impliquer des traitements aux États-Unis et dans l’Union européenne selon le service. Resend indique notamment stocker les données d’e-mails aux États-Unis, même si l’envoi est acheminé depuis une région européenne.",
      "Les transferts doivent reposer sur un niveau de protection reconnu adéquat ou sur les garanties et exceptions prévues par la LPD ; une certification au cadre Suisse–États-Unis n’est pertinente que pour le destinataire et les traitements effectivement couverts. Vous pouvez demander au contact ci-dessus les pays et les garanties applicables à votre traitement ; les politiques des prestataires complètent cette information sans remplacer les obligations de TOK.",
    ],
  },
  {
    title: "8. Conservation",
    paragraphs: [
      "Les données sont conservées pendant la durée nécessaire au service puis supprimées, anonymisées ou archivées pendant la durée requise par les obligations légales, comptables, contractuelles, de sécurité ou de preuve.",
      "Les durées peuvent varier selon la catégorie : compte actif, commande, réservation, facture, paiement, consentement, litige, sécurité ou support.",
      "Les pièces comptables soumises au droit suisse doivent en principe être conservées dix ans à compter de la fin de l’exercice concerné. Cette obligation ne justifie pas de conserver pendant dix ans toutes les données du profil, tous les messages ou tous les événements de navigation.",
      "Pour le compte, le support, les créations et les preuves de consentement, le critère est la nécessité du service, d’une obligation précise ou d’un litige ; une demande d’effacement est examinée par catégorie. Les sauvegardes et les données conservées par un prestataire peuvent suivre un cycle distinct : la suppression visible du compte ne signifie pas un effacement instantané de chaque copie.",
    ],
  },
  {
    title: "9. Sécurité",
    paragraphs: [
      "TOK met en œuvre des mesures techniques et organisationnelles destinées à limiter l'accès non autorisé, la perte, l'altération ou la divulgation de données. Les accès sont limités selon les besoins et les actions sensibles font l'objet de contrôles appropriés.",
      "Aucun système n'offre une sécurité absolue. Si vous pensez que votre compte ou vos données ont été compromis, contactez-nous rapidement.",
    ],
  },
  {
    title: "10. Vos droits",
    paragraphs: [
      "Selon le droit applicable, vous pouvez notamment demander l'accès aux données vous concernant, leur rectification, leur suppression lorsque les conditions sont réunies, ou des informations sur leur traitement.",
      "Certaines données doivent être conservées malgré une demande de suppression lorsqu'une obligation légale, comptable, de prévention de la fraude ou de défense de droits l'exige.",
      "Vous pouvez également initier la suppression de votre compte depuis les fonctions prévues dans l'application.",
      "Le parcours client est Profil → Paramètres du compte → Supprimer mon compte. Vous pouvez aussi demander l’accès, la rectification ou l’effacement par e-mail. Une vérification d’identité proportionnée peut être nécessaire avant de communiquer des données ; n’envoyez pas spontanément une pièce d’identité complète.",
      "Une demande d’accès est en principe traitée gratuitement dans les trente jours. Si une restriction ou un délai supplémentaire est légalement nécessaire, vous devez en être informé avec son motif. Vous pouvez demander la remise ou la transmission de vos données dans un format électronique usuel lorsque les conditions légales sont réunies, retirer un consentement pour l’avenir et vous opposer à un traitement dans les cas prévus par le droit applicable.",
      "Lorsque le RGPD s’applique à votre situation, vous disposez également, selon ses conditions, des droits de limitation, d’opposition et de portabilité ainsi que du droit de saisir l’autorité de contrôle compétente.",
      "Vous pouvez vous adresser au Préposé fédéral à la protection des données et à la transparence (PFPDT) si vous estimez qu’un traitement viole la LPD, sans préjudice des autres voies de droit.",
    ],
  },
  {
    title: "11. Cookies, mesures d'audience et communications",
    paragraphs: [
      "Les cookies et technologies similaires sont décrits dans la Politique cookies. Les communications commerciales sont envoyées selon vos choix et peuvent être désactivées au moyen des mécanismes proposés.",
      "Le bouton Gérer mes cookies permet de refuser ou de retirer séparément la mesure d’audience, le suivi marketing, la personnalisation et la localisation facultative. Un choix de cookies n’est pas une inscription à une newsletter. Le lien de désabonnement d’un e-mail commercial concerne ces communications ; les confirmations et messages nécessaires à une opération demandée restent distincts.",
    ],
  },
  {
    title: "12. Données sensibles, IA et décisions automatisées",
    paragraphs: [
      "Une note d’allergie ou une demande particulière peut révéler une donnée de santé. Ne communiquez que l’information indispensable au restaurant concerné et évitez d’inclure des données de tiers dans des commentaires publics, des demandes IA ou des fichiers marketing. Un outil IA ne remplace pas une vérification des allergènes auprès du restaurant.",
      "Les recommandations et tendances peuvent utiliser vos interactions si vous activez la personnalisation. Sans cet accord, les contenus peuvent être présentés selon des critères généraux ou votre recherche explicite. Les suggestions IA peuvent être inexactes ; un refus ou retrait des choix facultatifs ne supprime pas les éléments nécessaires à la sécurité et à l’exécution d’une opération.",
      "Certaines règles sont automatisées, notamment les vérifications de disponibilité, de paiement ou de garantie de réservation. Si vous contestez une décision individuelle produisant un effet juridique ou vous affectant de manière significative, vous pouvez demander des explications, exprimer votre point de vue et solliciter un examen humain dans les conditions prévues par la loi.",
    ],
  },
  {
    title: "13. Origine des données et informations publiques",
    paragraphs: [
      "Les informations proviennent de vous, des opérations effectuées sur TOK, du restaurant concerné et des prestataires nécessaires au service. Des données professionnelles d’établissements peuvent aussi provenir de sources publiques, d’un registre ou d’un partenaire autorisé, puis être corrigées ou complétées par l’établissement.",
      "Le caractère public d’une adresse professionnelle ne vaut pas, à lui seul, consentement à une prospection commerciale. Un établissement peut demander la source de ses données, une correction ou l’examen d’une opposition en écrivant au contact ci-dessus.",
    ],
  },
  {
    title: "14. Modifications",
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

      <LegalDocumentTools sections={sections} />

      <div className="prose prose-foodhub max-w-none space-y-8">
        {sections.map((section) => (
          <section id={legalSectionId(section.title)} key={section.title} className="scroll-mt-28 space-y-4">
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

        <section className="space-y-3 rounded-2xl border bg-muted/30 p-5 text-sm text-foreground/80">
          <p>Contact données personnelles : <a className="font-medium underline" href={`mailto:${SUPPORT_EMAIL}?subject=Donn%C3%A9es%20personnelles`}>{SUPPORT_EMAIL}</a>.</p>
          <p><a className="font-medium underline" href="https://www.edoeb.admin.ch/fr/droit-dacces" target="_blank" rel="noreferrer">Exercer ses droits auprès du PFPDT</a>.</p>
          Consultez également nos <Link className="font-medium text-primary underline" to={LEGAL_DOCUMENTS.cgu.path}>Conditions générales d'utilisation</Link>.
        </section>
      </div>
    </div>
  );
}
