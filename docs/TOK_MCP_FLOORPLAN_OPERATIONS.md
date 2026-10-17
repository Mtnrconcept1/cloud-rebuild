# MCP — plan de salle restaurateur

Ce lot ajoute sept intentions aux outils de rôle existants. Les mutations exigent
`confirmed_by_user=true`, une clé d'idempotence et un motif de 6 à 1000 caractères.
L'appelant utilise son JWT utilisateur : rôle restaurateur, propriété du restaurant,
activation MCP et appartenance de la succursale sont vérifiés côté serveur. Un rôle
administrateur supplémentaire n'accorde aucun accès à un autre propriétaire.

| Outil | Contrat natif |
| --- | --- |
| `tok_get_restaurant_floor_plan` | Lecture RLS des tables, positions datées, réservations de la date et affectations de la page |
| `tok_add_table_restaurant_floor_plan` | `restaurant_save_floor_plan_template` : une création |
| `tok_save_table_restaurant_floor_plan` | Même RPC : une modification avec conservation des champs absents |
| `tok_delete_table_restaurant_floor_plan` | Même RPC : une suppression |
| `tok_set_layout_restaurant_floor_plan` | `restaurant_save_floor_plan_layouts` : position datée ou suppression de la surcharge |
| `tok_assign_reservation_restaurant_floor_plan` | `restaurant_save_floor_plan_assignments` : un placement, déplacement ou retrait |
| `tok_set_preferred_table_restaurant_floor_plan` | `restaurant_set_preferred_table`, client résolu depuis une réservation du restaurant |

Les RPC existants gardent leurs transactions, autorisations de branche, audit et
contraintes de capacité, occupation et conflit. Aucune modification directe de
table, siège, réservation ou paiement ne remplace un refus natif. Les références
d'un autre restaurant ou d'une autre succursale sont refusées avant le RPC.
Les réservations terminales ne sont pas réaffectées par ces outils.

La lecture utilise `limit` (1–50) et `offset` pour chaque collection séparément.
Les affectations couvrent seulement la page de réservations retournée, et non
toute la journée. Elle ne retourne ni profil ni coordonnées du client.

La table attitrée ne déplace aucune réservation existante. Le RPC natif audite
la modification ; le motif fourni est aussi conservé par l'audit du bridge MCP.

## Limites

La couverture reste partielle : échanges atomiques entre plusieurs réservations,
objets décoratifs, génération IA, accès par délégation aux employés et clôture
facturable ne sont pas exposés. Les écritures suivent le modèle natif : aucune
nouvelle garantie de comparaison de version entre deux éditeurs simultanés n'est
ajoutée. La lecture et la modification de champs conservés ne constituent pas une
transaction SQL unique ; les gardes métier restent exécutées dans le RPC natif.

Le lot ne contient aucune migration ni mutation distante. Ses tests couvrent le
routage réel et les contrats des RPC avec une frontière de base simulée. Ils ne
remplacent pas un test de concurrence du SQL natif ni une recette en production.
