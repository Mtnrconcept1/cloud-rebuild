# Tok audit readiness — plan 10/10

Ce document transforme l'audit exécutif en garde-fous vérifiables dans le dépôt. Les actions qui nécessitent les consoles Stripe, Supabase, GitHub ou Vercel restent des validations humaines et ne doivent pas être simulées depuis Codex.

## Statut local implémenté

| Domaine | Cible 10/10 | Preuve locale |
| --- | --- | --- |
| Paiements Stripe | Webhook vérifié sur corps brut, secrets `whsec_`, idempotence et retry contrôlé. | `stripe-webhook` lit `req.text()` avant vérification, accepte les secrets configurés et revendique l'événement avant les effets métier. |
| Comptabilité | Registre append-only séparé des tables opérationnelles. | Migration `financial_ledger` avec montants en centimes, devise explicite, référence Stripe optionnelle, contrainte d'unicité source et trigger anti-update/delete. |
| Rémunération développeur | Calcul sur revenu Tok uniquement, jamais sur l'argent du restaurant. | Migration `developer_statements` avec revenus de réservations, services payants, abonnements, ajustements et part en basis points. |
| Supabase/RLS | Tables financières sensibles invisibles aux clients/restaurateurs. | RLS activée, lecture admin uniquement, écriture via `service_role`, aucun grant `anon`. |
| Traçabilité | Corrections par annulation ou ajustement, pas modification historique. | `financial_ledger.reversal_of` et triggers d'immutabilité. |
| Montée en charge | Index pour réconciliation et dashboards financiers. | Index par source, restaurant/date, événement Stripe, compte/date et période de statement. |

## Actions opérationnelles obligatoires hors dépôt

1. Dans Stripe, vérifier que l'endpoint de production pointe vers `stripe-webhook` et que le secret `whsec_` correspondant est stocké dans les secrets Supabase/GitHub de production.
2. Dans Stripe, relivrer les événements échoués après déploiement et confirmer qu'ils deviennent `succeeded` ou `duplicate` côté `stripe_webhook_events`.
3. Dans Supabase, exécuter Security Advisor et Performance Advisor après application des migrations.
4. Dans Supabase, contrôler que `service_role` n'est présent que dans les Edge Functions et jamais dans le bundle frontend ou mobile.
5. Dans GitHub, activer branch protection/rulesets, secret scanning, push protection, Dependabot alerts/updates, Dependency Review et CodeQL.
6. Dans Vercel, vérifier les en-têtes, domaines `thetok.ch`, TLS, variables publiques uniquement et absence de preview automatique non souhaitée.
7. Avec la fiduciaire, valider TVA, base hors TVA, chargebacks, remboursements, rabais et définition contractuelle de la table facturable.
8. Avec le conseil juridique, valider LPD, registre des traitements, contrats de sous-traitance et procédure de violation de données.

## Définition financière de référence

Le revenu Tok servant au calcul du développeur est limité aux montants définitivement acquis par Tok : frais de réservation facturables, commissions sur services payants, abonnements et ajustements validés. Il exclut toujours les fonds appartenant aux restaurants, pourboires, TVA collectée pour l'État, remboursements, chargebacks, annulations, avoirs et erreurs de facturation.

Formule cible :

```text
Revenu Tok = frais_reservations + commissions_services + abonnements + ajustements
Part developpeur = Revenu Tok * developer_share_bps / 10000
```

Avec `developer_share_bps = 1000`, cela correspond à 10% du revenu Tok, soit économiquement CHF 0.50 par table de CHF 5, 1% du volume client des services soumis à commission de 10%, et 10% des abonnements.

## Critères de sortie 10/10

- Aucun paiement ne dépend du retour navigateur.
- Un même événement Stripe peut être rejoué sans double commande, double commission ou double remboursement.
- Chaque entrée financière est traçable vers une source métier et, si applicable, un événement Stripe.
- Une correction financière crée une écriture inverse ou un ajustement.
- Un restaurateur ne peut ni lire ni modifier les données d'un autre restaurant.
- Les secrets ne sont jamais versionnés, exposés au frontend ou journalisés.
- Les uploads sont limités, validés et servis par URL signée lorsque le contenu n'est pas public.
- Les fonctions IA sont côté serveur, quotaées, journalisées et ne décident jamais de prix, remboursement, commission, paiement ou droits utilisateur.
- La production reste livrée par GitHub Actions après tests, build, doctor Supabase et approbations nécessaires.
