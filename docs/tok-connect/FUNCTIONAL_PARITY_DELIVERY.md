# Livraison de la parité fonctionnelle TOK Connect

## Contrat et ordre de livraison

Branche dédiée `codex/tok-mcp-functional-parity-20261017`, basée sur
`5cfea4697872fac381556ab8405d934290eb7505`. Risque niveau 3. Architecture
existante conservée : widget interactif et outils découplés derrière `/mcp`,
OAuth Supabase, JWT utilisateur et services métier TOK natifs.

1. Préparer une réservation avec restaurant, date, heure et nombre exact de
   convives ; demander toute information manquante, ouvrir le widget prérempli.
2. Rendre les actions client sélectionnables par ChatGPT ; exécuter seulement
   l'intention explicite, avec une clé stable et un résultat métier durable.
3. Retourner le statut réel, puis notifier chaque transition par le circuit
   natif commun aux espaces client/restaurateur et au MCP.
4. Publier des outils de gestion ciblés, avec contrôles de propriété et de rôle,
   et un catalogue qui distingue les fonctions exécutables des fonctions internes.
5. Préparer la diffusion, la recette ChatGPT avec CSP active et le suivi des
   erreurs OAuth, sans annoncer une publication avant sa validation externe.

## Fichiers et frontières

- `tok-connect-remote-mcp` : contrats publics, visibilité, routage et résultats.
- `tok-connect-mcp`, helpers de réservation et widget : préparation et rendu.
- `tok-connect-app-bridge`, helper d'opérations : droits, services natifs et audit.
- `create-reservation`, emails et nouvelles migrations : idempotence, statuts,
  outbox et reprise ; aucune migration historique modifiée.
- Tests comportementaux, protocole, migrations, refus d'accès, docs de recette
  et package de diffusion sans secrets.

## Validations requises

Préremplissage pour 1, 5 et 7 convives ; heure manquante/indisponible ; statut
pending puis acceptation/refus/annulation ; rejeu et conflit de clé ; mauvais
client/restaurateur ; envoi différé et déduplication des notifications.
Tests ciblés puis lint, typecheck, suite et build ; replay SQL et vérification
des grants/RLS ; CI ou alternatives locales si indisponible ; déploiement normal
puis smoke public, connexion ChatGPT et vérification des effets natifs accessibles.

Une commande payante requiert Stripe Test et son webhook signé. Un email `sent`
ne prouve pas sa livraison. La publication annuaire dépend de l'identité vérifiée,
du compte de revue et de l'approbation de la plateforme. Ces états doivent rester
distincts dans le bilan.

## Retour arrière

Revenir au code/catalogue précédent par PR et déploiement normal. Conserver les
réservations, commandes, traces d'idempotence et intentions de notification.
Pour SQL, préférer une migration compensatrice compatible ; ne pas supprimer
les données ni réécrire l'historique.

## État de validation avant PR

Les 21 fichiers de tests ajoutés ou modifiés passent : 194 tests. Le build Vite
passe avec les variables publiques factices de compilation utilisées en CI ;
cela ne constitue pas une validation de configuration production. Les six points
d'entrée Edge modifiés passent `deno check` avec leurs dépendances directes.
Les tests Bash de déploiement passent sous Git Bash (4 tests). L'index est
régénéré et son contrôle déterministe passe. La suite complète a été interrompue
sur Windows ; ses premiers échecs Bash/index sont traités par ces relances.

Les migrations ont été rejouées sur PostgreSQL temporaire, avec concurrence,
reprise et contrôle des grants. Les services natifs de capacité et de pricing
utilisent des fixtures dans ces runners : ce résultat ne remplace pas une
réservation authentifiée en production. Les revues indépendantes SQL, OAuth,
reprise et destination de livraison n'identifient aucun P0/P1 restant.

Le géocodage de livraison est effectué côté serveur avant création de commande
ou checkout. Le fournisseur Photon déjà utilisé par TOK doit retourner une adresse
précise en Suisse ; erreur ou ambiguïté bloque le parcours. Les coordonnées
vérifiées sont transmises au dispatch natif. Le dispatch après paiement Stripe
Test reste à vérifier de bout en bout.

## Limites et recette restante

