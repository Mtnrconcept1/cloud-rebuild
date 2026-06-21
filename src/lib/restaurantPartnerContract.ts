export const RESTAURANT_PARTNER_CONTRACT_VERSION = "TOK-CH-RP-2026-06-v2";

export const RESTAURANT_PARTNER_CONTRACT_TITLE =
  "Contrat de partenariat restaurateur TOK";

export const RESTAURANT_PARTNER_CONTRACT_SECTIONS = [
  {
    title: "1. Parties, identification et documents contractuels",
    paragraphs: [
      "Le présent contrat encadre la mise à disposition par TOK d'une plateforme digitale B2B de visibilité, réservation, commande, paiement, livraison, fidélité, campagnes, support, avis, IA et outils opérationnels au bénéfice du restaurateur partenaire.",
      "Le restaurateur doit être identifié par sa raison sociale, son enseigne, son adresse légale, son IDE/UID suisse ou numéro fiscal lorsqu'il existe, son numéro du registre du commerce lorsqu'il est inscrit, le nom du restaurant exploité, le représentant autorisé, sa fonction et ses coordonnées de contact.",
      "Le signataire déclare disposer du pouvoir d'engager juridiquement la société ou l'entreprise restauratrice, détenir les autorisations, assurances, licences, droits d'exploitation et informations commerciales nécessaires, et maintenir ces informations exactes dans le dashboard.",
      "Le contrat comprend le présent document, ses annexes versionnées, la grille tarifaire acceptée, les règles opérationnelles réservation/commande/remboursement, la politique données/sous-traitants, les conditions IA/marketing, les règles avis/modération, le SLA/support, les règles de suspension et les preuves de signature numérique accessibles ou remises au restaurateur au moment de l'acceptation.",
      "Tout document externe opposable au restaurateur doit être daté, versionné, accessible avant signature et accepté explicitement ou rattaché à un avenant numérique traçable. En cas de contradiction, le contrat principal prévaut sauf clause spéciale plus récente acceptée par les parties.",
    ],
  },
  {
    title: "2. Obligations opérationnelles du restaurateur",
    paragraphs: [
      "Le restaurateur maintient une fiche exacte: nom légal, enseigne, adresse, horaires, jours de fermeture, allergènes, provenance lorsque requise, prix, TVA le cas échéant, moyens de contact, disponibilités, délais de préparation, photos, menus, stocks, capacités de réservation et informations de livraison ou retrait.",
      "Il s'engage à honorer les commandes, réservations, offres, abonnements, ventes flash, bons d'achat, avoirs et avantages de fidélité acceptés sur TOK, sauf cas de force majeure ou incident signalé immédiatement au support avec une raison structurée.",
      "Il garantit l'hygiène, la sécurité alimentaire, la conformité des produits, la gestion HACCP ou équivalente, la chaîne du froid, la traçabilité interne, la qualité des emballages, les licences nécessaires et la conformité aux lois suisses et cantonales applicables.",
      "Il est seul responsable de l'exactitude des menus, ingrédients, allergènes, additifs, prix, photos, quantités, origines, disponibilités, mentions obligatoires, délais annoncés et promesses commerciales publiées via son compte, y compris lorsqu'un texte ou visuel a été assisté par IA.",
    ],
  },
  {
    title: "3. Obligations TOK et limites de service",
    paragraphs: [
      "TOK fournit l'accès au dashboard restaurateur, aux outils de catalogue, commandes, réservations, avis, facturation, support, notifications, campagnes, reporting et fonctionnalités activées par feature flag, pack souscrit ou configuration administrateur.",
      "TOK assure une exploitation raisonnable de la plateforme, la sécurisation des accès, la journalisation des actions sensibles, la séparation des rôles, l'application des politiques RLS et les intégrations de paiement dans la limite des prestataires tiers.",
      "TOK peut modérer, suspendre, masquer ou corriger une fiche, offre, avis, campagne ou contenu lorsqu'une information est manifestement trompeuse, incomplète, risquée pour les clients, contraire aux règles de la plateforme ou susceptible d'engager la sécurité alimentaire.",
      "TOK ne garantit pas l'absence totale d'interruption, de bug, de retard de prestataire, d'indisponibilité réseau ou de blocage par Stripe, Supabase, un service d'emailing, un fournisseur IA, un transporteur ou une autorité compétente.",
    ],
  },
  {
    title: "4. Annexe tarifaire, commissions, frais et facturation",
    paragraphs: [
      "Chaque restaurant doit disposer d'une annexe tarifaire claire indiquant la commission par réservation, la commission par commande, les frais fixes, frais variables, frais de livraison, abonnements, packs de lancement, crédits IA/campagnes, frais Stripe ou prestataire, TVA applicable et éventuels minimums de facturation.",
      "L'annexe précise qui supporte les remboursements, avoirs, bons d'achat, rétrofacturations, frais de chargeback, erreurs de prix, gestes commerciaux, frais de livraison annulée et corrections comptables selon l'origine de l'incident: client, restaurateur, TOK, livreur ou prestataire de paiement.",
      "Les délais de versement au restaurateur, retenues de sécurité, réserves, conditions Stripe Connect, exigences KYC, soldes négatifs, rapprochements, exports et factures sont détaillés dans le dashboard ou dans l'annexe tarifaire acceptée.",
      "Les packs promotionnels ou de lancement indiquent leur durée, leur prix de renouvellement, les fonctionnalités incluses, les limites de crédits IA/marketing, les conditions de résiliation et la date à partir de laquelle le tarif standard peut s'appliquer.",
      "TOK peut modifier les prix avec un préavis raisonnable communiqué sur support durable ou dans le dashboard. Une modification substantielle ne s'applique pas rétroactivement aux commandes, réservations ou campagnes déjà acceptées, sauf obligation légale ou correction d'erreur manifeste.",
    ],
  },
  {
    title:
      "5. Paiements, annulations, no-show, remboursements et litiges clients",
    paragraphs: [
      "Les paiements peuvent être traités par Stripe, Stripe Connect ou tout prestataire activé par TOK. Le restaurateur fournit des informations de paiement exactes, maintient son compte connecté opérationnel et accepte que les contrôles KYC puissent retarder ou bloquer un versement.",
      "Les règles d'annulation client, no-show, réservation non honorée, restaurant fermé, client refusé, commande préparée mais non récupérée, rupture de stock, réservation double, erreur de menu, erreur de prix et retard important sont définies dans l'annexe opérationnelle applicable.",
      "Lorsqu'un paiement est capturé sans commande confirmée, lorsqu'une commande est confirmée sans transaction réussie ou lorsqu'un remboursement partiel est nécessaire, TOK peut appliquer une procédure de réconciliation, de remboursement ou d'avoir traçable dans l'admin.",
      "Les rétrofacturations, contestations bancaires, frais Stripe, remboursements imposés par un prestataire ou litiges clients sont supportés par la partie à l'origine de l'incident lorsque celle-ci peut être déterminée; à défaut, TOK applique les règles de l'annexe tarifaire et conserve les preuves disponibles.",
      "Le restaurateur ne doit jamais demander au client de contourner le paiement TOK pour une commande, réservation ou offre initiée sur la plateforme, sauf instruction écrite de TOK lors d'un incident opérationnel.",
    ],
  },
  {
    title: "6. Données personnelles, confidentialité et sécurité",
    paragraphs: [
      "Les données traitées peuvent inclure les données clients, commandes, réservations, paiements, avis, messages support, notifications, données restaurateurs, documents d'onboarding, données de livraison, logs techniques et preuves de signature.",
      "Selon le traitement, TOK peut agir comme responsable du traitement indépendant, responsable conjoint ou sous-traitant du restaurateur. Les finalités incluent l'exécution du service, le paiement, le support, la conformité, la sécurité, la facturation, l'audit, les notifications, la modération, les statistiques et l'amélioration produit.",
      "Chaque partie répond aux demandes d'accès, rectification, suppression, opposition ou portabilité relevant de son périmètre et coopère raisonnablement lorsqu'une demande concerne les deux parties ou un client commun.",
      "TOK peut recourir à des sous-traitants et sous-traitants ultérieurs tels que Stripe, Supabase, fournisseurs cloud, outils d'emailing, outils d'analyse, fournisseurs IA ou support. TOK encadre contractuellement ces prestataires, les mesures de sécurité, la confidentialité et les transferts à l'étranger lorsque nécessaire.",
      "Le restaurateur protège ses identifiants, applique le moindre privilège à son équipe, interdit le partage de compte non autorisé et signale immédiatement toute suspicion de compromission, fuite de données, erreur d'accès, demande abusive ou incident sécurité.",
      "Les durées de conservation varient selon les finalités: preuve contractuelle, comptabilité, paiements, litiges, sécurité, support et obligations légales peuvent justifier une conservation post-contractuelle limitée et documentée.",
    ],
  },
  {
    title: "7. Propriété intellectuelle, contenus, marketing et IA",
    paragraphs: [
      "Le restaurateur garantit disposer des droits sur les menus, marques, photos, logos, textes, recettes publiables, vidéos, visuels et contenus transmis à TOK. Il autorise TOK à les utiliser pour exploiter, promouvoir, référencer et améliorer la présentation du restaurant sur la plateforme.",
      "Les contenus générés ou assistés par IA, traductions, descriptions, suggestions de menus, visuels marketing et recommandations doivent être vérifiés par le restaurateur avant publication. Les informations critiques, prix, allergènes, disponibilités, origines et promesses commerciales restent sous sa responsabilité.",
      "TOK peut refuser ou retirer tout contenu illicite, trompeur, discriminatoire, dangereux, contraire à l'image de la plateforme, généré sans droits suffisants ou portant atteinte aux droits de tiers.",
      "Les campagnes, offres promotionnelles, coupons, abonnements, avantages fidélité, Tok One, ventes flash et communications marketing doivent respecter les prix validés, les stocks, les durées, les conditions affichées au client et les règles de désabonnement applicables.",
    ],
  },
  {
    title: "8. Offres, ventes flash, anti-gaspi, fidélité et avantages",
    paragraphs: [
      "Le restaurateur répond aux avis et demandes support de façon professionnelle, sans pression indue, incitation trompeuse, menace ou discrimination envers les clients. Les réponses peuvent être modérées si elles enfreignent les règles de TOK.",
      "Les incidents de préparation, retard, rupture, allergène, réservation invisible, client non servi, erreur de prix, paiement anormal, livreur absent, contenu diffamatoire ou utilisation frauduleuse du compte doivent être signalés rapidement depuis les canaux prévus.",
      "TOK peut journaliser les incidents, recommander des corrections, suspendre temporairement une offre, exiger une preuve, demander un plan d'action qualité ou restreindre une fonctionnalité lorsque le niveau de service se dégrade.",
      "Les avis manifestement illicites, diffamatoires, frauduleux, publicitaires ou sans lien avec une expérience réelle peuvent faire l'objet d'une modération, mais TOK ne garantit pas la suppression de tout avis défavorable légitime.",
    ],
  },
  {
    title: "9. Responsabilité, indemnisation et limitations",
    paragraphs: [
      "Le restaurateur assume la responsabilité des denrées, boissons, allergènes, intoxications alimentaires, informations de provenance, conformité sanitaire, erreurs de prix ou menu, commandes mal préparées, réservations non honorées, clients refusés sans motif légitime et manquements de son personnel.",
      "TOK assume la responsabilité des fautes prouvées directement imputables à sa plateforme, à ses instructions écrites ou à ses actions administrateur, sous réserve des exclusions liées aux prestataires tiers, informations fournies par le restaurateur, force majeure et usages frauduleux non signalés.",
      "Aucune partie n'est responsable des dommages indirects tels que perte de chance, perte de marge, atteinte à l'image non démontrée, perte de données non imputable ou interruption causée par un tiers, sauf faute intentionnelle, négligence grave ou responsabilité impérative prévue par la loi.",
      "Lorsque la loi le permet, la responsabilité contractuelle totale de TOK pour un restaurant est plafonnée aux commissions nettes effectivement perçues par TOK auprès de ce restaurant pendant les trois mois précédant l'incident, sans limiter les obligations impératives, la fraude ou la faute grave.",
      "Le restaurateur indemnise TOK contre les réclamations de clients, autorités, salariés, prestataires ou tiers résultant de ses produits, contenus, informations alimentaires, violations de droits, erreurs opérationnelles, non-conformités ou usage non autorisé du compte.",
    ],
  },
  {
    title: "10. Durée, suspension, résiliation et effets post-contractuels",
    paragraphs: [
      "Le contrat prend effet à la signature numérique et demeure applicable tant que le restaurant utilise TOK, sauf résiliation, suspension ou remplacement par une nouvelle version acceptée. Sauf annexe contraire, il est conclu sans durée minimale.",
      "Le restaurateur peut demander la résiliation depuis les canaux support ou le dashboard avec un préavis raisonnable permettant de traiter les commandes, réservations, campagnes, factures, remboursements, litiges et offres déjà acceptés.",
      "TOK peut suspendre ou résilier avec effet immédiat en cas de risque client, fraude, impayé, violation contractuelle grave, contenu illicite, défaut de conformité alimentaire, incident sécurité, compte compromis, demande administrative ou atteinte répétée à la qualité de service.",
      "La fin du contrat n'annule pas les commandes, réservations, offres déjà vendues, factures impayées, remboursements, chargebacks, crédits utilisés, obligations de confidentialité, preuves de signature, conservation comptable, audits, litiges et obligations légales nés avant la date d'effet.",
      "Les crédits IA, campagnes ou packs non utilisés ne sont remboursés que si l'annexe tarifaire le prévoit ou si la résiliation résulte d'une faute prouvée de TOK. Les contenus publics peuvent être déréférencés progressivement, sous réserve des obligations de preuve, sécurité et conformité.",
    ],
  },
  {
    title: "11. Signature numérique, piste de preuve et archivage",
    paragraphs: [
      "La signature numérique par case d'acceptation, nom complet, fonction du signataire, déclaration de pouvoir, action authentifiée et, lorsque disponible, signature manuscrite sur écran vaut consentement et rattachement au profil du restaurant pour les actes sans forme écrite impérative.",
      "TOK conserve une piste de preuve comprenant notamment l'ID utilisateur, l'ID restaurant, l'email du compte, l'adresse IP lorsque disponible côté serveur, le user-agent, la date et l'heure serveur, la version exacte du contrat, le titre accepté, le texte exact des cases cochées, le nom complet, la fonction déclarée, la source de signature et les métadonnées non sensibles nécessaires.",
      "Lorsqu'un PDF est généré, TOK peut archiver ou permettre l'archivage d'une copie non modifiable avec hash du PDF ou hash du contenu contractuel, horodatage et statut de signature. Toute nouvelle version substantielle peut nécessiter une nouvelle signature avant l'activation ou la poursuite de certaines fonctionnalités.",
      "Le restaurateur reconnaît que la valeur probante dépend de la qualité de cette piste de preuve et que les signatures électroniques qualifiées peuvent être requises pour certains actes soumis à une forme écrite impérative en droit suisse.",
    ],
  },
  {
    title: "12. Droit applicable et for",
    paragraphs: [
      "Le présent contrat est soumis au droit suisse, à l'exclusion des règles de conflit de lois lorsque celles-ci conduiraient à l'application d'un autre droit.",
      "Tout litige relève des tribunaux compétents du canton de Genève, Suisse, sous réserve des fors impératifs prévus par la loi et des procédures amiables ou de médiation éventuellement acceptées par les parties.",
      "Cette clause doit être validée par un juriste suisse avant un déploiement commercial massif ou une signature à grande échelle de restaurateurs.",
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
  jurisdiction:
    "Droit suisse; tribunaux compétents du canton de Genève, Suisse, sous réserve des fors impératifs",
} as const;

export type RestaurantPartnerContractHtmlInput = {
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
  signerRole?: string | null;
  signerEmail?: string | null;
  userId?: string | null;
  restaurantId?: string | null;
  contractHash?: string | null;
  acceptanceText?: string | null;
  restaurantAddress?: string | null;
  restaurantPhone?: string | null;
  businessRegistrationNumber?: string | null;
  taxId?: string | null;
  city?: string | null;
  place?: string | null;
  selectedSubscriptionPlanLabel?: string | null;
  selectedSubscriptionPriceLabel?: string | null;
  tokLegalName?: string;
  tokCompanyName?: string;
  tokAddress?: string;
  tokEmail?: string;
  tokWebsite?: string;
  tokAdminWebsite?: string;
  tokJurisdiction?: string;
};

type InfoRow = {
  label: string;
  value?: string | null;
  full?: boolean;
  optional?: boolean;
};

function displayValue(value?: string | null) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || "Non renseigné";
}

function hasDisplayValue(value?: string | null) {
  return displayValue(value) !== "Non renseigné";
}

function renderInfoRows(rows: InfoRow[]) {
  return rows
    .filter((row) => !row.optional || hasDisplayValue(row.value))
    .map(
      (row) => `
      <div${row.full ? ` class="full"` : ""}>
        <div class="label">${escapeHtml(row.label)}</div>
        <div class="value">${escapeHtml(displayValue(row.value))}</div>
      </div>`,
    )
    .join("");
}

function formatContractDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return displayValue(value);
  return date.toLocaleDateString("fr-CH");
}

function formatContractDateTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return displayValue(value);
  return date.toLocaleString("fr-CH", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function generateSignedRestaurantPartnerContractHtml(
  input: RestaurantPartnerContractHtmlInput,
) {
  const sections = RESTAURANT_PARTNER_CONTRACT_SECTIONS.map(
    (section) => `
    <section>
      <h2>${escapeHtml(section.title)}</h2>
      ${section.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}
    </section>
  `,
  ).join("");

  const restaurateurRows = renderInfoRows([
    { label: "Signataire habilité", value: input.signerName },
    { label: "Date de signature", value: formatContractDate(input.signedAt) },
    { label: "Prénom du représentant", value: input.restaurateurFirstName, optional: true },
    { label: "Nom du représentant", value: input.restaurateurLastName, optional: true },
    { label: "Date de naissance", value: input.restaurateurDateOfBirth, optional: true },
    { label: "Téléphone du représentant", value: input.restaurateurPhone, optional: true },
    { label: "Adresse du représentant", value: input.restaurateurAddress, optional: true, full: true },
    { label: "Raison sociale", value: input.legalName },
    { label: "Nom commercial", value: input.businessName },
    { label: "Nom du restaurant", value: input.restaurantName },
    { label: "Adresse du restaurant", value: input.restaurantAddress, optional: true, full: true },
    { label: "Téléphone du restaurant", value: input.restaurantPhone, optional: true },
    { label: "Numéro d'immatriculation / IDE", value: input.businessRegistrationNumber, optional: true },
    { label: "Numéro TVA", value: input.taxId, optional: true },
    { label: "Pack / abonnement accepté", value: input.selectedSubscriptionPlanLabel, optional: true },
    { label: "Prix du pack", value: input.selectedSubscriptionPriceLabel, optional: true },
    { label: "Lieu", value: input.place || input.city, optional: true },
  ]);

  const tokRows = renderInfoRows([
    { label: "Marque", value: input.tokCompanyName || TOK_CONTRACT_LEGAL_INFORMATION.companyName },
    { label: "Entité", value: input.tokLegalName || TOK_CONTRACT_LEGAL_INFORMATION.legalName },
    { label: "Adresse", value: input.tokAddress || TOK_CONTRACT_LEGAL_INFORMATION.address, full: true },
    { label: "Email", value: input.tokEmail || TOK_CONTRACT_LEGAL_INFORMATION.email },
    { label: "Site public", value: input.tokWebsite || TOK_CONTRACT_LEGAL_INFORMATION.website },
    { label: "Dashboard admin", value: input.tokAdminWebsite || TOK_CONTRACT_LEGAL_INFORMATION.adminWebsite },
    { label: "Droit / for", value: input.tokJurisdiction || TOK_CONTRACT_LEGAL_INFORMATION.jurisdiction, full: true },
  ]);

  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(RESTAURANT_PARTNER_CONTRACT_TITLE)} - ${escapeHtml(input.restaurantName || input.businessName || input.legalName || input.signerName)}</title>
  <style>
    :root { color-scheme: light; }
    body { color: #0f172a; font-family: Arial, sans-serif; line-height: 1.5; margin: 32px; }
    h1 { font-size: 24px; margin-bottom: 4px; }
    h2 { font-size: 16px; margin-top: 24px; }
    p { font-size: 12px; margin: 8px 0; }
    section { break-inside: avoid; }
    .version { color: #475569; font-size: 12px; margin-top: 0; }
    .notice { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 12px; color: #7c2d12; font-size: 12px; margin: 18px 0; padding: 12px 14px; }
    .meta, .signature { border: 1px solid #cbd5e1; border-radius: 12px; margin: 18px 0; padding: 16px; }
    .grid { display: grid; gap: 10px 18px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .full { grid-column: 1 / -1; }
    .label { color: #475569; font-size: 11px; text-transform: uppercase; }
    .value { font-size: 13px; font-weight: 700; margin-bottom: 8px; overflow-wrap: anywhere; }
    img { border: 1px solid #e2e8f0; border-radius: 8px; display: block; max-height: 120px; max-width: 360px; padding: 8px; }
    @media print {
      body { margin: 16mm; }
      button { display: none; }
      .meta, .signature, section { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(RESTAURANT_PARTNER_CONTRACT_TITLE)}</h1>
  <p class="version">Version ${escapeHtml(RESTAURANT_PARTNER_CONTRACT_VERSION)}</p>
  <div class="notice">
    Ce document constitue la version contractuelle acceptée numériquement par le restaurateur. Les paramètres tarifaires, packs, feature flags et annexes opérationnelles acceptés dans le dashboard complètent le présent contrat.
  </div>
  <div class="meta">
    <h2>Informations complètes du restaurateur et du signataire</h2>
    <div class="grid">
      ${restaurateurRows}
    </div>
  </div>
  <div class="meta">
    <h2>Informations TOK</h2>
    <div class="grid">
      ${tokRows}
    </div>
  </div>
  <div class="meta">
    <h2>Annexes contractuelles attendues</h2>
    <p>Annexe A - grille tarifaire; Annexe B - règles opérationnelles réservation, commande, annulation et remboursement; Annexe C - données personnelles et sous-traitants; Annexe D - IA, marketing et contenus; Annexe E - avis, modération, support et SLA; Annexe F - suspension, sécurité et preuve de signature.</p>
  </div>
  ${sections}
  <div class="signature">
    <div class="label">Signataire habilité</div>
    <div class="value">${escapeHtml(input.signerName)}</div>
    <div class="label">Fonction déclarée</div>
    <div class="value">${escapeHtml(displayValue(input.signerRole))}</div>
    <div class="label">Email / ID utilisateur / ID restaurant</div>
    <div class="value">${escapeHtml(displayValue(input.signerEmail))} — ${escapeHtml(displayValue(input.userId))} — ${escapeHtml(displayValue(input.restaurantId))}</div>
    <div class="label">Version / hash contractuel</div>
    <div class="value">${escapeHtml(RESTAURANT_PARTNER_CONTRACT_VERSION)} — ${escapeHtml(displayValue(input.contractHash))}</div>
    <div class="label">Texte accepté</div>
    <div class="value">${escapeHtml(displayValue(input.acceptanceText))}</div>
    <div class="label">Horodatage d'export</div>
    <div class="value">${escapeHtml(formatContractDateTime(input.signedAt))}</div>
    <div class="label">Signature</div>
    ${input.signatureDataUrl ? `<img src="${escapeHtml(input.signatureDataUrl)}" alt="Signature manuscrite du restaurateur" />` : `<div class="value">Signature numérique enregistrée par ${escapeHtml(input.signerName)}</div>`}
  </div>
</body>
</html>`;
}
