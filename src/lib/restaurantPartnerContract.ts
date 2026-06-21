export const RESTAURANT_PARTNER_CONTRACT_VERSION = "TOK-CH-RP-2026-06-v1";

export const RESTAURANT_PARTNER_CONTRACT_TITLE =
  "Contrat de partenariat restaurateur TOK";

export const RESTAURANT_PARTNER_CONTRACT_SECTIONS = [
  {
    title: "1. Parties, périmètre et documents contractuels",
    paragraphs: [
      "Le présent contrat encadre la mise à disposition par TOK d'une plateforme digitale de visibilité, réservation, commande, paiement, livraison, fidélité, campagnes, support et outils opérationnels au bénéfice du restaurateur partenaire.",
      "Le restaurateur confirme disposer des autorisations, assurances, licences, droits d'exploitation, pouvoirs de signature et informations commerciales nécessaires pour vendre ses produits et services sur TOK.",
      "Le contrat comprend le présent document, les conditions restaurateurs publiées par TOK, les politiques opérationnelles applicables, les grilles tarifaires ou packs acceptés, les règles de paiement Stripe/Supabase et tout avenant validé numériquement.",
    ],
  },
  {
    title: "2. Obligations du restaurateur",
    paragraphs: [
      "Le restaurateur maintient une fiche exacte: nom légal, enseigne, adresse, horaires, allergènes, prix, TVA le cas échéant, moyens de contact, disponibilités, délais de préparation, photos, menus, stocks et informations de livraison ou retrait.",
      "Il s'engage à honorer les commandes, réservations, offres, abonnements, ventes flash et avantages de fidélité acceptés sur TOK, sauf cas de force majeure ou incident signalé immédiatement au support.",
      "Il garantit l'hygiène, la sécurité alimentaire, la conformité des produits, la gestion des allergènes, la traçabilité interne, la qualité des emballages et la conformité aux lois suisses applicables.",
    ],
  },
  {
    title: "3. Obligations TOK",
    paragraphs: [
      "TOK fournit l'accès au dashboard restaurateur, aux outils de catalogue, commandes, réservations, avis, facturation, support, notifications, campagnes, reporting et fonctionnalités activées par feature flag ou pack souscrit.",
      "TOK assure une exploitation raisonnable de la plateforme, la sécurisation des accès, la journalisation des actions sensibles, la séparation des rôles, l'application des politiques RLS et les intégrations de paiement dans la limite des prestataires tiers.",
      "TOK peut modérer, suspendre ou corriger une fiche lorsqu'une information est manifestement trompeuse, incomplète, risquée pour les clients ou contraire aux règles de la plateforme.",
    ],
  },
  {
    title: "4. Prix, commissions, frais et facturation",
    paragraphs: [
      "Les commissions, frais de service, packs de lancement, abonnements, crédits IA/campagnes, frais de paiement, frais de livraison, remboursements et avoirs sont calculés selon la configuration validée dans le dashboard ou par l'admin TOK.",
      "Le restaurateur accepte que les montants clients, remises, taxes, frais, commissions TOK et éventuels frais Stripe soient réconciliés dans les exports, factures, soldes et rapports comptables disponibles dans les dashboards.",
      "Toute contestation comptable doit être signalée avec justificatifs dans un délai raisonnable. Les corrections validées sont tracées, non destructives et rattachées au restaurant concerné.",
    ],
  },
  {
    title: "5. Paiements, remboursements et Stripe Connect",
    paragraphs: [
      "Les paiements peuvent être traités par Stripe, Stripe Connect ou tout prestataire activé par TOK. Le restaurateur fournit des informations de paiement exactes et maintient son compte connecté opérationnel.",
      "Les remboursements, annulations, litiges, rétrofacturations, paiements échoués ou paiements sans commande confirmée sont traités selon les workflows TOK et les règles du prestataire de paiement.",
      "Le restaurateur ne doit jamais demander au client de contourner le paiement TOK pour une commande ou réservation initiée sur la plateforme, sauf instruction écrite de TOK lors d'un incident opérationnel.",
    ],
  },
  {
    title: "6. Données, confidentialité et sécurité",
    paragraphs: [
      "Chaque partie traite les données clients, commandes, réservations, avis, documents et informations commerciales conformément aux lois applicables, aux finalités de service et aux droits d'accès autorisés.",
      "Le restaurateur protège ses identifiants, limite l'accès à son dashboard aux personnes autorisées et signale immédiatement toute suspicion de compromission, fuite de données ou erreur d'accès.",
      "TOK conserve les preuves de signature, horodatages, versions contractuelles, événements d'audit et métadonnées nécessaires à la preuve, à la sécurité, au support et à la conformité.",
    ],
  },
  {
    title: "7. Propriété intellectuelle, contenus et IA",
    paragraphs: [
      "Le restaurateur garantit disposer des droits sur les menus, marques, photos, logos, textes, recettes publiables et contenus transmis à TOK. Il autorise TOK à les utiliser pour exploiter, promouvoir et référencer le restaurant sur la plateforme.",
      "Les contenus générés ou assistés par IA doivent être vérifiés par le restaurateur avant publication. Les informations critiques, prix, allergènes, disponibilités et promesses commerciales restent sous sa responsabilité.",
      "TOK peut refuser ou retirer tout contenu illicite, trompeur, discriminatoire, dangereux, contraire à l'image de la plateforme ou portant atteinte aux droits de tiers.",
    ],
  },
  {
    title: "8. Avis, support, incidents et qualité de service",
    paragraphs: [
      "Le restaurateur répond aux avis et demandes support de façon professionnelle, sans pression indue sur les clients. Les réponses peuvent être modérées si elles enfreignent les règles de TOK.",
      "Les incidents de préparation, retard, rupture, réservation invisible, client non servi, erreur de prix, erreur de paiement ou problème de livreur doivent être signalés rapidement depuis les canaux prévus.",
      "TOK peut journaliser les incidents, recommander des corrections, suspendre temporairement une offre ou demander un plan d'action qualité lorsque le niveau de service se dégrade.",
    ],
  },
  {
    title: "9. Durée, suspension, résiliation et archivage",
    paragraphs: [
      "Le contrat prend effet à la signature numérique et demeure applicable tant que le restaurant utilise TOK, sauf résiliation, suspension ou remplacement par une nouvelle version acceptée.",
      "TOK peut suspendre un restaurant en cas de risque client, fraude, impayé, violation contractuelle, contenu illicite, défaut de conformité, incident sécurité ou demande administrative.",
      "La résiliation n'efface pas les obligations de paiement, remboursement, confidentialité, preuve, audit, conservation comptable, gestion des litiges et commandes ou réservations déjà acceptées.",
    ],
  },
  {
    title: "10. Signature numérique et preuve",
    paragraphs: [
      "La signature numérique par case d'acceptation, nom du signataire et action authentifiée dans le dashboard vaut consentement, preuve d'acceptation et rattachement au profil du restaurant.",
      "Le signataire déclare être habilité à engager le restaurateur. La version signée est enregistrée dans le dashboard admin et le dashboard restaurateur avec horodatage, identifiant utilisateur et version contractuelle.",
      "Toute nouvelle version substantielle du contrat pourra nécessiter une nouvelle signature numérique avant l'activation ou la poursuite de certaines fonctionnalités.",
    ],
  },
] as const;

export function getRestaurantPartnerContractPlainText() {
  return [
    `${RESTAURANT_PARTNER_CONTRACT_TITLE} — Version ${RESTAURANT_PARTNER_CONTRACT_VERSION}`,
    ...RESTAURANT_PARTNER_CONTRACT_SECTIONS.flatMap((section) => [
      section.title,
      ...section.paragraphs,
    ]),
  ].join("\n\n");
}