Le déploiement, la recette ChatGPT avec CSP active, l'acceptation par le propriétaire
de La Gazelle d'Or et les notifications de cette nouvelle transition restent à
observer après merge. L'utilisateur a autorisé la connexion propriétaire et une
réservation de deux personnes le 18 octobre 2026 à 19 h, à annuler après le test.
La réservation de recette précédente a déjà été annulée ; ses deux emails de
création ont été observés `delivered` auprès du fournisseur.

Les outils ciblés ne couvrent pas encore toutes les interfaces TOK : édition
graphique/affectation du plan de salle, replanification complète, médias,
publication sociale et marketing payant, RH avancées et contrats multi-groupes
Golden TOK restent des parcours à spécifier, implémenter et tester. Le catalogue
doit indiquer ces limites ; ne pas annoncer une parité intégrale.

Le brouillon public est ciblé sur la Suisse et Raphaël Barman. Il manque encore
une démonstration enregistrée, des comptes de revue dédiés et la validation du
portail avant soumission. La disponibilité d'un connecteur Stripe Test ne prouve
pas que le backend de production peut exécuter une commande isolée en mode test.

## Références utilisées

- https://developers.openai.com/plugins/reference
- https://developers.openai.com/plugins/plan/tools
- https://developers.openai.com/plugins/build/mcp-server
- https://developers.openai.com/plugins/build/chatgpt-ui
- https://developers.openai.com/plugins/deploy/submission

## Recette production du 17 octobre 2026

Le lot initial est fusionné par PR #877 (`eee311a6c6a62739c17603faae9bc1da65f49029`). La CI complète a validé 632 fichiers de tests et le pipeline normal a déployé frontend et Supabase. Les quatre migrations sont présentes ; les six smokes publics passent avec 96 outils.

Le propriétaire connecté a choisi Les Brasseurs pour la recette. Avec son accord explicite, réservation publique et rôle client ont été activés temporairement. Dans ChatGPT, CSP active : création de RES-A69ZM1 (18 octobre, 19 h Europe/Zurich, deux convives), acceptation propriétaire, puis annulation client par les outils MCP. Les statuts natifs `pending`, `confirmed`, `cancelled` ont été relus. Le dashboard restaurateur affichait la confirmation. Les six emails des trois transitions sont `delivered` chez Resend ; les notifications en application existent pour les deux rôles. Les deux rôles utilisaient le même compte : deux boîtes distinctes ne sont pas démontrées.

Après annulation, la réservation publique est de nouveau désactivée et seul le rôle client temporaire a été supprimé. Le rôle restaurateur et l'opt-in MCP sont conservés. La réservation annulée reste dans l'historique.

## Lot offres et correctifs widget

Branche dédiée `codex/tok-mcp-special-offers-20261017`, basée sur le merge précédent. Le périmètre ajoute consultation/création/activation/archivage anti-gaspi et flash via les RPC natifs audités ; côté client, découverte, sélection et devis/checkout avec prix et stock serveur. L'édition complète d'une offre reste hors contrat. Fenêtres calendaires en Europe/Zurich ; ni stock garanti par le devis ni livraison anti-gaspi.

Le stock débité par la création native est prouvé dans un ledger service-only avec RLS. Restitution et marqueur sont atomiques ; une capture tardive reprend le stock sous verrou ou reste en réconciliation explicite si celui-ci a été revendu. Aucune provenance historique n'est inventée depuis les métadonnées client. Exécuter `scripts/sql/tok-special-offer-legacy-preflight.sql` immédiatement avant rollout : toute commande historique impayée sans preuve doit être traitée explicitement et bloque le rollout automatique.

Le repricing checkout crédite uniquement le ledger non restauré de la commande, du compte, du restaurant, de la tentative et des quantités exactes. Cela évite le refus des derniers exemplaires déjà réservés. Les tests exécutent le vrai handler et le vrai pricing jusqu'à la frontière prestataire ; ils ne constituent pas une transaction Stripe Test réelle.

Le widget refuse clairement les restaurants non réservables, explique le rôle client requis et rend l'historique fourni à l'outil avec ses statuts. Il ne déclenche aucune mutation supplémentaire pour cet affichage.

La branche Supabase Test payante a été supprimée après son arrêt sur une migration historique manquante. Les migrations ultérieures contiennent des appels HTTP de production ; leur replay automatique reste bloqué sans quarantaine démontrée. Aucun webhook Test n'a été créé et aucun paiement Stripe Test de bout en bout n'est encore validé. Le code d'isolation reste un lot Draft séparé, non déployé.
