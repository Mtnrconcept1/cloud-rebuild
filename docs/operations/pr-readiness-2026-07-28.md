# Préparation des PR — IA, catalogue fournisseur et incidents

Date de revue : 28 juillet 2026  
Branche analysée : `work`  
Révision analysée : `9054de2`

## Objectif

Ce document prépare le découpage et l'ordre de livraison des changements récents autour du plat du jour IA, du catalogue Aligro et de l'automatisation des incidents. Il ne vaut pas validation de production : les migrations et les Edge Functions restent déployées par le workflow GitHub Actions habituel.

## Découpage recommandé

### PR 1 — Publication du plat du jour et consentements mobiles

Périmètre :

- publication du plat du jour PhotoPro et métadonnées d'actualité associées ;
- stabilisation de l'inscription et de la bannière de consentement sur mobile ;
- tests ciblés sur l'inscription, le rendu mobile et le fallback IA.

Révision de référence : `8101277`.

Contrôles humains : vérifier l'inscription sur un téléphone étroit et confirmer qu'un plat publié apparaît dans les actualités sans dupliquer une publication existante.

### PR 2 — Catalogue Aligro et résilience des créations IA

Périmètre :

- stockage et synchronisation hebdomadaire du catalogue fournisseur ;
- fonction `aligro-catalog-sync` et migrations associées ;
- reprise, persistance et visibilité des tâches de génération IA ;
- statut explicite des incidents terminés sans modification.

Révision de référence : `011b6d0` (incluant les correctifs préparatoires `40f2880` à `9eba0c4`).

Ordre de livraison : appliquer les migrations `20260728030000_supplier_catalog.sql` puis `20260728030100_aligro_catalog_weekly_sync.sql` avant d'activer la synchronisation. La migration `20260728010000_ops_incident_no_changes_status.sql` doit accompagner la version correspondante de `ops-incident-control`.

Contrôles humains : confirmer la cible Supabase dans le job de production, vérifier les secrets déjà attendus par les fonctions sans en ajouter dans le dépôt, puis contrôler un cycle de synchronisation en lecture seule avant toute activation planifiée.

### PR 3 — Preuves de diagnostic pour l'analyseur d'incidents

Périmètre :

- génération déterministe de la carte des codes d'erreur ;
- transmission de preuves plus complètes à l'analyseur ;
- normalisation des erreurs d'authentification et des réponses OpenAI ;
- historique de notifications plus lisible ;
- tests de profondeur des preuves.

Révision de référence : `9054de2`.

Contrôles humains : régénérer la carte avec `pnpm generate:error-code-map`, vérifier que le dépôt reste propre, puis simuler un incident sans autoriser de mutation en production.

## Risques et garde-fous vérifiés

- **Paiement et commandes** : aucun calcul de prix, webhook Stripe ou changement d'état de commande n'entre dans ce périmètre.
- **Supabase** : les nouvelles migrations doivent être appliquées par le workflow de production ; aucune migration historique ne doit être modifiée.
- **RLS et secrets** : les clients privilégiés restent dans les Edge Functions. Aucun secret ne doit être copié dans une variable `VITE_*` ou dans le dépôt.
- **IA** : une indisponibilité du fournisseur doit produire un état d'échec ou de reprise explicite, sans bloquer les parcours de commande et de réservation.
- **Incidents** : un résultat « aucune modification » doit rester traçable et ne doit pas être présenté comme une réparation appliquée.
- **Déploiement** : aucune preview Vercel ni migration manuelle de production n'est requise pour préparer ces PR.

## Validation avant fusion

Exécuter sur chaque branche finale :

```bash
pnpm lint
pnpm test
pnpm build
```

Pour la PR catalogue/Supabase, ajouter avant fusion les contrôles de ciblage prévus par le dépôt :

```bash
pnpm supabase:doctor:prod
```

La fusion doit suivre l'ordre PR 1, PR 2, puis PR 3 si les branches sont reconstruites depuis les révisions de référence. Si les changements sont déjà présents sur la branche cible, ne pas ouvrir de PR de code en doublon ; conserver seulement ce rapport de préparation et publier un commentaire factuel sur les issues concernées.
