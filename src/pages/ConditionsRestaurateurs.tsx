import { Link } from "react-router-dom";
import { SUPPORT_EMAIL } from "@/lib/contact";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { LEGAL_DOCUMENTS, LEGAL_EFFECTIVE_DATE_FR } from "@/lib/legalDocuments";

const updatedAt = LEGAL_EFFECTIVE_DATE_FR;

const quickPoints = [
  "Abonnements : Starter CHF 69, Business CHF 129, Premium CHF 199 et Elite CHF 499 par mois ; l'annuel correspond à 12 mois de service au prix de 11 mensualités.",
  "Toute réservation réellement honorée et traitée par TOK est facturée CHF 5 ; annulations, no-shows et remboursements ne sont pas facturés comme réservation honorée.",
  "Toute commande marketplace à emporter applique une répartition fixe : 90 % de la base commissionnable au restaurant et 10 % à TOK, quel que soit l'abonnement.",
  "Les pourboires reviennent à 100 % au restaurant et ne sont pas compris dans la commission TOK.",
  "Elite couvre trois établissements ; chaque site additionnel coûte CHF 149 par mois.",
] as const;

const sections = [
  {
    title: "1. Objet et champ d'application",
    body: [
      "Les présentes Conditions Générales Restaurateurs régissent les relations entre TOK et les établissements partenaires utilisant la plateforme pour leur fiche, leurs menus, commandes à emporter, réservations, offres, contenus, campagnes, outils marketing, outils IA, facturation, statistiques et services associés effectivement disponibles.",
      "L'utilisation de l'espace restaurateur et des services TOK implique l'acceptation des présentes conditions, sous réserve de tout contrat spécifique signé entre les parties.",
    ],
  },
  {
    title: "2. Onboarding et compte restaurateur",
    body: [
      "Le restaurateur fournit des informations exactes et à jour concernant notamment son identité commerciale, son représentant autorisé, ses coordonnées, son adresse, ses informations fiscales et de facturation ainsi que les justificatifs nécessaires à l'activation du service.",
      "TOK peut demander des informations complémentaires, refuser ou suspendre une activation lorsque le dossier est incomplet, incohérent, frauduleux, non conforme ou présente un risque sérieux pour les utilisateurs ou la plateforme.",
      "Le restaurateur est responsable des actions effectuées depuis son compte par les personnes auxquelles il a accordé un accès.",
    ],
  },
  {
    title: "3. Informations, menus et conformité",
    body: [
      "Le restaurateur maintient à jour ses horaires, disponibilités, menus, prix, photos, allergènes, ingrédients, délais de préparation, conditions de retrait, coordonnées et informations commerciales.",
      "Il demeure responsable de la préparation, de la conservation, de l'hygiène, de la qualité, de la conformité, de la traçabilité et de la sécurité alimentaire des produits proposés.",
      "Les outils d'assistance ou d'intelligence artificielle ne remplacent pas la vérification du restaurateur. Celui-ci doit contrôler avant publication les prix, allergènes, ingrédients, disponibilités, informations obligatoires et droits sur les contenus.",
    ],
  },
  {
    title: "4. Commandes à emporter",
    body: [
      "Le mode à emporter correspond à une commande préparée par le restaurant et récupérée par le client au restaurant au créneau convenu. Il ne comprend aucun transport de la commande au domicile du client.",
      "Le restaurateur doit maintenir ses créneaux de retrait et son stock à jour, préparer la commande dans les conditions annoncées et signaler rapidement toute impossibilité d'exécution.",
      "Les paiements en ligne peuvent être traités par Stripe ou un autre moyen proposé par TOK. Le reversement au restaurant dépend de la confirmation effective de la transaction et des éventuels remboursements ou contestations.",
    ],
  },
  {
    title: "5. Tarifs des abonnements",
    body: [
      "Les abonnements mensuels sont : Starter CHF 69, Business CHF 129, Premium CHF 199 et Elite CHF 499. Sauf offre particulière acceptée par écrit, l'abonnement annuel fournit douze mois de service et est facturé au prix de onze mensualités.",
      "Elite inclut trois établissements. Chaque établissement additionnel est facturé CHF 149 par mois. Les autres formules couvrent un établissement sauf accord spécifique.",
      "Le niveau d'abonnement détermine les fonctionnalités et quotas inclus, mais ne modifie pas le pourcentage de commission d'une commande marketplace à emporter.",
    ],
  },
  {
    title: "6. Réservations",
    body: [
      "Une réservation réellement honorée et traitée par TOK est facturée CHF 5. Ce forfait est identique pour tous les abonnements et n'est pas calculé en pourcentage du chiffre d'affaires de la table.",
      "Une annulation, un no-show ou une réservation remboursée avant clôture n'est pas facturé comme une réservation honorée. En cas d'erreur de statut, TOK et le restaurateur peuvent procéder à une correction documentée.",
    ],
  },
  {
    title: "7. Commission sur les commandes à emporter",
    body: [
      "La commission marketplace est fixe pour tous les abonnements : le restaurant reçoit 90 % de la base commissionnable et TOK conserve 10 %.",
      "Il n'existe pas de taux dégressif de commission marketplace selon le plan Starter, Business, Premium ou Elite.",
      "La base commissionnable correspond aux montants de commande effectivement encaissés et non remboursés qui sont soumis à la commission TOK. Les pourboires en sont exclus et reviennent intégralement au restaurant.",
      "Les frais de traitement du paiement supportés par TOK pour le flux marketplace sont assumés sur la part TOK, sauf frais distinct expressément affiché et accepté dans un service séparé.",
    ],
  },
  {
    title: "8. Facturation, reversements et taxes",
    body: [
      "Les factures et relevés distinguent les abonnements, réservations, commissions, remboursements, avoirs et autres prestations payantes applicables au restaurant.",
      "Les montants sont ventilés selon les règles fiscales applicables. Le restaurateur demeure responsable de la qualification fiscale de ses propres ventes et de ses obligations comptables et fiscales.",
      "Les reversements dépendent des transactions effectivement encaissées, des remboursements, contestations et exigences du prestataire de paiement. TOK peut suspendre un reversement en cas de contrôle, fraude présumée ou exigence réglementaire du prestataire.",
    ],
  },
  {
    title: "9. Offres, campagnes, contenus et Google Business",
    body: [
      "Le restaurateur est responsable des prix, stocks, remises, horaires, conditions et contenus associés à ses offres, ventes flash, opérations anti-gaspi, publications et campagnes.",
      "Toute communication commerciale doit être exacte, non trompeuse et conforme au droit applicable. TOK peut refuser, suspendre ou retirer un contenu qui présente un risque juridique, de sécurité ou de tromperie pour les utilisateurs.",
      "TOK ne garantit aucun volume de vues, clics, commandes, réservations ou chiffre d'affaires issu d'une campagne ou d'un outil d'assistance.",
      "Les contenus sponsorisés doivent être clairement identifiés et ne peuvent présenter une offre, un prix, une disponibilité ou une caractéristique de manière trompeuse.",
      "Toute intervention de TOK sur une fiche Google Business Profile nécessite un mandat du restaurateur et les droits d'accès appropriés. TOK ne garantit aucun classement, niveau de visibilité ou résultat commercial dans Google.",
      "Si Google contrôle, suspend ou bloque la fiche, l'intervention de TOK et les délais associés peuvent être suspendus jusqu'à ce que les accès et validations nécessaires soient de nouveau disponibles.",
    ],
  },
  {
    title: "10. Données personnelles et confidentialité",
    body: [
      "Chaque partie traite les données personnelles uniquement dans le cadre nécessaire aux services, à la sécurité, au support, à la facturation et aux obligations légales applicables.",
      "Le restaurateur protège ses accès, limite les droits de son équipe aux besoins professionnels et signale sans délai toute suspicion de compromission ou d'accès non autorisé.",
      "Les catégories de données, prestataires et droits des personnes sont décrits dans la Politique de confidentialité TOK.",
    ],
  },
  {
    title: "11. Propriété intellectuelle et intelligence artificielle",
    body: [
      "Le restaurateur garantit disposer des droits nécessaires sur les marques, logos, menus, photographies, vidéos et autres contenus qu'il transmet ou publie via TOK.",
      "Les contenus générés ou assistés par intelligence artificielle doivent être vérifiés avant publication. Le restaurateur reste responsable des informations commerciales et alimentaires qu'il valide.",
      "Les photos générées ou retouchées par intelligence artificielle ne doivent pas induire le client en erreur sur le produit réellement proposé.",
    ],
  },
  {
    title: "12. Support, incidents et responsabilité",
    body: [
      "Les incidents relatifs à une commande, réservation, paiement, contenu, sécurité alimentaire ou accès au compte doivent être signalés rapidement avec les informations utiles à leur résolution.",
      "TOK met en œuvre des moyens raisonnables pour exploiter la plateforme, mais ne garantit pas un service ininterrompu ni l'absence totale d'erreurs ou d'indisponibilités de prestataires tiers.",
      "Chaque partie reste responsable des manquements qui lui sont imputables, sous réserve des dispositions impératives du droit suisse.",
    ],
  },
  {
    title: "13. Durée, suspension et résiliation",
    body: [
      "Le partenariat demeure applicable tant que le restaurant utilise TOK, sous réserve de la durée ou de l'engagement d'abonnement accepté. Les opérations déjà engagées, factures, remboursements et litiges restent traités après résiliation lorsqu'ils se rapportent à une période antérieure.",
      "TOK peut suspendre ou résilier un accès en cas de fraude, impayé, risque pour les clients, non-conformité grave, incident de sécurité ou violation substantielle des conditions.",
    ],
  },
  {
    title: "14. TOK Connect et partenaires autorisés",
    body: [
      "Le restaurateur peut autoriser ou révoquer un partenaire TOK Connect pour son établissement au moyen des contrôles mis à sa disposition lorsque cette intégration est disponible.",
      "Les autorisations sont limitées aux usages nécessaires au partenaire. Le restaurateur doit vérifier les partenaires auxquels il accorde un accès et retirer une autorisation devenue inutile ou inappropriée.",
      "Une réservation réelle ou une autre opération confirmée au moyen d'une intégration autorisée engage le restaurant dans les mêmes conditions qu'une opération équivalente confirmée dans TOK, sous réserve des droits de correction et d'annulation applicables.",
      "TOK peut suspendre une intégration en cas de risque, d'abus, d'accès non autorisé ou de non-conformité.",
    ],
  },
  {
    title: "15. Droit applicable et contact",
    body: [
      "Les présentes conditions sont régies par le droit suisse. Les règles impératives de compétence demeurent réservées.",
      `Pour toute question contractuelle ou de facturation, contactez TOK à ${SUPPORT_EMAIL}.`,
    ],
  },
] as const;

