import { Link } from "react-router-dom";
import { SUPPORT_EMAIL } from "@/lib/contact";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { LEGAL_DOCUMENTS, LEGAL_EFFECTIVE_DATE_FR } from "@/lib/legalDocuments";

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
    ],
  },
  {
    title: "5. Réservations",
    paragraphs: [
      "Une réservation bloque une table ou un créneau selon les disponibilités communiquées par le restaurant. Certaines expériences peuvent comporter des conditions particulières clairement affichées avant confirmation.",
      "Le client doit respecter l'horaire, la taille du groupe et les conditions d'annulation affichées. Le restaurant reste responsable de l'accueil et de l'exécution de la prestation sur place.",
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
      "Les Miamz et avantages de fidélité n'ont pas de valeur monétaire en dehors de TOK et ne constituent pas un compte bancaire, un dépôt ou un actif financier.",
      "Tok One peut donner accès à des réductions, priorités, offres partenaires, support prioritaire ou autres avantages décrits dans l'application. Les droits applicables sont ceux de la formule active au moment de l'utilisation.",
      "Les conditions de souscription, renouvellement et résiliation de Tok One sont présentées dans le parcours d'achat concerné.",
    ],
  },
  {
    title: "8. Actualités, avis et contenus utilisateurs",
    paragraphs: [
      "Les utilisateurs doivent publier uniquement des contenus licites et respecter les droits de tiers. Les contenus haineux, menaçants, frauduleux, diffamatoires, discriminatoires, sexuellement explicites, violents ou destinés au harcèlement peuvent être modérés ou supprimés.",
      "TOK met à disposition des mécanismes de signalement et de blocage. Un compte peut être suspendu ou supprimé en cas d'abus répétés ou graves.",
    ],
  },
  {
    title: "9. Outils d'intelligence artificielle",
    paragraphs: [
      "Certaines fonctions peuvent utiliser des systèmes d'intelligence artificielle pour assister la recherche, le support, la rédaction, l'analyse ou la création de contenus.",
      "Les résultats peuvent comporter des erreurs. Les informations importantes, notamment prix, allergènes, disponibilités, informations contractuelles ou décisions commerciales, doivent être vérifiées avant utilisation.",
    ],
  },
  {
    title: "10. Disponibilité et responsabilité",
    paragraphs: [
      "TOK met en œuvre des moyens raisonnables pour assurer la disponibilité et la sécurité de la plateforme, sans garantir un fonctionnement ininterrompu ou exempt de toute erreur.",
      "TOK n'est pas responsable des informations erronées fournies par un restaurant, d'une indisponibilité de stock, d'un retard de préparation, d'une interruption imputable à un prestataire tiers ou d'un usage contraire aux présentes CGU, sous réserve des responsabilités qui ne peuvent être exclues par la loi.",
    ],
  },
  {
    title: "11. Données personnelles",
    paragraphs: [
      "Le traitement des données personnelles est décrit dans la Politique de confidentialité. Celle-ci précise les catégories de données, finalités, destinataires, durées de conservation et droits des personnes concernées.",
    ],
  },
  {
    title: "12. Modification des CGU",
    paragraphs: [
      "TOK peut mettre à jour les présentes CGU afin de refléter une évolution légale, fonctionnelle ou commerciale. La version et sa date d'effet sont indiquées en tête du document. Lorsqu'une nouvelle acceptation est nécessaire, l'utilisateur en est informé dans l'application.",
    ],
  },
  {
    title: "13. Droit applicable et contact",
    paragraphs: [
      "Les présentes CGU sont régies par le droit suisse, sous réserve des dispositions impératives applicables au consommateur.",
      `Pour toute question concernant ces conditions, vous pouvez contacter TOK à ${SUPPORT_EMAIL}.`,
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

      <div className="prose prose-foodhub max-w-none space-y-8">
        {sections.map((section) => (
          <section key={section.title} className="space-y-4">
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
