# Attribution coursier atomique

Risque de niveau 3 : commandes, affectation, notifications et permissions SQL.

Le rejeu PostgreSQL isolé 38084343466 reproduit trois défauts du protocole initial : deux acceptations pour une mission, deux créations pour une commande, et une expiration fondée sur une lecture ancienne qui écrase une acceptation. Ce succès atteste la reproduction, pas le correctif.

## Contrat proposé

La migration 20261010223000 ajoute des transactions réservées au service pour créer une mission, proposer des offres, accepter/refuser et expirer une offre. Les contraintes garantissent une seule mission active par commande, une seule mission affectée active par coursier et une acceptation par mission. Un historique incohérent fait échouer la migration ; aucune ligne historique n'est supprimée ni choisie automatiquement.

L'acceptation verrouille dans l'ordre commande, mission, coursier, offre. Le délai est évalué après l'attente des verrous. La réponse répétée du même coursier est idempotente. Mission, offres concurrentes, commande, suivi et notifications sont enregistrés dans la même transaction. Les workers de notifications existants restent responsables de l'envoi et des reprises. L'expiration revalide l'état et applique une seule pénalité. Les nouvelles recherches et les alertes tardives ne réinitialisent plus une affectation acquise.

Les lectures navigateur conservent leurs policies. Les écritures directes des rôles clients sur missions/offres sont retirées : les interfaces existantes écrivent via les fonctions Edge authentifiées. Les cinq nouvelles RPC vérifient le rôle service et ne sont pas exécutables par anon/authenticated.

Fichiers fonctionnels : migration, `courier-portal`, `dispatch-order`, `dispatch-timeout`, `restaurant-order-status`. Le test de frontière client est adapté au nouveau point d'écriture. Les fichiers de workflow, fixtures et runner servent uniquement à la preuve isolée.

## Validation exigée

- Rejeu de main et migration candidate dans PostgreSQL 17 isolé, réseau sortant réellement refusé.
- Reproduction initiale des trois courses, refus de migration sur l'historique synthétique incohérent, réapplication et conservation de l'historique résolu.
- Rôles réels : RPC et DML clients refusés ; service autorisé.
- Créateurs et diffuseurs simultanés, deux coursiers pour une mission et un coursier pour deux missions ; attente des verrous observée dans PostgreSQL.
- Notifications enregistrées une fois, reprise après réponse perdue, annulation intégrale sur panne de persistance des notifications.
- Expiration concurrente et tardive, délai serveur, refus/rejeu, absence de régression après acceptation.
- Tests applicatifs ciblés, lint, typage, build et contrôle CI du candidat exact avant fusion.

La base de production contenait zéro mission et zéro offre au contrôle préalable du 10 octobre 2026 ; cette observation doit être refaite avant déploiement. Elle ne signifie pas que la livraison est désactivée.

## Livraison et reprise

Recontrôler l'historique SQL et les éventuels doublons actifs. Appliquer la migration avant les quatre fonctions Edge, puis confirmer leur source déployée et les ACL. Ne pas injecter les fixtures en production. Si des missions apparaissent avant ce changement, préparer une fenêtre contrôlée pour éviter l'exécution du protocole ancien pendant la transition SQL/serveur.

En cas de défaut, conserver les contraintes et la restriction d'écriture, diagnostiquer les transactions refusées et livrer une migration/fonction compensatrice. Un retour à l'ancien protocole multi-écritures ne constitue pas une reprise sûre.

Cette correction ne certifie pas encore les étapes de retrait/remise, la caméra et la signature sur appareil réel, les paiements coursier, ni l'envoi réel des notifications. Les notifications de proposition restent émises après la création atomique des offres ; une panne du fournisseur peut retarder leur réception, et le mécanisme existant d'expiration relance la recherche.
