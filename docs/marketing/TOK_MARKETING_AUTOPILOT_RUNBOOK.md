# TOK Marketing Autopilot — runbook d'exploitation

## Objet

Ce document décrit le socle de contrôle de TOK Marketing Autopilot. Il couvre le registre des
fournisseurs, le catalogue des automatisations TOK, la simulation, la préparation d'actions en
brouillon, les assets et l'attribution. Il ne constitue pas une preuve de connexion à un compte
fournisseur.

Le principe de sécurité est simple : **aucune publication, mutation CRM, prise de contact ou dépense
n'est autorisée par ce socle**. Une intégration reste fermée tant que sa configuration, son compte,
ses permissions et son canari ne sont pas confirmés côté serveur.

## États et garanties

### Fournisseurs

Les fournisseurs utilisent exclusivement les états suivants :

- `unconfigured` : aucun compte vérifié ;
- `invalid_configuration` : configuration présente mais invalide ;
- `ready` : réservé à une future sonde serveur probante et fraîche ;
- `degraded` : fournisseur joignable mais incomplet ou instable ;
- `paused` : arrêt opérateur explicite.

Le navigateur ne reçoit jamais une valeur de secret. Il ne peut modifier que l'état de contrôle
`unconfigured`/`paused` avec un motif journalisé. Le passage à `ready` n'est pas exposé par le BFF
d'administration.

### Automatisations

Les huit modèles (`zero_attente`, `ventes_flash`, `anti_gaspillage`, `print_studio`, `plan_salle`,
`tok_social`, `publicites_ia`, `comptabilite_ia`) sont créés désactivés.

Le parcours autorisé est :

1. renseigner des entrées non sensibles ;
2. lancer une simulation déterministe, qui émet un reçu opaque valable 15 minutes ;
3. vérifier prérequis, audience estimée et coût maximal connu ;
4. préparer une action idempotente en `draft` ;
5. relire et approuver chaque élément dans le calendrier existant.

Une simulation ne contacte aucun fournisseur. La préparation exige le reçu correspondant au même
administrateur, au même modèle et aux mêmes entrées ; un reçu consommé n'est réutilisable que pour
rejouer exactement la même requête idempotente. La préparation ne publie rien et ne dépense rien.
La pause globale historique garde la priorité sur tout traitement.

### Analytics

Chaque KPI financier est nullable. `0` signifie une valeur observée égale à zéro ; `null` signifie
que les entrées ne permettent pas le calcul. La réponse associe la fraîcheur, la complétude et les
motifs d'indisponibilité. Les événements historiques `delivered`, `clicked`, `converted` et leurs
formes canoniques `delivery_*` sont normalisés sans réécrire l'historique.

## Opérations BFF autorisées

Le BFF possède une liste blanche séparée et route uniquement les opérations suivantes vers
`service_execute_marketing_autopilot_operation` :

- `admin_get_marketing_autopilot_dashboard` ;
- `admin_simulate_marketing_automation` ;
- `admin_prepare_marketing_automation_action` ;
- `admin_upsert_marketing_asset` ;
- `admin_update_marketing_provider_control`.

La session marketing opaque, le CSRF, l'origine same-origin, le MFA AAL2 et le rôle administrateur
sont réévalués avant chaque appel. Le dispatcher SQL réévalue à son tour la session et le rôle.

L'ancien lancement groupé depuis l'agent IA est désactivé : l'endpoint de compatibilité authentifie
le demandeur puis répond sans mutation. L'approbation se fait désormais élément par élément.

## Secrets

Les liens de désinscription utilisent `MARKETING_UNSUBSCRIBE_SECRET`, distinct de
`MARKETING_WEBHOOK_SECRET`. L'orchestrateur classe la livraison `blocked_configuration` avant tout
appel Resend si le secret principal est absent, invalide ou si l'URL HTTPS de désinscription ne peut
pas être construite. Le service refuse aussi de générer ou d'accepter un jeton dans ces cas. La
rotation peut utiliser uniquement la variable de compatibilité dédiée documentée dans le code ; le
secret webhook ne doit jamais servir de repli.

Avant déploiement :

- générer une valeur aléatoire indépendante pour chaque environnement ;
- stocker la valeur dans le coffre de secrets Supabase ;
- vérifier que les journaux et réponses ne l'exposent pas ;
- tester un lien courant, un lien expiré et un lien signé avec l'ancienne clé de rotation ;
- retirer l'ancienne clé après la fenêtre de validité maximale.

## Déploiement

1. Vérifier que la migration est la seule nouvelle migration et qu'aucun historique n'a été édité.
2. Rejouer les migrations sur une base locale vide, puis sur une copie représentative sans données
   personnelles réelles.
3. Tester les refus directs pour `anon` et `authenticated`, puis les RPC via `service_role` avec une
   session marketing valide.
4. Déployer le code BFF et l'interface après la migration.
5. Configurer `MARKETING_UNSUBSCRIBE_SECRET` dans l'environnement GitHub `production` avant
   l'orchestrateur et l'endpoint public de désinscription ; la readiness bloque la release sinon.
6. Vérifier que les sept fournisseurs sont `unconfigured` et les huit automatisations `disabled`.
7. Exécuter une simulation, préparer un brouillon, vérifier l'audit, puis supprimer le brouillon de
   test selon la procédure de données de l'environnement.
8. Confirmer qu'aucun appel fournisseur n'a été produit.

## Rollback

- remettre les fournisseurs à `paused` et conserver la pause globale ;
- revenir à la version applicative précédente ;
- révoquer l'exécution du dispatcher autopilot si nécessaire ;
- conserver les tables additives pour l'audit et éviter toute perte de preuve ;
- appliquer seulement une migration compensatoire revue, jamais modifier la migration déjà jouée.

Les actions externes ne sont pas annulables par un rollback applicatif. C'est pourquoi ce lot ne les
active pas.

## Conditions avant un canari fournisseur

Les éléments suivants restent obligatoires et doivent être enregistrés dans l'issue de suivi :

- choix Metricool ou API directe ;
- source de vérité TOK/HubSpot par champ ;
- comptes sociaux, propriétés Search Console et comptes publicitaires autorisés ;
- pays, langues, audience et propriétaires ;
- niveau d'autonomie initial ;
- plafond du budget payant ;
- inventaire des 30 assets, licences et dates d'expiration ;
- compte sandbox, scopes minimaux, signature webhook native et procédure de révocation ;
- succès du canari et réconciliation des résultats côté fournisseur.

Tant qu'une condition manque, l'interface doit afficher la décision manquante et conserver le
fournisseur fermé.

## Validation locale

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm exec vitest run --mode production src/test/marketing*
corepack pnpm run lint
corepack pnpm run typecheck
corepack pnpm run build:prod
node --test scripts/ci-change-plan.test.mjs scripts/ci-critical-tests.test.mjs scripts/ci-migration-version-guard.test.mjs
git diff --check
```

Lorsque Docker/Supabase local est disponible :

```powershell
corepack pnpm exec supabase db reset --local
```

Une validation de chaînes SQL ou un build frontend ne remplace pas le rejeu réel des migrations, les
tests RLS ni un canari sandbox. Les preuves local, CI, preview, sandbox et production doivent rester
séparées dans le compte rendu.
