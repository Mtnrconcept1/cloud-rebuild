# TOK Notifications Skill

À utiliser pour toute modification liée aux emails, SMS, push notifications, notifications client, notifications restaurant, notifications admin, files d’attente ou dispatch notificationnel.

## Objectif

Garantir qu’une commande ou réservation critique ne soit jamais invisible pour le client, le restaurant ou l’admin TOK.

## Règles obligatoires

1. Une commande payée doit notifier le restaurant.
2. Une commande acceptée, refusée, annulée ou prête doit notifier le client.
3. Une réservation créée, confirmée, modifiée ou annulée doit notifier les parties concernées.
4. Toute notification importante doit être journalisée.
5. Une notification échouée doit pouvoir être retentée.
6. Les notifications critiques doivent avoir un fallback raisonnable.
7. Le restaurant doit avoir une alerte visible pour une nouvelle commande.
8. Le restaurant doit idéalement avoir une alerte sonore pour une nouvelle commande urgente.
9. Le système doit savoir si une commande a été vue par le restaurant.
10. L’envoi d’une notification ne doit pas bloquer la création de commande, le paiement ou le webhook.
11. Les notifications admin critiques doivent signaler les commandes bloquées, paiements suspects et incidents support.

## Patterns recommandés

- Enregistrer une notification en base.
- Déclencher l’envoi de façon asynchrone.
- Journaliser succès/échec.
- Prévoir retry ou relance manuelle.
- Ne pas dépendre uniquement d’un canal unique pour les événements critiques.

## Avant de finaliser

- Vérifier l’enqueue de notification.
- Vérifier le retry ou fallback.
- Vérifier les logs.
- Vérifier les droits d’accès aux notifications.
- Vérifier les statuts “vu”, “envoyé”, “échoué” si présents.
- Ajouter ou mettre à jour un test si la modification touche une notification critique.
