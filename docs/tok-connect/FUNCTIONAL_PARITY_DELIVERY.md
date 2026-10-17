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
