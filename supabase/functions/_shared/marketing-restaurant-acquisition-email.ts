import {
  renderMarketingEmail,
  type MarketingEmailBrand,
} from "./marketing-email-template.ts";

/**
 * Publicity campaign for prospective Geneva restaurateurs.
 * Copy is retained from the supplied "TOK — Chaque table compte" email.
 * The PNG is the asset uploaded in PR #892 (mtnrconcept-patch-5).
 * No reservation, order or transactional receipt language is introduced.
 */
export const TOK_RESTAURANT_ACQUISITION_CAMPAIGN = {
  id: "tok_restaurateurs_geneve",
  subject: "TOK — Chaque table compte",
  preheader: "TOK : plus de clients, moins de gaspillage, plus de réservations. Découvrez notre offre de lancement à Genève.",
  headline: "Et si chaque service devenait une opportunité ?",
  bannerUrl: "https://www.thetok.ch/desig%20app/755718E0-67F4-4CB6-BB98-BD129C3CCED6.png",
  callToAction: "DÉCOUVRIR TOK →",
  callToActionUrl: "https://thetok.ch",
  body: `Bonjour,

Et si vous pouviez attirer davantage de clients, optimiser chaque service et augmenter votre chiffre d’affaires, tout en simplifiant la gestion quotidienne de votre restaurant ?

C’est précisément pour cela que nous avons créé TOK, une nouvelle plateforme développée à Genève, pensée pour les restaurateurs et leurs besoins réels.

Notre ambition est simple : vous aider à gagner plus, perdre moins et consacrer davantage de temps à ce qui compte vraiment : vos clients et votre cuisine.

## Découvrez ce que TOK peut apporter à votre établissement

### 🍽️ Réservations intelligentes

Recevez et gérez vos réservations directement depuis votre tableau de bord. Organisez vos tables, vos disponibilités et vos services, avec une meilleure visibilité sur votre taux d’occupation.

### ⏱️ Zéro Attente — Vos clients commandent avant d’arriver

Imaginez un client qui réserve sa table et choisit déjà ses plats. Votre cuisine peut anticiper la commande et le client profite d’un service plus rapide. Résultat : une meilleure organisation et la possibilité d’optimiser la rotation de vos tables.

### 🔥 Ventes Flash — Remplissez vos heures creuses

Vous avez des tables disponibles pour ce soir ou un service plus calme que prévu ? Créez une offre ponctuelle pour attirer de nouveaux clients, au moment où vous en avez réellement besoin.

### 👑 TOK d’Or — Valorisez vos expériences gastronomiques

Proposez des expériences exclusives, des menus spéciaux ou des tables d’exception à des conditions privilégiées. Une manière de faire découvrir votre savoir-faire et de séduire une nouvelle clientèle.

### ♻️ Anti-gaspillage — Transformez vos invendus en revenus

Valorisez vos préparations et vos surplus alimentaires grâce à des offres ciblées, plutôt que de les perdre. Un bénéfice à la fois économique et écologique.

### 🎁 MIAMZ — Fidélisez votre clientèle

Avec notre programme de fidélité, vos clients sont encouragés à revenir et à découvrir les restaurants partenaires. TOK associe également cette démarche à une dimension solidaire locale.

### 🎨 Studio Marketing avec intelligence artificielle

Créez des campagnes promotionnelles, des visuels, des publications pour vos réseaux sociaux et mettez en avant vos spécialités plus facilement. TOK vous accompagne pour développer votre visibilité sans devoir être expert en marketing.

### 📊 Un tableau de bord centralisé

Pilotez vos réservations, vos offres, votre carte, vos commandes et vos performances depuis une seule interface, pensée pour simplifier le quotidien des restaurateurs.

## Pourquoi rejoindre TOK ?

✓ Plus de visibilité auprès d’une clientèle locale.
✓ Plus d’opportunités de réservation pour rentabiliser vos tables disponibles.
✓ Moins de gaspillage et une meilleure anticipation des services.
✓ Des campagnes marketing simplifiées pour développer votre activité.
✓ Une maîtrise de vos offres et de vos prix, selon vos propres objectifs.
✓ Une solution genevoise, développée pour les professionnels de la restauration.

## OFFRE DE LANCEMENT · GENÈVE

Une offre de lancement pour les restaurateurs genevois !

100 % GRATUITE POUR LES 100 PREMIERS RESTAURANTS

Pour accompagner le lancement de TOK, nous souhaitons offrir des conditions privilégiées aux 100 premiers restaurants partenaires, avec une offre de lancement annoncée à 100 % gratuite.

C’est l’occasion de découvrir la plateforme, de faire partie des premiers établissements référencés et de participer au développement d’une nouvelle solution locale.

## Prêt à découvrir TOK ?

Découvrez notre plateforme : https://thetok.ch

Vous pouvez également répondre directement à cet email. Nous serons ravis de vous présenter TOK, de vous proposer une démonstration et de discuter des possibilités pour votre établissement.

Nous sommes convaincus que les restaurateurs genevois méritent des outils modernes, accessibles et réellement pensés pour leur réussite.

Avec TOK, chaque table compte.

À très bientôt,
L’équipe TOK
Genève, Suisse
https://thetok.ch`,
} as const;

/**
 * Generate an advertising email through the existing safe marketing mail shell.
 * The delivery pipeline supplies the signed, per-recipient unsubscribe URL.
 */
export function renderTokRestaurantAcquisitionCampaign(brand: MarketingEmailBrand) {
  return renderMarketingEmail(
    {
      headline: TOK_RESTAURANT_ACQUISITION_CAMPAIGN.headline,
      preheader: TOK_RESTAURANT_ACQUISITION_CAMPAIGN.preheader,
      body: TOK_RESTAURANT_ACQUISITION_CAMPAIGN.body,
      visualUrl: TOK_RESTAURANT_ACQUISITION_CAMPAIGN.bannerUrl,
      callToAction: TOK_RESTAURANT_ACQUISITION_CAMPAIGN.callToAction,
      callToActionUrl: TOK_RESTAURANT_ACQUISITION_CAMPAIGN.callToActionUrl,
      layout: "campaign",
    },
    brand,
  );
}
