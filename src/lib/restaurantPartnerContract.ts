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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const TOK_CONTRACT_LEGAL_INFORMATION = {
  companyName: "TOK",
  legalName: "TOK Platform Switzerland",
  address: "Genève, Suisse",
  email: "support@thetok.ch",
  website: "https://www.thetok.ch",
  adminWebsite: "https://admin.thetok.ch",
  jurisdiction: "Genève, Suisse",
} as const;

type RestaurantPartnerContractHtmlInput = {
  signerName: string;
  signatureDataUrl?: string;
  signedAt: string;
  legalName: string;
  businessName: string;
  restaurantName: string;
  restaurateurFirstName?: string | null;
  restaurateurLastName?: string | null;
  restaurateurDateOfBirth?: string | null;
  restaurateurAddress?: string | null;
  restaurateurPhone?: string | null;
  restaurantAddress?: string | null;
  restaurantPhone?: string | null;
  businessRegistrationNumber?: string | null;
  city?: string | null;
  place?: string | null;
  tokLegalName?: string;
  tokCompanyName?: string;
  tokAddress?: string;
  tokEmail?: string;
  tokWebsite?: string;
  tokAdminWebsite?: string;
  tokJurisdiction?: string;
};

function displayValue(value?: string | null) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || "Non renseigné";
}

function formatContractDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return displayValue(value);
  return date.toLocaleDateString("fr-CH");
}

export function generateSignedRestaurantPartnerContractHtml(input: RestaurantPartnerContractHtmlInput) {
  const sections = RESTAURANT_PARTNER_CONTRACT_SECTIONS.map((section) => `
    <section>
      <h2>${escapeHtml(section.title)}</h2>
      ${section.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}
    </section>
  `).join("");

  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(RESTAURANT_PARTNER_CONTRACT_TITLE)} - ${escapeHtml(input.restaurantName || input.businessName || input.legalName || input.signerName)}</title>
  <style>
    body { color: #0f172a; font-family: Arial, sans-serif; line-height: 1.5; margin: 32px; }
    h1 { font-size: 24px; margin-bottom: 4px; }
    h2 { font-size: 16px; margin-top: 24px; }
    p { font-size: 12px; margin: 8px 0; }
    .meta, .signature { border: 1px solid #cbd5e1; border-radius: 12px; margin: 18px 0; padding: 16px; }
    .grid { display: grid; gap: 10px 18px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .full { grid-column: 1 / -1; }
    .label { color: #475569; font-size: 11px; text-transform: uppercase; }
    .value { font-size: 13px; font-weight: 700; margin-bottom: 8px; }
    img { border: 1px solid #e2e8f0; border-radius: 8px; display: block; max-height: 120px; max-width: 360px; padding: 8px; }
    @media print { body { margin: 18mm; } button { display: none; } }
  </style>
</head>
<body>
  <h1>${escapeHtml(RESTAURANT_PARTNER_CONTRACT_TITLE)}</h1>
  <p>Version ${escapeHtml(RESTAURANT_PARTNER_CONTRACT_VERSION)}</p>
  <div class="meta">
    <h2>Informations complètes du restaurateur</h2>
    <div class="grid">
      <div><div class="label">Prénom</div><div class="value">${escapeHtml(displayValue(input.restaurateurFirstName))}</div></div>
      <div><div class="label">Nom</div><div class="value">${escapeHtml(displayValue(input.restaurateurLastName))}</div></div>
      <div><div class="label">Date de naissance</div><div class="value">${escapeHtml(displayValue(input.restaurateurDateOfBirth))}</div></div>
      <div><div class="label">Téléphone</div><div class="value">${escapeHtml(displayValue(input.restaurateurPhone || input.restaurantPhone))}</div></div>
      <div class="full"><div class="label">Adresse</div><div class="value">${escapeHtml(displayValue(input.restaurateurAddress || input.restaurantAddress))}</div></div>
      <div><div class="label">Raison sociale</div><div class="value">${escapeHtml(displayValue(input.legalName))}</div></div>
      <div><div class="label">Nom commercial</div><div class="value">${escapeHtml(displayValue(input.businessName))}</div></div>
      <div><div class="label">Nom du restaurant</div><div class="value">${escapeHtml(displayValue(input.restaurantName))}</div></div>
      <div><div class="label">Numéro d'immatriculation</div><div class="value">${escapeHtml(displayValue(input.businessRegistrationNumber))}</div></div>
      <div><div class="label">Lieu</div><div class="value">${escapeHtml(displayValue(input.place || input.city))}</div></div>
      <div><div class="label">Date de signature</div><div class="value">${escapeHtml(formatContractDate(input.signedAt))}</div></div>
    </div>
  </div>
  <div class="meta">
    <h2>Informations TOK</h2>
    <div class="grid">
      <div><div class="label">Marque</div><div class="value">${escapeHtml(input.tokCompanyName || TOK_CONTRACT_LEGAL_INFORMATION.companyName)}</div></div>
      <div><div class="label">Entité</div><div class="value">${escapeHtml(input.tokLegalName || TOK_CONTRACT_LEGAL_INFORMATION.legalName)}</div></div>
      <div class="full"><div class="label">Adresse</div><div class="value">${escapeHtml(input.tokAddress || TOK_CONTRACT_LEGAL_INFORMATION.address)}</div></div>
      <div><div class="label">Email</div><div class="value">${escapeHtml(input.tokEmail || TOK_CONTRACT_LEGAL_INFORMATION.email)}</div></div>
      <div><div class="label">Site public</div><div class="value">${escapeHtml(input.tokWebsite || TOK_CONTRACT_LEGAL_INFORMATION.website)}</div></div>
      <div><div class="label">Dashboard admin</div><div class="value">${escapeHtml(input.tokAdminWebsite || TOK_CONTRACT_LEGAL_INFORMATION.adminWebsite)}</div></div>
      <div><div class="label">Droit / lieu</div><div class="value">${escapeHtml(input.tokJurisdiction || TOK_CONTRACT_LEGAL_INFORMATION.jurisdiction)}</div></div>
    </div>
  </div>
  ${sections}
  <div class="signature">
    <div class="label">Signataire habilité</div>
    <div class="value">${escapeHtml(input.signerName)}</div>
    <div class="label">Horodatage d'export</div>
    <div class="value">${escapeHtml(new Date(input.signedAt).toLocaleString("fr-CH"))}</div>
    <div class="label">Signature</div>
    ${input.signatureDataUrl ? `<img src="${escapeHtml(input.signatureDataUrl)}" alt="Signature manuscrite du restaurateur" />` : `<div class="value">Signature numérique enregistrée par ${escapeHtml(input.signerName)}</div>`}
  </div>
</body>
</html>`;
}
