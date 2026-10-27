import { Link } from "react-router-dom";
import { SUPPORT_EMAIL } from "@/lib/contact";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { LEGAL_DOCUMENTS, LEGAL_EFFECTIVE_DATE_FR, legalSectionId } from "@/lib/legalDocuments";
import LegalDocumentTools from "@/components/legal/LegalDocumentTools";

const sections = [
  {
    title: "1. Objet",
    paragraphs: [
      "Les présentes Conditions Générales d'Utilisation (« CGU ») définissent les règles d'accès et d'utilisation de TOK depuis le site, l'application web et les applications mobiles.",
      "TOK permet notamment de découvrir des restaurants, consulter leurs menus et offres, effectuer des commandes à emporter, réserver une table, utiliser des avantages de fidélité, consulter des contenus et interagir avec les services effectivement disponibles dans l'application.",
    ],
  },
  {
    title: "2. Compte et accès",
    paragraphs: [
      "Certaines fonctions sont accessibles sans compte. Les commandes, réservations, avantages personnalisés, publications et fonctions nécessitant une identité exigent un compte utilisateur.",
      "Vous devez fournir des informations exactes, protéger vos moyens d'authentification et signaler rapidement toute utilisation non autorisée de votre compte.",
      "Vous devez avoir la capacité de conclure l’opération demandée. Une personne mineure doit obtenir l’autorisation de son représentant légal lorsque celle-ci est nécessaire. Un compte professionnel doit être utilisé par une personne habilitée à engager l’établissement.",
      "TOK peut suspendre ou limiter un compte en cas de fraude, abus, atteinte à la sécurité, contenu illicite, impayé ou violation grave des présentes conditions.",
    ],
  },
  {
    title: "3. Restaurants et informations",
    paragraphs: [
      "TOK agit comme intermédiaire entre le client et les restaurants partenaires. Le restaurant reste responsable de ses plats, prix, disponibilités, ingrédients, allergènes, informations alimentaires, horaires, qualité de préparation et conformité de son activité.",
      "Les photos, descriptions, horaires et disponibilités peuvent évoluer. Les informations confirmées dans le panier ou le parcours de réservation au moment de la validation prévalent sur les informations antérieures.",
    ],
  },
  {
    title: "4. Commandes à emporter",
    paragraphs: [
      "Une commande à emporter est une commande préparée par le restaurant et récupérée par le client au restaurant, au créneau indiqué. Ce parcours n'inclut aucun transport de la commande au domicile du client.",
      "Le panier précise les articles, quantités, réductions, éventuels frais applicables, taxes et total avant confirmation. Le paiement en ligne peut être traité par Stripe avec les moyens de paiement proposés dans le parcours.",
      "La commande n'est considérée comme payée que lorsque le prestataire de paiement confirme la transaction. Le restaurant peut ensuite confirmer la préparation selon ses horaires, stocks et capacités.",
      "En cas d'annulation, rupture, erreur ou remboursement, les modalités affichées dans le parcours et les règles du moyen de paiement s'appliquent. Un remboursement bancaire peut nécessiter plusieurs jours avant d'apparaître sur le compte du client.",
      "Avant de confirmer, vérifiez le restaurant, les articles, le créneau de retrait, vos coordonnées et le total ; revenez aux étapes précédentes pour corriger une erreur. Après validation, consultez la confirmation et le statut dans Mes commandes. Un panier ou un paiement en cours ne prouve pas à lui seul l’acceptation de la commande.",
      "Le droit suisse ne prévoit pas de droit général de rétractation pour un achat en ligne. Cela n’écarte pas les droits impératifs applicables, les conditions d’annulation annoncées, ni les recours en cas de prestation non exécutée ou défectueuse. En cas de problème, contactez le restaurant et le support avec la référence ; ne transmettez jamais de numéro complet de carte.",
    ],
  },
  {
    title: "5. Réservations",
    paragraphs: [
      "Une réservation bloque une table ou un créneau selon les disponibilités communiquées par le restaurant. Certaines expériences peuvent comporter des conditions particulières clairement affichées avant confirmation.",
      "Le client doit respecter l'horaire, la taille du groupe et les conditions d'annulation affichées. Le restaurant reste responsable de l'accueil et de l'exécution de la prestation sur place.",
      "Pour une nouvelle réservation classique de 7 convives ou plus, une carte bancaire peut être exigée comme garantie. Cette exigence s'applique également si le client a déjà annulé au moins 3 réservations de sa propre initiative pendant l'année civile en cours, calculée selon le fuseau Europe/Zurich.",
      "La carte est enregistrée via Stripe avec accord explicite du client et sans paiement initial. Si le client annule cette réservation garantie, une indemnité de 10 CHF par convive, dont le total est présenté avant validation, peut être débitée ultérieurement sur cette carte, même pour une annulation anticipée. Il n'y a pas de pénalité pour une annulation décidée par le restaurant, ni pour les réservations antérieures n'ayant pas été assorties de cette garantie.",
      "En cas de difficulté de paiement ou d'authentification bancaire, TOK peut demander au client de régulariser les frais par un parcours sécurisé. Le client peut signaler une erreur ou contester une pénalité auprès du support et demander un examen humain. Les dispositions légales impératives demeurent applicables.",
    ],
  },
  {
    title: "6. Prix et paiements",
    paragraphs: [
      "Les montants facturés au client sont affichés en francs suisses (CHF), taxes comprises lorsque cela est indiqué. Aucun montant non présenté avant validation ne doit être ajouté au paiement du client.",
      "TOK peut utiliser des prestataires de paiement réglementés. TOK ne conserve pas le numéro complet de la carte bancaire lorsque le paiement est traité par un prestataire externe.",
      "Les pourboires, lorsqu'ils sont proposés, sont facultatifs et identifiés séparément.",
    ],
  },
  {
    title: "7. Tok One, Miamz et avantages",
    paragraphs: [
      "Les Miamz ne constituent pas une monnaie, un compte bancaire, un dépôt ou un actif financier et sont sans valeur en espèces en dehors des usages expressément proposés par TOK.",
      "Le nombre de Miamz attribués, leur durée de validité, les conditions d'utilisation et les avantages accessibles sont affichés dans l'application ou dans l'opération concernée.",
      "Une annulation, un remboursement, une fraude, un abus ou une erreur technique peut entraîner l'annulation ou la correction des Miamz liés à l'opération concernée.",
      "Les dons solidaires, lorsqu'ils sont proposés, précisent leur destination, les conditions de conversion des avantages et les informations disponibles sur la redistribution.",
      "Tok One peut donner accès à des réductions, priorités, offres partenaires, support prioritaire, tables ou expériences VIP et autres avantages décrits dans l'application. Les droits applicables sont ceux de la formule active au moment de l'utilisation.",
      "Les conditions de souscription, renouvellement et résiliation de Tok One sont présentées dans le parcours d'achat concerné.",
      "Avant une souscription payante, vérifiez le prix, la période, le renouvellement et la date de prochaine échéance. La résiliation s’effectue dans le parcours de gestion proposé ; pour un achat Apple, utilisez la gestion des abonnements Apple. Supprimer l’application ne résilie pas un abonnement. Une période commencée n’est pas automatiquement remboursée, sous réserve d’une erreur, d’un accord ou d’un droit impératif.",
    ],
  },
  {
    title: "8. Actualités, avis, contenus et campagnes sponsorisées",
    paragraphs: [
      "Les utilisateurs doivent publier uniquement des contenus licites et respecter les droits de tiers. Les contenus haineux, menaçants, frauduleux, diffamatoires, discriminatoires, sexuellement explicites, violents ou destinés au harcèlement peuvent être modérés ou supprimés.",
      "TOK met à disposition des mécanismes de signalement et de blocage. Un compte peut être suspendu ou supprimé en cas d'abus répétés ou graves.",
      "Les campagnes sponsorisées et autres mises en avant payantes doivent être clairement identifiées. Un post ne doit être présenté comme sponsorisé que lorsque la mise en avant est effectivement active.",
      "Le budget et la durée d'une campagne, ainsi que les principales conditions de diffusion, sont présentés au restaurateur avant validation. TOK ne garantit aucun volume de vues, clics, réservations, commandes ou chiffre d'affaires.",
    ],
  },
  {
    title: "9. Outils d'intelligence artificielle",
    paragraphs: [
      "Certaines fonctions peuvent utiliser des systèmes d'intelligence artificielle pour assister la recherche, le support, la rédaction, l'analyse ou la création de contenus.",
      "Les résultats peuvent comporter des erreurs. Les informations importantes, notamment prix, allergènes, disponibilités, informations contractuelles ou décisions commerciales, doivent être vérifiées avant utilisation.",
      "Les photos générées ou retouchées par IA et les textes assistés ne doivent pas induire les utilisateurs en erreur sur un plat, un prix, une disponibilité, une origine, un allergène ou une caractéristique essentielle de l'offre.",
      "Avant une génération ou une commande d’impression payante, vérifiez le coût ou les crédits annoncés et confirmez l’action demandée. La génération d’un visuel ne vaut pas publication sur un réseau social ni commande d’impression. Vérifiez le format, les marges, le texte, les prix et le résultat final avant toute diffusion ou impression.",
      "Vous devez disposer des droits nécessaires sur les photos, logos, marques et références que vous importez. N’y placez pas de données confidentielles, de documents d’identité ou de données de santé de tiers. Un résultat IA peut ressembler à un autre contenu et son exclusivité ou sa protection juridique n’est pas garantie.",
    ],
  },
  {
    title: "10. Intégrations TOK Connect et partenaires autorisés",
    paragraphs: [
      "TOK Connect permet à des partenaires approuvés d'interagir avec certaines fonctions de TOK dans la limite des permissions accordées par TOK et, lorsque nécessaire, par le restaurant concerné.",
      "Un partenaire autorisé ne peut utiliser que les données et actions nécessaires à l'intégration convenue. Les autorisations peuvent être limitées, suspendues ou révoquées en cas de risque, d'abus, de non-conformité ou à la demande du restaurant lorsque son autorisation est requise.",
      "Lorsqu'une réservation ou une autre action réelle est confirmée au moyen d'une intégration autorisée, les mêmes règles commerciales et opérationnelles que dans TOK s'appliquent. Les environnements de test ne valent jamais confirmation d'une opération réelle.",
    ],
  },
  {
    title: "11. Disponibilité et responsabilité",
    paragraphs: [
      "TOK met en œuvre des moyens raisonnables pour assurer la disponibilité et la sécurité de la plateforme, sans garantir un fonctionnement ininterrompu ou exempt de toute erreur.",
      "TOK n'est pas responsable des informations erronées fournies par un restaurant, d'une indisponibilité de stock, d'un retard de préparation, d'une interruption imputable à un prestataire tiers ou d'un usage contraire aux présentes CGU, sous réserve des responsabilités qui ne peuvent être exclues par la loi.",
    ],
  },
  {
    title: "12. Données personnelles",
    paragraphs: [
      "Le traitement des données personnelles est décrit dans la Politique de confidentialité. Celle-ci précise les catégories de données, finalités, destinataires, durées de conservation et droits des personnes concernées.",
    ],
  },
  {
    title: "13. Modification des CGU",
    paragraphs: [
      "TOK peut mettre à jour les présentes CGU afin de refléter une évolution légale, fonctionnelle ou commerciale. La version et sa date d'effet sont indiquées en tête du document. Lorsqu'une nouvelle acceptation est nécessaire, l'utilisateur en est informé dans l'application.",
    ],
  },
  {
    title: "14. Droit applicable et contact",
    paragraphs: [
      "Les présentes CGU sont régies par le droit suisse, sous réserve des dispositions impératives applicables au consommateur.",
      "Les fors impératifs du consommateur demeurent réservés. Pour une réclamation, indiquez l’établissement, la date et la référence de l’opération ; les conditions particulières expressément acceptées s’appliquent à cette opération sans supprimer vos droits impératifs.",
      `Pour toute question concernant ces conditions, vous pouvez contacter TOK à ${SUPPORT_EMAIL}.`,
    ],
  },
  {
    title: "15. Contenus, droits d’utilisation et signalements",
    paragraphs: [
      "Vous conservez les droits dont vous disposez sur vos contenus. Leur mise en ligne autorise TOK à les héberger, les adapter techniquement et les afficher dans la mesure nécessaire au service demandé. Elle n’autorise pas la vente de vos droits ni une utilisation étrangère à cette finalité.",
      "Utilisez le signalement disponible sur le contenu ou contactez le support en précisant le lien, la raison du signalement et vos éléments utiles. Vous pouvez demander un réexamen d’une mesure de modération. Les droits des autres personnes, les obligations légales et les éléments nécessaires à un litige peuvent limiter un retrait immédiat.",
    ],
  },
  {
    title: "16. Fermeture du compte et choix de confidentialité",
    paragraphs: [
      "Vous pouvez demander la suppression de votre compte depuis Profil, Paramètres du compte, Supprimer mon compte, ou contacter le support. Avant de confirmer, vérifiez vos opérations en cours et la gestion de vos abonnements ; la suppression du compte n’efface pas les obligations déjà nées ni les pièces que la loi impose de conserver.",
      "L’acceptation des conditions du service est distincte des choix facultatifs de cookies et de traceurs. Refuser ces catégories n’empêche pas la consultation du site ni les fonctions qui en sont indépendantes. Les traitements et droits associés sont détaillés dans les politiques de confidentialité et de cookies.",
    ],
  },
] as const;

