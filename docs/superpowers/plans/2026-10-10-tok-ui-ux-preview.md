# Refonte TOK — application réelle en preview

**Goal:** appliquer la maquette approuvée à l'application réelle, avec logo, chef et identité TOK, puis livrer une preview Vercel vérifiée.
**Architecture:** conserver React/Vite, les routes, services, requêtes, autorisations et feature flags. Refondre les composants de présentation et les états utilisateur, sans migration ni modification de paiement.
**Tech Stack:** React, TypeScript, Tailwind/shadcn, Supabase, Vercel.
**Spec:** maquette et audit dans le worktree voisin tok-ux-ui-proposal-20261010/docs/design; demande utilisateur du 10 octobre, avec conservation explicite de la DA TOK.

## Global Constraints
- Branche codex/tok-ui-ux-preview-20261010, base bcdff116, worktree dédié.
- Risque global 3 par couverture des espaces transactionnels; modifications de présentation ciblées. Aucun changement des contrôles d'accès, prix, mutations, RLS ou secrets.
- Identité: logo existant, chef existant, orange TOK approfondi pour le contraste, ivoire, titres Playfair/texte DM Sans. Pas de faux avis/chiffres/données.
- Mobile 320/390/768 et desktop 1440; clavier, contrastes, mouvement réduit, états chargement/vide/erreur.
- La preview garde les services existants. Aucune transaction réelle pendant les tests; les parcours démo existants servent aux démonstrations lorsque disponibles.
- Rollback: revert des commits de présentation; aucune mutation de données ou infrastructure nécessaire.

## Review Focus
Vérifier absence de suppression de fonctionnalités, de contournement auth/feature flags, cohérence des filtres URL, navigation clavier, lisibilité dark/light, erreurs réseau distinctes des listes vides, menus/dialogues non coupés, logo/chef visibles sans masquer les actions. Les tests mocks ne prouvent pas des paiements réels.

## Task 1 — Accueil et découverte TOK
Fichiers: src/components/home/HeroSection.tsx et .css, src/pages/Index.tsx, RestaurantSection.tsx, SectionShowcaseHeader.tsx, CuisineCategoryStrip.tsx et tests associés.
Faire un hero éditorial court avec chef et photos existantes, recherche avec localisation explicite et sans ville imposée; supprimer les titres dupliqués; simplifier densité des rails et conserver les fonctionnalités activées. Écrire test recherche sans ville/ville choisie, conserver conditions newsletter. Vérifier tests home, lint ciblé, puis commit ciblé.

## Task 2 — Recherche et cartes
Fichiers: src/pages/Recherche.tsx, src/components/RestaurantCard.tsx et tests associés.
Rendre résultats prioritaires, filtres lisibles, état erreur récupérable distinct du vide; conserver filtres/tri/pagination/backend et publicité identifiable. Favoris accessibles avec nom/état/cible44px. Tester recherche, erreurs et actions carte; commit ciblé.

## Task 3 — Système visuel et espaces connectés
Fichiers: src/index.css, src/components/ui/{button-variants,card,input,select,tabs}.tsx (ou extension existante), Navbar.tsx, home/FooterSection.tsx, CustomerDashboardLayout.tsx, DashboardLayout.tsx, CourierDashboardLayout.tsx, commercial/CommercialWorkspaceChrome.tsx, admin/AdminMobileNavigation.tsx, MobileLogoIntro.tsx, tests associés si comportement change.
Harmoniser tokens, surfaces, typographie, focus, tailles de cible et navigation. Logo/chef dans chrome quand pertinent. Rendre intro non bloquante. Préserver toutes conditions d'accès/liens/features. Vérifier tests navigation/layout et contraste.

## Task 4 — Fiche restaurant et finitions parcours
Fichiers: src/pages/RestaurantDetail.tsx et composants de présentation immédiatement dépendants; tests associés.
Hiérarchie compacte, états services fidèles, annuaire sans promesse de réservation indisponible, coordonnées et infos accessibles, invitation propriétaire secondaire. Garder intégrations et transactions existantes. Tester disponibilités/annuaire/navigation et vérifier compte, panier, réservations, commande, dashboard, admin, commercial et livreur avec données démo existantes ou états anonymes sûrs.

## Task 5 — Validation, publication et preview
Exécuter tests ciblés puis suite pertinente/full, pnpm lint/typecheck/build; régénérer index canonique. Revue indépendante du diff et vérifications navigateur responsive. Commit/push/PR; déployer explicitement la branche avec connecteur Vercel target preview, vérifier état READY et navigateur distant. Conserver production distincte; merge seulement après critères satisfaits. Rapport exhaustif fichiers, tests, liens, limites.
