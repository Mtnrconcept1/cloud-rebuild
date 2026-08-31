# TOK Testing Skill

À utiliser pour les modifications qui changent un comportement applicatif ou touchent une zone critique : paiements, commandes, réservations, Supabase, RLS, admin, notifications, sécurité, SEO, migrations SQL, Storage ou IA.

## Objectif

Empêcher qu’une modification casse une fonctionnalité réelle, tout en évitant d’imposer une suite de tests disproportionnée à une modification purement statique ou documentaire.

## Règle de proportionnalité

### Niveau 1 — léger

Exemples : documentation, favicon, image statique, texte, CSS localisé, metadata simple sans logique.

- Aucun nouveau test n’est obligatoire si aucun comportement n’est modifié.
- Utiliser un test existant ciblé si le repo en possède déjà un pour cette règle.
- Lint/typecheck/build ne sont requis que s’ils peuvent détecter une régression liée au changement ou si la CI les impose.
- Ne jamais lancer une validation backend sans rapport avec le changement.

### Niveau 2 — standard

Exemples : composant React, formulaire, route publique, logique frontend, SEO de page, intégration non sensible.

- Ajouter ou mettre à jour un test ciblé si le comportement change.
- Exécuter les tests directement liés au composant ou au domaine modifié.
- Ajouter lint, typecheck et build selon le périmètre et les scripts du repo.
- Utiliser Playwright lorsque le risque concerne réellement un parcours navigateur.

### Niveau 3 — critique

Exemples : paiement, commande, réservation, auth, rôles, données privées, Supabase/RLS, migrations, Edge Functions, webhooks, Storage privé, sécurité, CI/CD ou déploiement production.

- Ajouter ou mettre à jour les tests critiques obligatoirement.
- Exécuter toutes les validations pertinentes au domaine : tests ciblés et critiques, lint, typecheck, build, doctor/target Supabase, vérifications migrations/RLS, logs ou déploiement si applicable.
- Une validation non exécutée doit être explicitement déclarée avec sa raison.

## Règles obligatoires

1. Toute modification critique doit ajouter ou mettre à jour un test.
2. Les tests doivent protéger le comportement métier, pas seulement l’implémentation.
3. Les tests autour du paiement doivent couvrir l’idempotence et la réconciliation Stripe.
4. Les tests autour de Supabase doivent vérifier migrations, policies, fonctions et indexes quand c’est pertinent.
5. Les tests front doivent vérifier les parcours utilisateurs critiques lorsqu’ils sont réellement touchés.
6. Les tests ne doivent pas dépendre d’un environnement production réel.
7. Ne jamais supprimer un test qui protège un bug connu sans le remplacer.
8. Ajouter un guard test textuel seulement s’il protège une règle durable et que ce pattern est déjà utilisé dans le repo ; ne pas créer systématiquement un test pour chaque asset ou changement de copie.

## Zones qui exigent des tests

- `create-checkout`
- `stripe-webhook`
- helpers de pricing
- création et finalisation de commande
- remboursement ou annulation
- réservation normale, Zero Attente et Chefs Table
- auth, rôles et permissions
- RLS et migrations sensibles
- dashboards restaurant et admin pour les actions critiques
- notifications critiques
- SEO public lorsqu’un changement peut affecter indexation, canonical, données structurées ou routage
- uploads Storage
- IA coûteuse ou visible publiquement

## Commandes de validation attendues

Choisir uniquement celles qui correspondent au niveau de risque :

- test ciblé Vitest
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- test Playwright ciblé si parcours navigateur
- vérification Supabase doctor/target si migration ou production DB

## Avant de finaliser

- Indiquer le niveau de risque.
- Expliquer quels tests ont été ajoutés ou mis à jour.
- Expliquer quelles validations ont été exécutées.
- Expliquer quelles validations n’ont pas été lancées et pourquoi elles n’étaient pas pertinentes ou possibles.
- Ne jamais prétendre qu’un test a été exécuté s’il ne l’a pas été.
