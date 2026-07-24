# Contrat partenaire TOK Connect / API

Version 1.0 — 24 juillet 2026

## Accès
L’accès production est réservé aux partenaires approuvés. Les clients OAuth, scopes, quotas, restaurants autorisés, environnements et webhooks sont définis dans un bon d’intégration. Le sandbox ne doit jamais être présenté comme une confirmation de production.

## Sécurité
Le partenaire protège secrets, tokens, certificats, clés d’idempotence et endpoints. Il applique chiffrement, moindre privilège, rotation, journalisation, gestion des vulnérabilités et notification immédiate des incidents. Les webhooks doivent être vérifiés par signature et horodatage. Les secrets ne peuvent être placés dans un client public.

## Usage autorisé
Les données et endpoints sont utilisés uniquement pour les finalités, utilisateurs, restaurants et durées autorisés. Sont interdits: revente de données, profilage non autorisé, scraping massif, contournement de quotas, création de réservations sans mandat, décisions commerciales autonomes non validées et tentative d’accès à un autre tenant.

## Données
Les parties documentent leur rôle de responsable ou sous-traitant, les catégories de données, sous-traitants ultérieurs, pays, durées, mesures techniques et assistance aux droits des personnes. Les données sont supprimées ou anonymisées à la fin du besoin ou du contrat, sous réserve des obligations légales.

## Disponibilité et changements
TOK peut versionner, déprécier ou suspendre une API pour sécurité, conformité ou maintenance. Sauf urgence, un préavis raisonnable est fourni pour les changements incompatibles. Aucun SLA ne s’applique sans annexe signée.

## Audit et incident
TOK peut demander des preuves de conformité et auditer raisonnablement l’intégration. Le partenaire notifie immédiatement toute fuite, compromission, usage excessif, accès indu ou vulnérabilité. TOK peut révoquer un secret ou suspendre un client sans préavis en cas de risque.

## Propriété
Chaque partie conserve ses technologies, marques et données. Aucun reverse engineering, extraction substantielle, entraînement de modèle ou création de service concurrent à partir des données TOK n’est autorisé sans accord écrit.

## Responsabilité et fin
Chaque partie répond de son environnement et de ses violations. À la fin, les accès sont révoqués, secrets détruits et données restituées ou supprimées. Droit suisse, for Genève sous réserve du droit impératif.
