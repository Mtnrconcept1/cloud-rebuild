export type NewsletterTemplate = {
  id: string;
  title: string;
  subject: string;
  preview: string;
  body: string;
  category: "marketing" | "product" | "system";
  targetRoles: string[];
  channels: {
    in_app: boolean;
    email: boolean;
    push: boolean;
  };
  recommendedSendHour: number;
  antiSpamNotes: string[];
};

export type NewsletterCampaignDraft = {
  title: string;
  body: string;
  category: NewsletterTemplate["category"];
  status: "draft" | "scheduled";
  scheduled_at: string | null;
  created_by: string | null;
  target_roles: string[];
  target_cities: string[];
  channels: NewsletterTemplate["channels"];
};

export type DeliverabilityInput = {
  subject: string;
  body: string;
  hasMarketingConsentFilter: boolean;
  hasUnsubscribeLink: boolean;
  senderDomainAuthenticated: boolean;
  scheduledAt?: string | null;
};

export type DeliverabilityResult = {
  status: "ready" | "needs_review" | "blocked";
  score: number;
  blockers: string[];
  warnings: string[];
};

const preferenceFooter = "Vous pouvez ajuster vos preferences de communication depuis votre profil Tok.";

export const NEWSLETTER_TEMPLATES: NewsletterTemplate[] = [
  {
    id: "weekly_selection",
    title: "Votre selection Tok de la semaine",
    subject: "Votre selection Tok de la semaine",
    preview: "Restaurants suivis, tables ouvertes et nouveautes proches de vous.",
    body: `Bonjour, voici une selection claire de restaurants, tables et bons plans adaptes a vos habitudes recentes. Nous mettons en avant des disponibilites utiles, sans pression, pour vous aider a choisir plus vite votre prochain repas. ${preferenceFooter}`,
    category: "marketing",
    targetRoles: ["client"],
    channels: { in_app: true, email: true, push: false },
    recommendedSendHour: 10,
    antiSpamNotes: ["Audience consentie", "Sujet descriptif", "Frequence hebdomadaire"],
  },
  {
    id: "gold_rewards",
    title: "Vos avantages Gold sont prets",
    subject: "Vos avantages Gold sont prets",
    preview: "Support prioritaire, creneaux premium et bonus Miamz a activer.",
    body: `Votre niveau Gold debloque des avantages utiles pour vos prochaines commandes et reservations: support prioritaire, creneaux premium quand ils sont disponibles et bonus Miamz renforces. Consultez votre espace fidelite pour suivre la progression. ${preferenceFooter}`,
    category: "marketing",
    targetRoles: ["client"],
    channels: { in_app: true, email: true, push: false },
    recommendedSendHour: 11,
    antiSpamNotes: ["Ciblee par niveau fidelite", "Promesse realiste", "Pas de ponctuation agressive"],
  },
  {
    id: "zero_attente_lunch",
    title: "Dejeuner sans attente",
    subject: "Dejeuner sans attente autour de vous",
    preview: "Creneaux rapides et tables disponibles pour la pause midi.",
    body: `La pause midi est plus simple quand les creneaux sont visibles a temps. Cette selection met en avant des restaurants avec disponibilites rapides et options adaptees a un dejeuner efficace, seul ou en equipe. ${preferenceFooter}`,
    category: "marketing",
    targetRoles: ["client"],
    channels: { in_app: true, email: true, push: false },
    recommendedSendHour: 9,
    antiSpamNotes: ["Timing utile", "Copie informative", "Pas de promesse excessive"],
  },
  {
    id: "anti_gaspi_evening",
    title: "Suggestions anti-gaspi du soir",
    subject: "Suggestions responsables pour ce soir",
    preview: "Des menus partenaires a decouvrir sans surpromesse commerciale.",
    body: `Certains partenaires proposent des suggestions responsables en fin de journee. Nous les regroupons pour vous donner des idees de repas pratiques, avec une information simple sur les restaurants et les horaires disponibles. ${preferenceFooter}`,
    category: "marketing",
    targetRoles: ["client"],
    channels: { in_app: true, email: true, push: false },
    recommendedSendHour: 16,
    antiSpamNotes: ["Vocabulaire sobre", "Contenu local", "Pas d'urgence forcee"],
  },
  {
    id: "weekend_reservations",
    title: "Tables du week-end a reserver",
    subject: "Tables disponibles pour votre week-end",
    preview: "Anticipez les reservations fortes sans message agressif.",
    body: `Les meilleurs creneaux du week-end partent souvent vite. Cette newsletter vous aide a repérer les tables ouvertes, les horaires confortables et les restaurants adaptes a une sortie entre amis ou en famille. ${preferenceFooter}`,
    category: "marketing",
    targetRoles: ["client"],
    channels: { in_app: true, email: true, push: false },
    recommendedSendHour: 14,
    antiSpamNotes: ["Information utile", "Frequence limitee", "Objet clair"],
  },
  {
    id: "new_restaurants_city",
    title: "Nouveaux restaurants dans votre ville",
    subject: "Nouveaux restaurants a decouvrir",
    preview: "Ouvertures recentes et partenaires actifs par ville.",
    body: `De nouveaux restaurants rejoignent Tok dans votre zone. Retrouvez une selection courte avec cuisine, ambiance et disponibilites, pour decouvrir un lieu recent sans parcourir toute l'application. ${preferenceFooter}`,
    category: "marketing",
    targetRoles: ["client"],
    channels: { in_app: true, email: true, push: false },
    recommendedSendHour: 12,
    antiSpamNotes: ["Ciblage geographique", "Contenu attendu", "Pas de spam words"],
  },
  {
    id: "tok_one_value",
    title: "Ce que Tok ameliore cette semaine",
    subject: "Ce que Tok ameliore cette semaine",
    preview: "Nouveautes produit utiles pour commander et reserver.",
    body: `Nous ameliorons l'application avec des informations plus lisibles, des reservations plus fiables et des notifications mieux ciblees. Voici les changements qui peuvent rendre votre prochaine experience plus fluide. ${preferenceFooter}`,
    category: "product",
    targetRoles: ["client"],
    channels: { in_app: true, email: true, push: false },
    recommendedSendHour: 10,
    antiSpamNotes: ["Objet produit", "Ton factuel", "Aucune incitation excessive"],
  },
  {
    id: "birthday_miamz",
    title: "Votre mois anniversaire avec Tok",
    subject: "Votre mois anniversaire avec Tok",
    preview: "Un rappel personnalise autour des avantages eligibles.",
    body: `Votre mois anniversaire peut ouvrir des attentions partenaires et bonus Miamz selon les campagnes actives. Consultez votre profil pour voir les avantages disponibles et les conditions associees. ${preferenceFooter}`,
    category: "marketing",
    targetRoles: ["client"],
    channels: { in_app: true, email: true, push: false },
    recommendedSendHour: 11,
    antiSpamNotes: ["Message personnalise", "Conditions mentionnees", "Objet non trompeur"],
  },
  {
    id: "rainy_day_delivery",
    title: "Idees livraison pour aujourd'hui",
    subject: "Idees livraison pour aujourd'hui",
    preview: "Restaurants fiables quand la livraison est le meilleur choix.",
    body: `Quand vous preferez rester chez vous, Tok peut vous aider a choisir des restaurants avec des informations de livraison lisibles. Voici des options pertinentes selon vos favoris et disponibilites locales. ${preferenceFooter}`,
    category: "marketing",
    targetRoles: ["client"],
    channels: { in_app: true, email: true, push: false },
    recommendedSendHour: 15,
    antiSpamNotes: ["Pas de pression", "Ciblage comportemental raisonnable", "Copie concise"],
  },
  {
    id: "chef_table_drop",
    title: "Menus chefs et tables speciales",
    subject: "Menus chefs et tables speciales",
    preview: "Experiences partenaires a reserver quand elles sont ouvertes.",
    body: `Certains restaurants ouvrent ponctuellement des menus chefs, tables speciales ou experiences limitees. Cette selection vous signale les opportunites disponibles avec des informations simples et verifiables. ${preferenceFooter}`,
    category: "marketing",
    targetRoles: ["client"],
    channels: { in_app: true, email: true, push: false },
    recommendedSendHour: 13,
    antiSpamNotes: ["Disponibilite contextualisee", "Aucun superlatif excessif", "Lien preference present"],
  },
  {
    id: "flash_sale_soft",
    title: "Offres partenaires selectionnees",
    subject: "Offres partenaires selectionnees",
    preview: "Promotions encadrees sans vocabulaire a risque.",
    body: `Des partenaires peuvent proposer des offres ponctuelles sur certains creneaux. Nous les presentons avec les conditions utiles, les restaurants concernes et un ton clair pour eviter les promesses difficiles a verifier. ${preferenceFooter}`,
    category: "marketing",
    targetRoles: ["client"],
    channels: { in_app: true, email: true, push: false },
    recommendedSendHour: 10,
    antiSpamNotes: ["Conditions visibles", "Pas d'urgence artificielle", "Promesse mesurable"],
  },
  {
    id: "family_group_order",
    title: "Commander a plusieurs simplement",
    subject: "Commander a plusieurs simplement",
    preview: "Suggestions pour repas en famille ou entre collegues.",
    body: `Pour les repas a plusieurs, nous regroupons des restaurants adaptes aux paniers partages, aux preferences variees et aux horaires faciles a coordonner. La selection reste courte et actionnable. ${preferenceFooter}`,
    category: "marketing",
    targetRoles: ["client"],
    channels: { in_app: true, email: true, push: false },
    recommendedSendHour: 15,
    antiSpamNotes: ["Cas d'usage clair", "Pas de majuscules agressives", "Frequence controlee"],
  },
  {
    id: "lunch_office",
    title: "Pause bureau plus rapide",
    subject: "Pause bureau plus rapide",
    preview: "Restaurants proches et horaires pratiques pour le travail.",
    body: `Cette selection est pensee pour les jours de bureau: restaurants proches, service rapide et reservations ou commandes compatibles avec une pause courte. Elle vous aide a decider sans multiplier les recherches. ${preferenceFooter}`,
    category: "marketing",
    targetRoles: ["client"],
    channels: { in_app: true, email: true, push: false },
    recommendedSendHour: 8,
    antiSpamNotes: ["Envoyee avant le besoin", "Valeur concrete", "Texte sobre"],
  },
  {
    id: "loyalty_progress",
    title: "Votre progression Miamz",
    subject: "Votre progression Miamz",
    preview: "Rappel utile sur le niveau et les avantages a venir.",
    body: `Votre solde Miamz progresse avec vos usages eligibles. Cette newsletter explique le niveau actuel, les avantages deja accessibles et ce qu'il reste pour atteindre le prochain palier de fidelite. ${preferenceFooter}`,
    category: "marketing",
    targetRoles: ["client"],
    channels: { in_app: true, email: true, push: false },
    recommendedSendHour: 11,
    antiSpamNotes: ["Personnalisation utile", "Pas d'incitation trompeuse", "Lien preference inclus"],
  },
  {
    id: "favorites_return",
    title: "Vos favoris ont des disponibilites",
    subject: "Vos favoris ont des disponibilites",
    preview: "Rappel cible sur les restaurants deja suivis.",
    body: `Certains restaurants que vous avez consultes ou ajoutes en favoris affichent de nouvelles disponibilites. Nous vous les signalons pour eviter une recherche repetee et garder un message pertinent. ${preferenceFooter}`,
    category: "marketing",
    targetRoles: ["client"],
    channels: { in_app: true, email: true, push: false },
    recommendedSendHour: 17,
    antiSpamNotes: ["Basee sur l'interet utilisateur", "Peu frequente", "Sujet exact"],
  },
  {
    id: "vegetarian_discovery",
    title: "Selections vegetales et legeres",
    subject: "Selections vegetales et legeres",
    preview: "Restaurants avec options vegetales bien identifiees.",
    body: `Retrouvez des restaurants proposant des options vegetales, legeres ou facilement adaptables. L'objectif est de vous faire gagner du temps quand vous cherchez un repas precis et lisible. ${preferenceFooter}`,
    category: "marketing",
    targetRoles: ["client"],
    channels: { in_app: true, email: true, push: false },
    recommendedSendHour: 10,
    antiSpamNotes: ["Segmentation par preference", "Pas de claim sante exagere", "Copie claire"],
  },
  {
    id: "after_work",
    title: "Idees afterwork",
    subject: "Idees afterwork",
    preview: "Creneaux et lieux pratiques apres le travail.",
    body: `Pour organiser une sortie apres le travail, voici des restaurants avec horaires pratiques, ambiance adaptee et disponibilites visibles. La selection limite les choix pour faciliter la decision. ${preferenceFooter}`,
    category: "marketing",
    targetRoles: ["client"],
    channels: { in_app: true, email: true, push: false },
    recommendedSendHour: 15,
    antiSpamNotes: ["Moment pertinent", "Pas de formulation urgente", "Preference footer"],
  },
  {
    id: "brunch_weekend",
    title: "Brunchs et sorties du matin",
    subject: "Brunchs et sorties du matin",
    preview: "Options du week-end pour reserver plus simplement.",
    body: `Les brunchs et sorties du matin demandent souvent un peu d'anticipation. Nous rassemblons les restaurants avec creneaux utiles, informations claires et disponibilites actualisees dans votre zone. ${preferenceFooter}`,
    category: "marketing",
    targetRoles: ["client"],
    channels: { in_app: true, email: true, push: false },
    recommendedSendHour: 9,
    antiSpamNotes: ["Message anticipe", "Ciblage par moment", "Objet descriptif"],
  },
  {
    id: "support_preferences",
    title: "Gardez le controle de vos notifications",
    subject: "Gardez le controle de vos notifications",
    preview: "Rappel transparent sur les preferences et canaux.",
    body: `Tok vous permet de choisir les categories et canaux de communication qui vous conviennent. Ce rappel explique comment garder une experience utile, limitee et adaptee a vos besoins reels. ${preferenceFooter}`,
    category: "product",
    targetRoles: ["client"],
    channels: { in_app: true, email: true, push: false },
    recommendedSendHour: 12,
    antiSpamNotes: ["Transparence preferences", "But non promotionnel", "Faible risque spam"],
  },
  {
    id: "reactivation_soft",
    title: "Reprendre Tok en douceur",
    subject: "Reprendre Tok en douceur",
    preview: "Message de retour sobre pour utilisateurs inactifs.",
    body: `Si vous n'avez pas utilise Tok recemment, voici un resume simple des nouveautes, restaurants et avantages disponibles. Le message reste informatif afin que vous puissiez revenir seulement si cela vous est utile. ${preferenceFooter}`,
    category: "marketing",
    targetRoles: ["client"],
    channels: { in_app: true, email: true, push: false },
    recommendedSendHour: 10,
    antiSpamNotes: ["Reactivation douce", "Pas de pression", "Controle preferences"],
  },
];

