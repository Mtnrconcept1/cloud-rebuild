

# Plan : Cloner le projet "Bite & Book" (Miamz) dans ce projet

## Résumé

J'ai trouvé votre projet **[Bite & Book](/projects/e9cd75ba-95d3-4ef0-92a5-fb7ab8500436)** dans votre workspace Lovable. C'est une application de livraison de restaurants (Miamz) avec ~100+ fichiers comprenant :

- **30 pages** (Index, Auth, Recherche, RestaurantDetail, Anti-Gaspi, Panier, Commandes, Profil, etc.)
- **22 pages dashboard restaurateur** (Menu, Réservations, Commandes, Performances, etc.)
- **6 pages admin** (Restaurants, Utilisateurs, Avis, Drops, Notifications)
- **30+ composants** (Navbar, RestaurantCard, DeliveryMap, SupportChat, etc.)
- **13 fichiers lib** (auth, cart, analytics, geo, etc.)
- **50+ migrations Supabase**
- **2 edge functions** (create-campaign, dispatch-notifications)

## Approche

L'implémentation se fera en plusieurs étapes séquentielles :

1. **Configuration de base** — Copier `package.json`, `index.html`, `tailwind.config.ts`, `vite.config.ts`, `src/index.css`, `src/main.tsx`, `components.json`

2. **Fichiers lib et hooks** — Copier les 13 fichiers `src/lib/*` (auth, cart, analytics, geo, etc.) et les hooks

3. **Composants UI** — Les composants shadcn/ui sont déjà présents et identiques, copier uniquement ceux manquants

4. **Composants métier** — Copier les 30+ composants (Navbar, RestaurantCard, DeliveryMap, SupportChat, etc.)

5. **Pages publiques** — Copier les 30 pages (Index, Auth, Recherche, etc.)

6. **Pages dashboard et admin** — Copier les 28 pages dashboard/admin

7. **App.tsx et routing** — Copier le routeur complet avec toutes les routes

8. **Intégrations Supabase** — Copier `types.ts` et adapter `client.ts` pour utiliser le Supabase de ce projet

9. **Migrations Supabase** — Appliquer les 50+ migrations pour recréer le schéma de base de données

10. **Edge Functions** — Déployer les 2 edge functions

## Points d'attention

- **Supabase** : Ce projet a déjà un Supabase connecté (`sfsdbloppvjwvtobmink`). Les migrations seront appliquées sur cette instance — pas celle de l'ancien projet.
- **Firebase** : Le projet source utilise aussi `firebase` — il faudra vérifier si c'est activement utilisé ou résiduel.
- **Leaflet** : Dépendance pour les cartes — sera ajoutée.
- **Remotion** : Dossiers `remotion/` et `video-remotion/` pour la génération vidéo — non supporté par Lovable, sera ignoré.
- **Dépendances supplémentaires** à ajouter : `firebase`, `leaflet`, `@types/leaflet`, `embla-carousel-autoplay`, `@tailwindcss/typography`

## Estimation

Étant donné le volume (~100+ fichiers à copier), l'implémentation nécessitera plusieurs itérations. Le code sera copié fichier par fichier depuis le projet source.