export default function CGU() {
  useSeoMeta({
    title: "Conditions générales d'utilisation | TOK",
    description: "Règles applicables aux comptes, commandes à emporter, réservations, paiements et services TOK.",
    path: "/cgu",
  });

  return (
    <div className="container max-w-4xl space-y-12 py-12 md:py-20">
      <div className="space-y-4">
        <h1 className="font-display text-4xl font-bold">Conditions Générales d'Utilisation</h1>
        <p className="text-muted-foreground">
          Version {LEGAL_DOCUMENTS.cgu.version} — applicable dès le {LEGAL_EFFECTIVE_DATE_FR}
        </p>
      </div>

      <LegalDocumentTools sections={sections} />

      <div className="prose prose-foodhub max-w-none space-y-8">
        {sections.map((section) => (
          <section id={legalSectionId(section.title)} key={section.title} className="scroll-mt-28 space-y-4">
            <h2 className="text-2xl font-semibold">{section.title}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className="text-foreground/80 leading-relaxed">
                {paragraph}
              </p>
            ))}
          </section>
        ))}

        <section className="space-y-3 rounded-2xl border bg-muted/30 p-5">
          <h2 className="text-xl font-semibold">Documents associés</h2>
          <div className="flex flex-wrap gap-4 text-sm">
            <Link className="font-medium text-primary underline" to={LEGAL_DOCUMENTS.privacy.path}>
              Politique de confidentialité
            </Link>
            <Link className="font-medium text-primary underline" to={LEGAL_DOCUMENTS.restaurantTerms.path}>
              Conditions restaurateurs
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
