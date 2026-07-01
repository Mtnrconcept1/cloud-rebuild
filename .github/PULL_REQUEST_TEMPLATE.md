## Objectif

Décris le changement en une phrase claire.

## Type de changement

- [ ] Feature
- [ ] Fix
- [ ] Refactor
- [ ] Migration Supabase
- [ ] Stripe / paiement
- [ ] Admin / rôles / permissions
- [ ] UI uniquement

## Checklist TOK

- [ ] Je n'ai pas modifié une migration Supabase historique déjà appliquée.
- [ ] Toute nouvelle migration est ajoutée dans `supabase/migrations`.
- [ ] Les impacts RLS, rôles et ownership restaurant ont été vérifiés.
- [ ] Les montants, statuts de paiement et actions sensibles restent validés côté serveur.
- [ ] Aucun secret, fichier `.env`, clé privée, fichier local ou gros asset n'est inclus.
- [ ] Les changements IA coûteux ou visibles utilisateur sont testés ou explicitement justifiés.
- [ ] Les routes publiques, dashboard, admin et mobile/deep links concernés ont été vérifiés.

## Tests

- [ ] `pnpm lint`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] Autre :

## Notes de déploiement

Indique ici les variables d'environnement, migrations, fonctions Edge, vérifications Stripe/Supabase/Vercel ou actions manuelles nécessaires.
