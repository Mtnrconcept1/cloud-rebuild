# Contexte projet

Repo : `mtnrconcept/cloud-rebuild`
Workspace local : `C:\Users\Pc\cloud-rebuild-recovered`
Stack : React + Vite + TypeScript + Tailwind/shadcn-ui + Supabase + Stripe + Vercel + Capacitor
Gestionnaire de paquets : `pnpm@10.28.1`
Branche de travail actuelle : `main`

# Principe directeur : procédure proportionnée au risque

Ne pas appliquer mécaniquement le même audit et les mêmes validations à toutes les tâches.

Avant de commencer, classer la tâche dans un des trois niveaux ci-dessous. En cas de doute, choisir le niveau supérieur.

## Niveau 1 — léger

Exemples : favicon, image statique, texte/copie, documentation, CSS localisé, métadonnée non sensible, correction visuelle sans logique métier, renommage d'asset ou changement isolé sans effet backend.

Procédure :

1. Vérifier le dépôt, la branche et `git status` si un checkout local est disponible.
2. Lire `AGENTS.md` et uniquement le ou les skills directement concernés.
3. Vérifier uniquement les connecteurs réellement nécessaires à la tâche. Ne pas vérifier Stripe, Supabase ou Vercel si la modification n'en dépend pas.
4. Inspecter les fichiers directement concernés et leurs références immédiates.
5. Produire un plan court : fichiers, risque principal, rollback.
6. Modifier le minimum de fichiers.
7. Lancer le test ciblé s'il existe. Pour une modification purement documentaire ou statique sans logique, un test supplémentaire n'est pas obligatoire.
8. Lancer `pnpm lint`, `pnpm typecheck` ou `pnpm build` seulement lorsqu'ils peuvent raisonnablement détecter une régression liée au changement ou lorsqu'ils sont imposés par la CI.
9. Créer un commit propre et une PR. Laisser la CI obligatoire du dépôt faire autorité pour le merge.

Objectif : quelques étapes utiles, aucune vérification backend sans rapport avec le changement.

## Niveau 2 — standard

Exemples : composant React, route publique, logique frontend, formulaire, SEO de page, requête applicative, intégration non sensible, performance UI, comportement utilisateur sans paiement ni permission critique.

Procédure :

1. Vérifier dépôt, branche, `git status`, derniers commits et PR pertinentes.
2. Lire `AGENTS.md`, `TOK_APPLICATION_SKILL.md`, `TOK_GLOBAL_RULES.md` et le skill du domaine touché.
3. Vérifier les connecteurs réellement utilisés par la fonctionnalité.
4. Auditer les fichiers concernés, les dépendances directes, les tests existants et les risques de régression.
5. Produire un plan avant modification.
6. Modifier le minimum de fichiers et ajouter/adapter un test ciblé lorsque le comportement change.
7. Exécuter au minimum les tests ciblés, puis lint/typecheck/build selon le périmètre et les scripts du repo.
8. Créer commit + PR, contrôler la CI et ne fusionner qu'après validation.

## Niveau 3 — critique

Exemples : paiement/Stripe, commandes, réservations, auth, rôles/permissions, données privées, Supabase/RLS, migrations, Edge Functions, Storage privé, secrets, déploiement production, CI/CD, sécurité, facturation, webhooks, fonctions `SECURITY DEFINER`.

Procédure complète obligatoire :

1. Vérifier tous les connecteurs nécessaires avant toute ligne de code.
2. Vérifier dépôt, branche, `git status`, derniers commits, PR ouvertes et issues pertinentes.
3. Lire tous les skills obligatoires du domaine, `TOK_TESTING_SKILL.md` et `TOK_RELEASE_GATEKEEPER.md`.
4. Auditer architecture, dépendances, migrations, RLS, fonctions, secrets référencés et configuration de déploiement selon le périmètre.
5. Produire un plan détaillé avec fichiers, risques, rollback et ordre des changements.
6. Modifier uniquement le code réel du dépôt, avec gestion d'erreurs, sécurité des entrées et compatibilité.
7. Ajouter ou mettre à jour les tests critiques.
8. Exécuter les validations applicables : lint, typecheck, tests, build, vérifications Supabase, migrations, RLS, Edge Functions, logs et déploiement selon le cas.
9. Créer commit + PR et ne fusionner qu'après validation complète.

