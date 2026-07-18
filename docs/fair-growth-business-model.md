# Fair Growth — modèle économique et hypothèses

Version tarifaire : `fair_growth_2026_07`.

## Grille restaurateur

| Offre | Abonnement mensuel | Réservation acquise par TOK et honorée | Commande marketplace | Établissements inclus |
|---|---:|---:|---:|---:|
| Starter | CHF 69 | CHF 5.00 | 9,9 % | 1 |
| Business | CHF 129 | CHF 4.50 | 8,9 % | 1 |
| Premium | CHF 199 | CHF 4.00 | 7,9 % | 1 |
| Elite | CHF 499 | CHF 3.00 | 6,9 % | 3 |

Elite prévoit CHF 149 par établissement supplémentaire. L’annuel fournit douze
mois de service au prix de onze mensualités. Son activation reste protégée par le
flag `billing-fair-growth-annual` jusqu’à validation Stripe en environnement de
test.

## Règles favorables aux restaurants

- Les réservations issues du site du restaurant, de ses QR codes signés,
  d’Instagram, de Google ou de son fichier client sont gratuites.
- Une réservation TOK est facturée uniquement après clôture du service comme
  honoré. Annulation, no-show, remboursement et démonstration ne sont pas facturés.
- Le frais est plafonné à 7 % du chiffre d’affaires réellement attribué à la table.
- Le restaurant reçoit 100 % des pourboires.
- La commission d’une commande ne porte ni sur le pourboire ni sur la livraison.
  Le développeur reçoit 1 % de la base commissionnable; le restaurant conserve
  entre 90,1 % et 93,1 % selon le plan; TOK reçoit le reste de la commission.
- Les coûts Stripe/Connect du marketplace sont supportés par la part TOK, jamais
  ajoutés à la part restaurant.
- Un tarif réduit est appliqué seulement si l’abonnement est `active` ou
  `trialing` et si sa période payée n’est pas expirée. Sinon le moteur revient
  au tarif Starter de 9,9 %.
- La TVA des prestations TOK est snapshotée et ventilée. Le taux normal suisse
  de 8,1 % et le taux réduit de 2,6 % restent distincts.

## Comparaison sur 50 restaurants

Hypothèses mensuelles explicites :

- 50 restaurants indépendants, un abonnement chacun;
- 200 réservations par restaurant, toutes acquises par TOK, honorées et non
  limitées par le plafond de 7 % — c’est donc une hypothèse de facturation haute;
- 200 commandes marketplace par restaurant;
- panier moyen de CHF 40, soit CHF 400’000 de GMV marketplace total;
- aucun module optionnel, pourboire, livraison, TVA ou frais Stripe ajouté à la
  facture restaurant.

Le modèle technique antérieur utilise CHF 5 par réservation et 10,0 % par
commande sans différenciation de commission selon le plan. Les abonnements
mensuels sont Starter CHF 69, Pro CHF 129, Premium CHF 199 et Elite CHF 499.
Fair Growth renomme publiquement Pro en Business. Même Starter économise 0,1
point de commission marketplace, soit CHF 8 par restaurant dans cette hypothèse.

| Formule comparable | Actuel par restaurant / mois | Fair Growth par restaurant / mois | Actuel pour 50 / mois | Fair Growth pour 50 / mois | Économie pour 50 / mois | Économie pour 50 / an |
|---|---:|---:|---:|---:|---:|---:|
| Starter | CHF 1’869 | CHF 1’861 | CHF 93’450 | CHF 93’050 | CHF 400 | CHF 4’800 |
| Business (Pro actuel) | CHF 1’929 | CHF 1’741 | CHF 96’450 | CHF 87’050 | CHF 9’400 | CHF 112’800 |
| Premium | CHF 1’999 | CHF 1’631 | CHF 99’950 | CHF 81’550 | CHF 18’400 | CHF 220’800 |
| Elite | CHF 2’299 | CHF 1’651 | CHF 114’950 | CHF 82’550 | CHF 32’400 | CHF 388’800 |

Dès qu’une partie des 10’000 réservations mensuelles provient d’un canal direct
gratuit, Fair Growth coûte encore moins aux restaurants. À titre d’exemple, 50 %
de réservations directes retirent CHF 25’000 de frais Starter sur l’ensemble du
parc par rapport à l’hypothèse haute.

## Modules payants

| Module | Prix | État de commercialisation dans l’application |
|---|---:|---|
| No-Show Shield | CHF 39/mois | Demande d’activation contrôlée |
| Marketing Autopilot IA | CHF 79/mois | Demande d’activation contrôlée |
| Margin & Waste Pilot | CHF 59/mois | Demande d’activation contrôlée |
| Réceptionniste téléphonique IA | CHF 49 + CHF 1.50/réservation réussie | Pilote; fournisseur téléphonique requis |
| Direct Order Saver | CHF 149 + 1,5 % | Pilote; routage et mesure à valider avant débit |
| Réputation IA | CHF 29/mois | Demande d’activation contrôlée |
| Cartes-cadeaux et expériences | 3 % + coût de paiement | Pilote; flux cadeau et conformité à valider |

Une demande depuis le dashboard n’effectue aucun débit. L’activation, le snapshot
tarifaire, la mesure de valeur et le crédit éventuel doivent être validés avant
facturation. Les espaces Démo ne peuvent jamais créer une demande payante.

La garantie de valeur est évaluée pendant 90 jours : si la valeur mesurée reste
inférieure à trois fois le coût, TOK recommande la désactivation ou traite un
crédit. Cette garantie doit rester fondée sur des événements mesurables et
auditables, pas sur une promesse marketing non vérifiée.

## Direct Order Saver

Face au taux Starter, le seuil purement mathématique est :

`CHF 149 / (9,9 % - 1,5 %) = CHF 1’773.81` de commandes directes mensuelles.

Le seuil prudent affiché est CHF 3’100 à CHF 3’200 lorsqu’on intègre un panier
proche de CHF 40 et les coûts d’encaissement du canal direct. Le simulateur doit
toujours afficher ses hypothèses.

## Répartition contractuelle

- Réservation acquise : 90 % TOK, 10 % développeur.
- Commande : 1 % de la base commissionnable au développeur, la commission
  Fair Growth restante à TOK, tout le solde au restaurant.
- Abonnements, publicité et modules : 10 % du revenu TOK réellement encaissé,
  net de TVA, remboursements, pourboires, livraison et coûts refacturés, au
  développeur.

## Dépendances et lancement

- Les abonnements et les paiements avec capture différée utilisent la carte.
- TWINT est prioritaire uniquement pour les paiements ponctuels CHF compatibles
  avec Stripe Checkout. Stripe ne prend pas en charge TWINT en mode abonnement
  ni la capture manuelle.
- Les modules dépendant de téléphonie, cartes-cadeaux ou routage direct restent
  en pilote tant que le fournisseur, les webhooks, la réconciliation et les
  parcours de remboursement ne sont pas validés.
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
