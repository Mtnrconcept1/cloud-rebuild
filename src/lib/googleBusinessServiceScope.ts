export const GOOGLE_BUSINESS_SERVICE_SCOPE = {
  included: [
    "Audit initial de la fiche et recommandations sur le nom, la description, les horaires, les catégories, les photos et les liens d'action.",
    "Création d'un lien TOK traçable vers les modules réellement activés (fiche restaurant, réservation ou commande).",
    "Suivi dans TOK des clics et conversions attribuables au lien TOK, lorsque les données sont disponibles.",
  ],
  optional: [
    "Préparation de photos, textes de publications et projets de réponses aux avis, à valider par le restaurant avant utilisation.",
    "Accompagnement aux mises à jour de la fiche et revue périodique de visibilité selon le pack et la capacité de l'équipe TOK.",
  ],
  mandateRequired: [
    "Toute intervention de TOK dans Google Business Profile exige un mandat écrit, un accès propriétaire ou gestionnaire fourni par le restaurant et les droits nécessaires sur les contenus.",
    "Le restaurant valide les informations, publications et réponses aux avis ; TOK ne publie pas automatiquement dans Google et ne demande jamais le mot de passe Google du restaurant.",
  ],
  dependencies: [
    "Le service dépend de l'éligibilité et de la validation de la fiche, des fonctionnalités disponibles dans le pays et la catégorie, ainsi que des règles et délais de Google.",
    "TOK ne garantit ni position, ni classement, ni volume de vues, clics, appels, réservations ou commandes.",
    "Google peut refuser une modification, limiter une fonctionnalité ou suspendre la fiche ; TOK accompagne le diagnostic et le recours, sans pouvoir imposer le rétablissement ni son délai.",
  ],
} as const;

export const GOOGLE_BUSINESS_PLAN_PRESENTATION = {
  starter: { status: "Optionnel", detail: "Audit et accompagnement disponibles sur demande ; intervention Google hors abonnement et soumise à devis et mandat." },
  business: { status: "Optionnel", detail: "Audit et lien TOK traçable disponibles sur demande ; gestion de fiche soumise à devis et mandat." },
  premium: { status: "Inclus", detail: "Audit initial, recommandations et lien TOK traçable inclus ; toute action dans Google reste soumise à mandat." },
  elite: { status: "Inclus · mandat requis", detail: "Audit et accompagnement multi-site inclus pour les sites couverts ; chaque intervention dans Google exige les accès et le mandat du restaurant." },
} as const;

export function getGoogleBusinessPlanPresentation(planSlug: string) {
  return GOOGLE_BUSINESS_PLAN_PRESENTATION[
    planSlug as keyof typeof GOOGLE_BUSINESS_PLAN_PRESENTATION
  ] || GOOGLE_BUSINESS_PLAN_PRESENTATION.starter;
}
