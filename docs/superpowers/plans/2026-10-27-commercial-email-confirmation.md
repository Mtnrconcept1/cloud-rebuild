# Consentement signé immédiat et confirmation e-mail complémentaire

> Exécution : superpowers:executing-plans ; revue et vérification avant publication.

**Objectif :** la signature personnelle avec accord explicite autorise les campagnes e-mail prévues par le texte. JE CONSENS dans le parcours reçu par e-mail ajoute une deuxième preuve et un accusé de double confirmation, sans être un prérequis.

**Architecture :** le RPC existant conserve une preuve de signature immuable et met en file le premier message signé. `commercial_email_confirmations` conserve la preuve de boîte distincte. Un accusé privé unique par reçu est créé dans la même transaction que la confirmation, puis traité par le worker `send-email` existant, avec la même infrastructure de baux et de relances bornées. Aucun nouveau cron ou prestataire.

**Technologies :** React/Vite/TypeScript, Supabase/PostgreSQL, Edge Deno, Resend. Dépendances et secrets inchangés.

**Spécification :** demande du 27 octobre 2026 à 23:35 UTC, qui remplace la demande précédente de confirmation obligatoire. Bouton JE CONSENS, texte et signature dans les deux messages ; pas de troisième confirmation.

## Contraintes et risques

Niveau 3 : données privées, preuves et autorisation de prospection. Case explicitement cochée et signature personnelle toujours nécessaires. Le commercial reste collecteur, pas signataire. Signature simple et accès au lien de boîte ne certifient ni identité civile ni pouvoirs du représentant.

- La signature donne `lawful_basis=consent`, source et date de signature ; `email_verified` reste false avant le clic de boîte.
- La confirmation ajoute `confirmed_at` et un journal distinct sans réécrire le reçu, la source ou la date initiale.
- Expiration du lien complémentaire et échec de livraison ne révoquent pas le consentement signé.
- Retrait, opposition, suppression, destinataire modifié, préférences et autres règles marketing restent prioritaires. Aucun ancien lien ne lève une opposition. Aucun droit push/appel acquis.
- Lecture/GET/aperçu ne confirment rien. Le bouton d’e-mail ouvre le reçu ; seule l’action explicite JE CONSENS de cette page confirme.
- Pas de signature hébergée publiquement ; PNG CID dans le mail. Jeton HMAC dérivé du premier identifiant de file ; seule son empreinte dans la table de confirmation.
- Accusé final unique par reçu. Concurrence protégée par verrou contact, confirmation, accusé puis file. Pas d’appel fournisseur dans une transaction.
- Relances des deux messages : maximum 5 tentatives, arrêt avant la fin des 24 heures d’idempotence fournisseur (23 heures), baux de deux minutes et empreinte du payload constante.
- État « accepté par le fournisseur » distinct de « reçu en boîte ».

## Audit et périmètre

GitHub, Supabase, Vercel et Resend vérifiés. Base de PR #993 : `52d9274831386997facc1e5870b0d036ce9bd05a`, arbre `61349ac625e1bf80ac69fe3f8b83ccca3f43295c`. `main` reste `c8b99a99`. Restauration exacte des objets depuis les archives précédentes et contrôle des empreintes ; worktree dédié réel, propre avant modification. Accès Git réseau direct indisponible, publication par le connecteur.

La migration `20261027221840_commercial_email_confirmation.sql` n’est pas appliquée en production (contrôle en lecture seule) ; seule cette migration de travail est révisée. Aucune migration historique modifiée. L’identité du responsable reste non configurée et aucune signature réelle n’était présente au contrôle. Aucune écriture de production ni aucun e-mail réel de test.

Fichiers touchés : la migration en attente, son test SQL, le runner PostgreSQL, le helper Edge existant, le validateur et le dialogue commercial, les fichiers HTML/JS de confirmation, trois tests correspondants et les références canoniques. Le worker existant est réutilisé sans changer son ordonnanceur ni les paramètres de production.

## Exécution et vérifications

- [x] Base : 31 tests ciblés réussis avant modifications.
- [x] Nouveaux scénarios UI/mail observés rouges (6 échecs), puis verts après implémentation.
- [x] Signature active avant clic, vérification boîte séparée, message final avec les deux dates et lien initial testé.
- [ ] PostgreSQL isolé : permissions, transitions, suppression, concurrence, unicité de l’accusé, récupération et limite de relance.
- [ ] Typecheck/lint/build, suite CI complète et références canoniques sur le commit final.

Le test navigateur simulé ne prouve pas la réception ni le rendu réel du PNG CID dans les messageries. Une signature et une confirmation réelles ne seront pas fabriquées pendant les tests.

## Livraison et retour arrière

Publication uniquement sur la branche de #993 ; aucun merge ou déploiement demandé dans cette modification. Les migrations et fonctions seront livrées avant le frontend par le workflow officiel après autorisation de fusion.

Avant livraison : revert des seuls fichiers de cette révision. Après livraison : suspendre le parcours ou le worker concerné sans supprimer preuves, consentements, confirmations ou oppositions. Ne pas convertir `consent_pending` en `queued` pour l’ancien worker. Ne jamais présenter comme confirmée une adresse non confirmée.

Sources techniques vérifiées : documentation officielle Resend des clés d’idempotence et images CID ; Supabase fonctions PostgreSQL et changelog. Aucune nouvelle dépendance.