export default function ConditionsRestaurateurs() {
  useSeoMeta({
    title: "Conditions restaurateurs | TOK",
    description: "Conditions de partenariat TOK : abonnements, réservation forfaitaire et répartition fixe 90 % restaurant / 10 % TOK sur les commandes à emporter.",
    path: "/conditions-restaurateurs",
  });

  return (
    <div className="container max-w-5xl space-y-12 py-12 md:py-20">
      <div className="space-y-4">
        <h1 className="font-display text-4xl font-bold">Conditions Générales Restaurateurs</h1>
        <p className="text-muted-foreground">
          Version {LEGAL_DOCUMENTS.restaurantTerms.version} — mise à jour le {updatedAt}
        </p>
      </div>

      <section className="rounded-2xl border bg-primary/5 p-5">
        <h2 className="mb-3 text-xl font-semibold">À retenir</h2>
        <ul className="list-disc space-y-2 pl-6 text-sm text-foreground/80">
          {quickPoints.map((point) => <li key={point}>{point}</li>)}
        </ul>
      </section>

      <div className="prose prose-foodhub max-w-none space-y-8">
        {sections.map((section) => (
          <section key={section.title} className="space-y-4">
            <h2 className="text-2xl font-semibold">{section.title}</h2>
            {section.body.map((paragraph) => (
              <p key={paragraph} className="text-foreground/80 leading-relaxed">
                {paragraph}
              </p>
            ))}
          </section>
        ))}

        <section className="rounded-2xl border bg-muted/30 p-5 text-sm text-foreground/80">
          Documents associés :{" "}
          <Link className="font-medium text-primary underline" to={LEGAL_DOCUMENTS.cgu.path}>CGU</Link>
          {" · "}
          <Link className="font-medium text-primary underline" to={LEGAL_DOCUMENTS.privacy.path}>Politique de confidentialité</Link>
        </section>
      </div>
    </div>
  );
}
