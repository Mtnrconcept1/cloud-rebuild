# TOK Restaurant Operations Skill

À utiliser pour toute modification liée aux commandes restaurant, réservations, horaires, capacité, stock, disponibilité, dashboard restaurateur, préparation, acceptation ou refus de commande.

## Objectif

Garantir qu’un restaurant puisse absorber les commandes et réservations reçues par TOK sans chaos opérationnel, sans surcharge cuisine et sans commandes impossibles à honorer.

## Règles obligatoires

1. Un restaurant doit pouvoir mettre les commandes en pause.
2. Un restaurant doit pouvoir indiquer qu’il est complet.
3. Un restaurant doit pouvoir fermer exceptionnellement.
4. Un produit épuisé ne doit plus être commandable.
5. Les horaires normaux et exceptionnels doivent être respectés.
6. Une commande doit être acceptée dans un délai limité.
7. Si le restaurant ne répond pas, le client doit avoir un statut clair.
8. Le temps de préparation doit pouvoir être ajusté.
9. La capacité par créneau doit être respectée.
10. Deux clients ne doivent pas pouvoir réserver la même capacité au même moment.
11. Le dashboard restaurant doit afficher clairement les commandes urgentes.
12. Les actions restaurant sensibles doivent être auditables ou historisées.

## États opérationnels à préserver

- restaurant ouvert
- restaurant fermé
- fermeture exceptionnelle
- commandes actives
- commandes en pause
- complet pour un créneau
- produit disponible
- produit épuisé
- commande en attente d’acceptation
- commande acceptée
- commande refusée
- commande expirée par timeout

## Avant de finaliser

- Tester restaurant ouvert et fermé.
- Tester fermeture exceptionnelle.
- Tester pause commandes.
- Tester produit disponible et épuisé.
- Tester acceptation et refus de commande.
- Tester timeout restaurant.
- Tester capacité réservation.
- Vérifier les notifications liées aux changements d’état.