# Skills IDE obligatoires

Toujours lire :

1. `TOK_APPLICATION_SKILL.md` pour les tâches de code applicatif.
2. `TOK_GLOBAL_RULES.md` pour les règles permanentes.
3. Le skill correspondant au domaine réellement touché.

Lire `TOK_TESTING_SKILL.md` et `TOK_RELEASE_GATEKEEPER.md` pour les tâches de niveau 2 lorsque le comportement est important, et systématiquement pour le niveau 3.

Ne pas charger ou auditer des domaines sans rapport avec la tâche uniquement pour satisfaire une checklist générique.

Priorités absolues : paiement fiable, commande fiable, Supabase sécurisé, RLS correcte, aucun secret exposé, aucune modification critique sans test, aucune migration destructive.

# Etat actuel

## Ce qui est deja fait

- Application React/Vite avec routes publiques, dashboard restaurateur, espace admin, espace coursier et composants UI shadcn.
- Integration Supabase avec migrations, fonctions Edge et types dans `src/integrations/supabase`.
- Integration Stripe via fonctions Supabase et helpers frontend.
- Workflow de production GitHub Actions present dans `.github/workflows/deploy-production.yml`.
- Configuration Vercel présente dans `vercel.json`, avec `deploymentEnabled: true` pour autoriser les déploiements Git natifs (preview et production).
- Scripts de verification, release readiness, ciblage Supabase et builds mobiles presents dans `package.json`.
- Skills IDE TOK ajoutes dans `docs/skills/` pour encadrer la generation de code.
- DNS `thetok.ch` gere cote Vercel DNS.

## Ce qui ne doit pas etre touche sans demande explicite

- Les secrets, cles API et fichiers d'environnement : `.env`, `.env.production`, `.env.production.local`, secrets Supabase, secrets Stripe, secrets Firebase, secrets Vercel.
- La configuration de deploiement production, sauf demande explicite : `.github/workflows/deploy-production.yml`, `vercel.json`, scripts de deploiement.
- Les routes existantes et le comportement de navigation dans `src/App.tsx`, `src/lib/routing.ts` et les composants de routes protegees, sauf si la tâche les concerne directement.
- Les migrations Supabase deja appliquees ou historiques, sauf correction explicitement demandee.
- Les assets volumineux et fichiers generes (`dist`, screenshots, outputs, logs, caches) sauf besoin direct.

# Contraintes de travail

- Ne pas modifier `main` directement : créer une branche dédiée puis une PR.
- Utiliser un worktree dédié lorsqu'un checkout local est disponible.
- Si le checkout local est techniquement inaccessible mais que le connecteur GitHub est disponible, un mode connector-only est autorisé pour les changements non destructifs : branche dédiée, commit, PR et validation CI. Ne jamais prétendre qu'un worktree local a été utilisé dans ce cas.
- Ne pas créer de preview Vercel sauf si la tâche l'exige explicitement.
- Déploiement frontend de production via l’intégration Git native Vercel ; le workflow GitHub Actions reste une voie de secours pour les opérations backend si nécessaire.
- Ne pas modifier les cles ou secrets sans demande explicite.
- Respecter les changements non commites deja presents : ne jamais les revert sans demande explicite.
- Preferer les patterns existants du repo aux nouvelles abstractions.
- Pour Supabase, verifier la cible avant toute operation risquee avec les scripts du repo (`pnpm supabase:doctor`, `pnpm supabase:target:dev` ou equivalent demande).

# Validation avant commit

La validation dépend du niveau de risque :

- Niveau 1 : test ciblé si pertinent ; lint/typecheck/build uniquement si utile ou imposé par CI.
- Niveau 2 : tests ciblés + lint/typecheck/build selon le périmètre.
- Niveau 3 : suite complète pertinente au domaine, incluant systématiquement les contrôles critiques applicables.

Ne jamais exécuter ou exiger une vérification uniquement parce qu'elle figure dans une ancienne checklist si elle n'a aucun lien avec le changement.

# Statut final attendu

Toujours fournir :

- niveau de risque choisi et justification courte ;
- liste complète des fichiers modifiés ;
- validations exécutées et résultats ;
- validations non exécutées et raison ;
- commit et PR ;
- état du merge/déploiement si demandé.
