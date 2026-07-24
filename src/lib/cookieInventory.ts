import type { ConsentCategory } from "@/lib/consent";

export type TrackerInventoryItem = {
  name: string;
  provider: string;
  storage: "cookie" | "localStorage" | "sessionStorage" | "IndexedDB" | "server event" | "device permission";
  category: ConsentCategory;
  purpose: string;
  duration: string;
  activation: string;
};

export const TRACKER_INVENTORY: TrackerInventoryItem[] = [
  {
    name: "sb-<project-ref>-auth-token",
    provider: "Supabase / TOK",
    storage: "localStorage",
    category: "necessary",
    purpose: "Maintenir la session authentifiée et renouveler les jetons d’accès.",
    duration: "Jusqu’à déconnexion, expiration ou suppression du stockage navigateur.",
    activation: "Connexion ou restauration d’une session existante.",
  },
  {
    name: "tok_consent_2026-07-24-v2",
    provider: "TOK",
    storage: "localStorage",
    category: "necessary",
    purpose: "Mémoriser les catégories acceptées ou refusées et la version du consentement.",
    duration: "Jusqu’à changement de version, retrait ou suppression manuelle.",
    activation: "Premier choix dans le bandeau ou modification des préférences.",
  },
  {
    name: "Consent receipt",
    provider: "TOK / Supabase",
    storage: "server event",
    category: "necessary",
    purpose: "Conserver une preuve datée et append-only du choix exprimé.",
    duration: "Durée probatoire définie dans le registre de conservation; à valider avant lancement.",
    activation: "Enregistrement d’un choix dans le bandeau ou les réglages.",
  },
  {
    name: "Panier et brouillons checkout TOK",
    provider: "TOK",
    storage: "localStorage",
    category: "necessary",
    purpose: "Conserver le panier, le mode de commande et les étapes indispensables au paiement.",
    duration: "Session d’achat ou jusqu’à déconnexion, finalisation ou nettoyage.",
    activation: "Ajout au panier ou démarrage d’un checkout.",
  },
  {
    name: "Sentry error and performance events",
    provider: "Sentry",
    storage: "server event",
    category: "analytics",
    purpose: "Détecter les erreurs, régressions et performances dégradées.",
    duration: "Selon la durée configurée dans le projet Sentry; à reporter dans le registre fournisseur.",
    activation: "Uniquement après consentement analytics, hors événements strictement nécessaires à la sécurité.",
  },
  {
    name: "TOK analytics events",
    provider: "TOK / Supabase",
    storage: "server event",
    category: "analytics",
    purpose: "Mesurer pages, recherches, clics et conversion sous forme agrégée ou pseudonymisée.",
    duration: "Selon la table et la politique de conservation TOK; à automatiser par job de rétention.",
    activation: "Uniquement après consentement analytics.",
  },
  {
    name: "Campaign attribution events",
    provider: "TOK / restaurants partenaires",
    storage: "server event",
    category: "marketing",
    purpose: "Attribuer impressions, clics, réservations et commandes aux campagnes sponsorisées.",
    duration: "Fenêtre d’attribution puis durée probatoire et comptable définie par campagne.",
    activation: "Uniquement après consentement marketing, sauf preuve strictement nécessaire à une transaction demandée.",
  },
  {
    name: "Recommendation preferences",
    provider: "TOK",
    storage: "server event",
    category: "personalization",
    purpose: "Adapter le fil, les restaurants et offres selon les interactions et préférences.",
    duration: "Vie du compte ou jusqu’au retrait, effacement ou anonymisation.",
    activation: "Uniquement après consentement personnalisation.",
  },
  {
    name: "Browser or native geolocation",
    provider: "Navigateur / système / TOK",
    storage: "device permission",
    category: "geolocation",
    purpose: "Trouver les restaurants, offres, distances et services disponibles à proximité.",
    duration: "Permission contrôlée par l’appareil; les coordonnées serveur suivent la politique de conservation.",
    activation: "Consentement géolocalisation TOK et autorisation explicite de l’appareil.",
  },
  {
    name: "Stripe checkout and fraud-prevention technologies",
    provider: "Stripe",
    storage: "cookie",
    category: "necessary",
    purpose: "Sécuriser et exécuter un paiement explicitement demandé, prévenir la fraude et maintenir le checkout.",
    duration: "Selon la documentation Stripe applicable au parcours de paiement.",
    activation: "Ouverture de Stripe Checkout ou d’un composant de paiement.",
  },
  {
    name: "Firebase installation and push token",
    provider: "Google Firebase / TOK",
    storage: "IndexedDB",
    category: "necessary",
    purpose: "Acheminer les notifications demandées vers le navigateur ou l’application.",
    duration: "Jusqu’à révocation, déconnexion, rotation du jeton ou suppression de l’application.",
    activation: "Après activation volontaire des notifications et autorisation de l’appareil.",
  },
];