export function getNewsletterTemplate(id: string): NewsletterTemplate {
  const template = NEWSLETTER_TEMPLATES.find((item) => item.id === id);
  if (!template) {
    throw new Error(`Unknown newsletter template: ${id}`);
  }
  return template;
}

export function buildNewsletterCampaignFromTemplate(
  templateId: string,
  options: {
    createdBy?: string | null;
    scheduledAt?: string | null;
    targetCities?: string[];
    targetRoles?: string[];
  } = {},
): NewsletterCampaignDraft {
  const template = getNewsletterTemplate(templateId);
  return {
    title: template.title,
    body: template.body,
    category: template.category,
    status: options.scheduledAt ? "scheduled" : "draft",
    scheduled_at: options.scheduledAt || null,
    created_by: options.createdBy || null,
    target_roles: options.targetRoles || template.targetRoles,
    target_cities: options.targetCities || [],
    channels: template.channels,
  };
}

function countMatches(value: string, pattern: RegExp) {
  return (value.match(pattern) || []).length;
}

export function analyzeNewsletterDeliverability(input: DeliverabilityInput): DeliverabilityResult {
  const blockers: string[] = [];
  const warnings: string[] = [];
  let score = 100;
  const subject = input.subject.trim();
  const body = input.body.trim();
  const combined = `${subject} ${body}`;
  const lowerCombined = combined.toLowerCase();

  if (!input.hasMarketingConsentFilter) {
    blockers.push("missing_marketing_consent");
    score -= 30;
  }

  if (!input.hasUnsubscribeLink) {
    blockers.push("missing_unsubscribe_link");
    score -= 25;
  }

  if (!input.senderDomainAuthenticated) {
    blockers.push("missing_sender_authentication");
    score -= 20;
  }

  if (!input.scheduledAt) {
    warnings.push("missing_schedule");
    score -= 5;
  }

  if (subject.length < 8 || subject.length > 78) {
    warnings.push("subject_length_risk");
    score -= 8;
  }

  if (body.length < 80) {
    warnings.push("body_too_short");
    score -= 18;
  }

  const spamPhrases = ["urgent", "gratuit", "gagnez", "cliquez vite", "maintenant", "100%", "promo !!!"];
  const spamHits = spamPhrases.filter((phrase) => lowerCombined.includes(phrase));
  if (spamHits.length > 0) {
    warnings.push("spam_trigger_words");
    score -= Math.min(35, spamHits.length * 8);
  }

  const exclamationCount = countMatches(combined, /!/g);
  if (exclamationCount > 2) {
    warnings.push("excessive_punctuation");
    score -= Math.min(20, (exclamationCount - 2) * 3);
  }

  const letters = combined.replace(/[^a-zA-Z]/g, "");
  const uppercaseLetters = combined.replace(/[^A-Z]/g, "");
  if (letters.length > 0 && uppercaseLetters.length / letters.length > 0.45) {
    warnings.push("excessive_uppercase");
    score -= 15;
  }

  const finalScore = Math.max(0, Math.min(100, score));
  return {
    status: blockers.length > 0 || finalScore < 60 ? "blocked" : finalScore < 85 || warnings.length > 0 ? "needs_review" : "ready",
    score: finalScore,
    blockers,
    warnings,
  };
}
