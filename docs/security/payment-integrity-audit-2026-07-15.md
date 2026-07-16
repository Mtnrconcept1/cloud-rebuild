# Audit d’intégrité des paiements — 15 juillet 2026

## Portée et limite de garantie

Cet audit couvre le frontend Vite/React, les Edge Functions Supabase, PostgreSQL,
Stripe, les déploiements Vercel et les contrôles GitHub du dépôt
`mtnrconcept/cloud-rebuild`.

Il n’est pas possible de garantir qu’« aucun bug ne peut avoir lieu ». L’objectif
atteint par ce lot est plus précis : empêcher les doubles débits et doubles
commandes connus, rendre les états ambigus récupérables, échouer fermé en cas
d’incohérence et conserver assez de preuves pour réconcilier.

## État observé en production

Snapshot Supabase en lecture seule :

- 19 restaurants, dont 18 hors démonstration ;
- aucun compte Stripe Connect rattaché et aucun restaurant Connect prêt ;
- `connect_routing_enabled = false` ;
- commission plateforme : 1 000 bps (10 %) ;
- part développeur : 1 000 bps de la recette TOK (10 % de TOK, donc 1 % du
  brut marketplace avec les paramètres actuels) ;
- 1 496 événements webhook marqués réussis, aucun échec ou traitement bloqué
  au moment du snapshot ;
- aucune duplication détectée parmi les charges réussies par commande et
  PaymentIntent, ni par cible sémantique de Checkout ;
- 193 écritures de ledger sur 44 sources, toutes équilibrées ;
- aucune clé d’idempotence de commande dupliquée et aucune incohérence détectée
  sur les agrégats de remboursement ;
- trois profils de rémunération commerciale (un `sprint`, deux `team_lead`),
  aucune commission dans `commercial_commissions` et deux relevés développeur
  encore au statut `draft`.

Le connecteur Stripe exposait seulement deux PaymentIntents live réussis sur sa
fenêtre de recherche, de 1 CHF chacun, sans remboursement ni litige. Ce résultat
est un échantillon du compte accessible au connecteur, pas une preuve exhaustive
de tous les comptes ou clés Stripe de l’application.

## Séparation financière actuelle

| Flux marketplace | Calcul serveur actuel |
| --- | ---: |
| Restaurateur | 90 % du brut |
| TOK | 10 % du brut |
| Développeur | 10 % de la recette TOK |
| Commercial | Pas de quote-part générique du paiement |

La rémunération commerciale suit ses propres règles métier : acquisition,
sprint, engagement/team lead et éventuelle commission de réservation. Elle ne
doit pas être déduite arbitrairement de la part restaurateur ou développeur.

Le ledger interne sait calculer les quatre responsabilités, mais le transfert
automatique de la part restaurateur n’est pas actif tant que Stripe Connect est
désactivé et que les comptes restaurants ne sont pas onboardés.

## Corrections implémentées dans cette PR

### Tentative de paiement durable

- UUID client stable par opération, conservé en `sessionStorage` et dans l’URL
  de retour ;
- verrou synchrone frontend contre le double clic ;
- tentative serveur unique par mode Stripe et clé d’opération ;
- snapshot exact de la requête scellé par empreinte SHA-256 ;
- clé d’idempotence Stripe stable par tentative et génération ;
- bail serveur récupérable pour éviter deux créateurs simultanés ;
- séparation stricte `test` / `live` dans tentatives, transactions et ledger.

### Connexion interrompue, refresh et retour arrière

- timeout, coupure réseau, 409, 429 et 5xx traités comme états indéterminés :
  aucune nouvelle opération n’est créée ;
- polling du statut serveur avec le même UUID ;
- un refresh conserve la tentative ;
- un retour navigateur/bfcache demande l’expiration Stripe puis libère les
  réservations ;
- une session payée ou complète ne peut jamais être annulée par ce chemin ;
- une course entre création et annulation est arbitrée en base : la session
  créée n’est jamais exposée si l’annulation a gagné ;
- le panier n’est vidé qu’après confirmation serveur finale.

### Commandes et inventaire

- création de commande sérialisée par `checkout_id` avec empreinte d’identité ;
- contraintes uniques sémantiques sur les transactions réussies ;
- Checkout limité à un restaurant pour permettre un routage et une
  responsabilité comptable non ambigus ;
- expiration Stripe bornée à la fenêtre de réservation en base ;
- compensation idempotente des commandes, packs, Zero Attente et Table du Chef.

### Webhooks

- signature Stripe vérifiée sur le corps brut ;
- claim par `event.id`, mode et type ;
- bail récupérable si un worker meurt ;
- un événement réellement terminé seulement reçoit un HTTP 2xx de doublon ;
- un événement déjà en cours reçoit un 409 afin que Stripe réessaie ;
- réussite/échec enregistrés après les effets métier ;
- récupération client et réconciliation planifiée partagent un événement
  financier interne canonique, avec le même mécanisme de bail.

Stripe documente à la fois la livraison asynchrone des événements, les retries
et l’absence de garantie d’ordre. Les handlers restent donc indépendants de
l’ordre de livraison :

- https://docs.stripe.com/webhooks
- https://docs.stripe.com/api/events/types

### Remboursements et litiges

- clé d’idempotence stable pour les clics concurrents ;
- nouvelle génération seulement après un remboursement Stripe terminalement
  échoué ou annulé ;
