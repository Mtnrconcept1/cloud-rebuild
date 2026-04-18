# Refonte de la Facturation avec Suivi des Commandes

Ce plan d'implémentation adapte le système pour que les factures de reversement 90% (générées par les restaurateurs) englobent *précisément* les commandes non facturées en temps réel, incluant le lien direct entre la facture et les éléments qu'elle couvre.

## User Review Required

> [!WARNING]  
> Ce changement implique de modifier les tables de votre base de données `orders` et `reservations` pour qu'elles se souviennent si elles ont déjà été facturées ou non. C'est le comportement attendu, mais je tiens à m'assurer de votre feu vert avant de modifier la structure SQL de la base de données de production.

## Proposed Changes

### 1. Structure de Base de Données (Migration SQL)

#### [NEW] Migration SQL : `link_orders_to_invoices`
- Ajout d'une colonne `restaurant_invoice_id` (Type UUID, référence `restaurant_invoices.id`) dans la table `orders`.
- Ajout de la même colonne `restaurant_invoice_id` dans la table `reservations`.

---

### 2. Procédure Stockée Backend (RPC)

#### [MODIFY] Fonction `generate_restaurant_payout_invoice`
- La requête ne filtrera plus aveuglément par les dates d'un mois civil (`period_start`, `period_end`), mais elle filtrera toutes les commandes/réservations où `restaurant_invoice_id IS NULL` et dont le statut est valide (livré, complété, etc).
- Elle créera une nouvelle ligne dans `restaurant_invoices`.
- **Nouveau comportement clé** : Elle lancera immédiatement un `UPDATE` sur les tables `orders` et `reservations` affectées pour leur injecter l'ID de la facture qui vient d'être générée. Ainsi, ces commandes ne pourront physiquement pas être re-facturées plus tard !
- Les métadonnées `period_start` et `period_end` de la facture deviendront la date de la plus ancienne commande et la date de la commande la plus récente intégrées dans la facture.

---

### 3. Interface Dashboard (Frontend)

#### [MODIFY] `src/pages/dashboard/DashboardFactures.tsx`
- **Encart "Montant non facturé"** : Ajout d'un encart en haut de page qui interroge et présente la somme de toutes les commandes/réservations en temps réel (qui n'ont pas encore d'ID de facture assigné).
- Cela montrera au restaurateur de manière claire pourquoi le bouton `Générer une facture` affiche le montant attendu.
- **Détail Facture** : Lorsqu'il cliquera sur "Voir" ou "Télécharger" (ou en déroulant l'accordéon), nous pourrons désormais faire une requête qui remonte toutes les commandes liées à cet ID de facture pour afficher le détail ligne-par-ligne garantissant la transparence des frais Tok / Miamz.

## Verification Plan

### Manual Verification
1. Lancer la migration SQL.
2. Créer une nouvelle commande "test" sur le simulateur.
3. Vérifier que la commande s'affiche comme "Montant non facturé" dans l'onglet Facture du restaurateur.
4. Clic sur `Générer facture reversement`.
5. Vérifier que l'encart "Montant non facturé" retombe à 0, et qu'une nouvelle ligne de facture réconciliée apparaît dans l'historique de la page en contenant les détails exacts de la commande envoyée.
