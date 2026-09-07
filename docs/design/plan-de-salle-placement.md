# Plan de salle — placement des réservations

Comment une réservation trouve sa table : automatiquement à la création, en un
clic pour tout un service, ou à la main par glisser-déposer.

## Le principe

Le restaurateur ne doit rien avoir à paramétrer pour que ça marche. Il n'y a
donc **aucun réglage à activer** : le comportement découle des données déjà
présentes (les tables de la salle, et éventuellement une table attitrée).

Trois chemins mènent au même résultat, du plus automatique au plus manuel :

| Chemin | Quand | Qui décide |
| --- | --- | --- |
| Placement à la création | À chaque nouvelle réservation | Le serveur (trigger) |
| Bouton « Placer automatiquement » | Quand le restaurateur le demande | Le client, revalidé serveur |
| Glisser-déposer | À tout moment | Le restaurateur |

Aucun des trois n'écrase un placement existant sans geste explicite.

## 1. Placement à la création (serveur)

Un trigger `AFTER INSERT` sur `reservations` (`trg_reservations_autoassign_table`)
tente de poser la réservation sur une table. Le trigger est le seul point de
passage nécessaire : toute création de réservation, quel que soit le chemin
(fonction Edge `create-reservation`, Zéro Attente, table du chef, back-office),
le traverse.

Ordre de préférence :

1. **La table attitrée du client**, si elle est active, assez grande et libre
   sur le créneau.
2. **La plus petite table libre** qui accueille le groupe. Les grandes tables
   restent ainsi disponibles pour les grands groupes.

Une table attitrée à quelqu'un d'autre reste utilisable, mais passe en dernier :
la geler franchement stériliserait de la capacité les jours où son habitué ne
vient pas.

Si rien ne convient, la réservation est créée **sans table** et apparaît dans la
file « à placer ». Un échec de placement ne fait jamais échouer une
réservation — d'où le bloc d'exception dans le trigger.

### Ce que le trigger ne fait pas

Il n'écrit **pas** dans `public.reservations`. Plusieurs triggers `AFTER UPDATE`
de cette table ne filtrent aucune colonne (audit, notifications) : renseigner
`branch_id` depuis le trigger enverrait une notification et une ligne d'audit en
double à chaque réservation. `branch_id` est renseigné par
`restaurant_save_floor_plan_assignments` à la première sauvegarde, et le plan
lit les réservations par `restaurant_id` + date.

## 2. Placement en un clic (client)

Le bouton « Placer automatiquement » remplit toutes les réservations affichées
qui n'ont pas de table.

L'algorithme vit dans `planAutomaticPlacement` (`serviceShared.ts`), couvert par
`src/test/floor-plan-automatic-placement.test.ts`. Deux propriétés comptent :

- **Il est séquentiel.** `getRecommendedTableByReservation` évalue chaque
  réservation isolément, à carte figée : deux réservations peuvent recevoir la
  même recommandation. Le placement en masse tient donc à jour une carte de
  travail et retire chaque table posée du stock.
- **Il sert les grands groupes d'abord.** Les grandes tables sont la ressource
  rare. Traité dans l'ordre d'arrivée, un duo prendrait la table de 6 et le
  groupe de 6 resterait sans solution.

La table attitrée passe avant le score, comme côté serveur.

La persistance emprunte le chemin d'un placement manuel :
`restaurant_save_floor_plan_assignments` revalide capacité et chevauchements. Le
client propose, le serveur décide.

## 3. Tables attitrées

`restaurant_preferred_tables` associe un client à une table, une par restaurant
(`UNIQUE (restaurant_id, user_id)`).

L'attribution se crée depuis le geste naturel du service : quand un client est
posé sur une table, le tiroir de la réservation propose **« Toujours cette table
pour ce client »**. Pas de page ni de panneau dédié — l'habitude naît là où on
la constate. Une réservation dont le client a une table attitrée porte un badge
« Habitué ».

L'écriture passe exclusivement par `restaurant_set_preferred_table`
(SECURITY DEFINER, `auth_can_access_branch`, auditée). La table doit appartenir
à la salle et être active. Passer `p_table_id` à `NULL` retire l'attribution.

## Règles communes

Capacité et chevauchement suivent **une seule définition**, celle de
`restaurant_save_floor_plan_assignments` :

- `floor_plan_reservation_duration_minutes(metadata)` — durée d'occupation,
  120 min par défaut, 30 min minimum.
- `floor_plan_table_is_free(table, date, heure, durée, exclure)` — fenêtre de
  chevauchement et statuts libérés (`cancelled`, `canceled`, `no_show`,
  `completed`, `archived`).

Toute divergence entre ces règles ferait proposer des placements que la
sauvegarde refuserait ensuite.

## Origine d'une affectation

`reservation_slots.source` vaut `preferred`, `auto` ou `manual`.
`restaurant_save_floor_plan_assignments` réinsère les créneaux sans préciser la
colonne : un déplacement par le restaurateur repasse donc naturellement en
`manual`, ce qui est la bonne sémantique.

## Vérification

- `src/test/floor-plan-automatic-placement.test.ts` — l'algorithme glouton.
- `supabase/tests/floor_plan_autoplacement_smoke.sql` — le trigger et la RPC
  contre une base réelle (`supabase db reset --local` puis `psql -f`).

## Note d'exploitation

Le placement à la création s'applique à tous les restaurants qui ont des tables
dans leur plan, sans opt-in. Un restaurant sans plan de salle n'est pas affecté.
Pour revenir en arrière, il suffit de retirer le trigger :

```sql
DROP TRIGGER IF EXISTS trg_reservations_autoassign_table ON public.reservations;
```

Les affectations déjà posées sont conservées, et le bouton « Placer
automatiquement » comme le glisser-déposer continuent de fonctionner.