- cycle `pending` / `succeeded` / `failed` / `cancelled` persisté ;
- seul `succeeded` modifie le montant remboursé métier ;
- allocation multi-commandes déterministe au centime ;
- réservations `pending` et `succeeded` des autres remboursements soustraites
  avant allocation ;
- reprise sûre après persistance partielle ;
- montant cumulé borné atomiquement par le total de la cible ;
- reversement Connect et application fee inversés pour une destination charge ;
- écritures de refund, dispute, chargeback et rétablissement append-only.

### Comptabilité

- ledger équilibré et append-only ;
- mode Stripe explicite dans le ledger et les transactions ;
- part restaurateur, recette TOK et dette développeur séparées ;
- relevés développeur calculés depuis `developer_payable`, pas depuis un
  pourcentage recalculé a posteriori ;
- événements/relevés commerciaux append-only disponibles, mais sans inventer
  une règle de rémunération absente ;
- si une session marketplace contient de la TVA, le système refuse d’attribuer
  toute la TVA à TOK sans règle de responsabilité fiscale explicite et crée une
  demande de réconciliation.

## Points restant bloquants avant activation production

1. **Stripe Connect** — onboarder les restaurants, vérifier
   `details_submitted`, `charges_enabled`, `payouts_enabled` et les exigences,
   puis activer le routage seulement après un pilote et une réconciliation.
2. **Règle commerciale** — décider quelle règle existante déclenche un accrual
   cash-basis, son assiette, sa date et son comportement au remboursement. Le
   lot fournit les primitives mais ne fabrique pas une règle contractuelle.
3. **Réconciliation TVA/frais** — connecter un worker au `finance_outbox` ; les
   cas de responsabilité TVA marketplace doivent rester en revue humaine tant
   que l’assiette n’est pas contractualisée.
4. **Webhook Stripe** — vérifier dans le Dashboard Stripe les endpoints live et
   test, les secrets, les événements abonnés, le taux d’erreur et l’absence d’un
   ancien endpoint concurrent. Cette configuration n’était pas exposée par le
   connecteur utilisé pour l’audit.
5. **Validation transactionnelle complète** — la migration et les machines
   d’état ont passé la preview PostgreSQL isolée. Il reste à exécuter le parcours
   navigateur → Edge Function → Stripe test → webhook → base, y compris les
   remboursements concurrents, avec les secrets de preview.
6. **Notifications** — les écritures monétaires sont idempotentes ; les emails
   et pushes externes restent au moins une fois et peuvent être dupliqués si le
   fournisseur accepte l’envoi puis coupe la réponse.

## Ordre de déploiement obligatoire

1. créer une branche Supabase de preview ;
2. appliquer la migration et exécuter les advisors ;
3. déployer les Edge Functions ;
4. déployer le frontend Vercel ;
5. tester double clic, offline après envoi, refresh, back, succès tardif,
   remboursement partiel concurrent et replay webhook ;
6. observer webhooks, tentatives, outbox et équilibre du ledger ;
7. seulement ensuite envisager production et activation progressive de Connect.

## Validation locale

- 54 tests de paiement/intégrité ciblés réussis dans la dernière passe ;
- 35 contrats historiques supplémentaires réussis (89 tests uniques au total) ;
- transpilation syntaxique de tous les fichiers TypeScript/TSX modifiés ;
- migration PostgreSQL parsée : 187 instructions ;
- aucune migration, fonction ou configuration de production modifiée pendant
  l’audit.

## Validation Supabase de preview

L’ouverture de la PR a créé automatiquement la branche éphémère
`agent/payment-integrity-hardening` (`fjrcjeyqwihnhlhzpbzw`). Sur cette branche :

- la chaîne complète des migrations, dont
  `20260715060000_payment_integrity_state_machine`, est passée ;
- les cinq nouvelles tables ont RLS activé ; aucune n’accorde d’accès à `anon`
  et seule la lecture des relevés commerciaux est volontairement accordée aux
  utilisateurs authentifiés sous policy propriétaire/admin ;
- les 23 RPC publiques sensibles ne sont exécutables ni par `anon` ni par
  `authenticated`, et sont toutes exécutables par `service_role` ;
- 50 index ciblés sont valides/prêts et les 53 contraintes des nouvelles tables
  sont validées ;
- huit acquisitions réellement concurrentes avec la même clé ont produit une
  seule tentative, une seule génération et un seul bail ;
- huit claims réellement concurrents du même webhook ont produit une seule
  ligne, un seul bail actif et un compteur d’essai égal à un ;
- le smoke test transactionnel a validé la réutilisation, le scellement de la
  requête, la course retour-arrière/créateur, l’annulation d’une session liée,
  la finalisation tardive qui prime sur l’annulation et la déduplication après
  succès du webhook ;
- les advisors n’attribuent aucun avertissement d’exécution SECURITY DEFINER
  aux nouveaux RPC. Les informations `rls_enabled_no_policy` des tables internes
  sont intentionnelles : elles sont service-only. Le seul nouveau FK non indexé
  signalé (`commercial_statements.created_by`) est corrigé dans la migration de
  suivi `20260715060500_payment_integrity_advisor_followup`.

Ces tests utilisent une base vide isolée et des identifiants Stripe factices ;
ils ne remplacent pas le parcours Stripe test réel ni un test de charge prolongé.
