# Modèle économique restaurateur — hypothèses

Version tarifaire : `fair_growth_2026_07`.

> L'identifiant de version garde son nom d'origine : il est persisté en base
> dans `reservation_pricing_version` et `pricing_version_snapshot`. Le changer
> désynchroniserait le code des lignes déjà écrites.

## Grille restaurateur

| Offre | Abonnement mensuel | Réservation honorée | Commande marketplace | Établissements inclus |
|---|---:|---:|---:|---:|
| Starter | CHF 69 | CHF 5.00 | 9,9 % | 1 |
| Business | CHF 129 | CHF 5.00 | 8,9 % | 1 |
| Premium | CHF 199 | CHF 5.00 | 7,9 % | 1 |
| Elite | CHF 499 | CHF 5.00 | 6,9 % | 3 |

Elite prévoit CHF 149 par établissement supplémentaire. L'annuel fournit douze
mois de service au prix de onze mensualités. Son activation reste protégée par le
flag `billing-fair-growth-annual` jusqu'à validation Stripe en environnement de
test.

**Le frais de réservation ne se négocie plus par plan.** Seule la commission
marketplace distingue encore les offres.

## Règles de facturation des réservations

- Toute réservation honorée est facturée CHF 5, quelle qu'en soit l'origine.
- Le forfait n'est pas plafonné et ne dépend pas du chiffre d'affaires de la
  table. La source d'acquisition reste attribuée et scellée côté serveur, mais
  à des fins statistiques uniquement.
- Le frais est posé au moment où la table passe en `arrived`, par le trigger
  `apply_flat_reservation_fee_on_arrival`. Il n'y a plus d'étape de clôture.
- Une réservation encore en attente une heure après son horaire bascule
  automatiquement en `arrived` (cron `tok-auto-arrive-overdue-reservations`,
  toutes les dix minutes). La bascule laisse une trace dans `metadata`
  (`auto_arrived_at`, `auto_arrived_reason`) pour que le restaurateur puisse
  annuler et se justifier auprès de TOK.
- Annulation, no-show, remboursement et démonstration ne sont pas facturés.

## Règles favorables aux restaurants

- Le restaurant reçoit 100 % des pourboires.
- La commission d'une commande ne porte ni sur le pourboire ni sur la livraison.
  Le développeur reçoit 1 % de la base commissionnable; le restaurant conserve
  entre 90,1 % et 93,1 % selon le plan; TOK reçoit le reste de la commission.
- Les coûts Stripe/Connect du marketplace sont supportés par la part TOK, jamais
  ajoutés à la part restaurant.
- Un tarif réduit est appliqué seulement si l'abonnement est `active` ou
  `trialing` et si sa période payée n'est pas expirée. Sinon le moteur revient
  au tarif Starter de 9,9 %.
- La TVA des prestations TOK est snapshotée et ventilée. Le taux normal suisse
  de 8,1 % et le taux réduit de 2,6 % restent distincts.

## Comparaison sur 50 restaurants

Hypothèses mensuelles explicites :

- 50 restaurants indépendants, un abonnement chacun;
- 200 réservations honorées par restaurant;
- 200 commandes marketplace par restaurant;
- panier moyen de CHF 40, soit CHF 400'000 de GMV marketplace total;
- ni pourboire, ni livraison, ni TVA, ni frais Stripe ajouté à la facture
  restaurant.

Le modèle de référence utilise CHF 5 par réservation et 10,0 % par commande sans
différenciation de commission selon le plan. **Le forfait étant désormais
identique des deux côtés, l'écart ne tient plus qu'à la commission
marketplace.**

| Formule comparable | Référence par restaurant / mois | TOK par restaurant / mois | Référence pour 50 / mois | TOK pour 50 / mois | Économie pour 50 / mois | Économie pour 50 / an |
|---|---:|---:|---:|---:|---:|---:|
| Starter | CHF 1'869 | CHF 1'861 | CHF 93'450 | CHF 93'050 | CHF 400 | CHF 4'800 |
| Business | CHF 1'929 | CHF 1'841 | CHF 96'450 | CHF 92'050 | CHF 4'400 | CHF 52'800 |
| Premium | CHF 1'999 | CHF 1'831 | CHF 99'950 | CHF 91'550 | CHF 8'400 | CHF 100'800 |
| Elite | CHF 2'299 | CHF 2'051 | CHF 114'950 | CHF 102'550 | CHF 12'400 | CHF 148'800 |

## Répartition contractuelle

- Réservation honorée : 90 % TOK, 10 % développeur.
- Commande : 1 % de la base commissionnable au développeur, la commission
  restante à TOK, tout le solde au restaurant.
- Abonnements et publicité : 10 % du revenu TOK réellement encaissé, net de TVA,
  remboursements, pourboires, livraison et coûts refacturés, au développeur.

## Journaux comptables

Deux registres immuables coexistent, et cette dualité est volontaire :

- `reservation_fee_charges` porte l'historique facturé sous le modèle à
  pourcentage. Ses contraintes `CHECK` garantissent la source marketplace et
  l'égalité `fee = LEAST(forfait, plafond)`. **Plus rien n'y est écrit** ;
  l'affaiblir pour y loger un forfait aurait perdu ces garanties.
- `reservation_flat_fee_charges` reçoit les forfaits, avec un `CHECK
  (fee_cents = 500)` qui fige le montant.

Les deux alimentent `billing_fee_chf`, seule colonne que lit la facturation.

## Dépendances et lancement

- Les abonnements et les paiements avec capture différée utilisent la carte.
- TWINT est prioritaire uniquement pour les paiements ponctuels CHF compatibles
  avec Stripe Checkout. Stripe ne prend pas en charge TWINT en mode abonnement
  ni la capture manuelle.
- Le RPC `record_stripe_connect_fee_ledger` fournit une ingestion idempotente
  prête pour les transactions de solde Connect. Aucun événement Stripe
  `payout.*` ou `balance.*` n'est encore traité par le webhook applicatif : ces
  frais ne sont donc pas observés automatiquement tant que ce branchement et sa
  réconciliation ne sont pas déployés.
- Le rattachement opérationnel des établissements Elite et la facturation
  automatique des sites supplémentaires nécessitent un registre de groupe
  vérifié; le tarif est contractuel et snapshoté, mais ne doit pas être débité
  avant ce rattachement.

Références : [Stripe Suisse](https://stripe.com/ch/pricing),
[Stripe Connect Suisse](https://stripe.com/ch/connect/pricing),
[Stripe TWINT](https://docs.stripe.com/payments/twint/accept-a-payment),
[Administration fédérale des contributions](https://www.estv.admin.ch/estv/fr/accueil/taxe-sur-la-valeur-ajoutee.html).
