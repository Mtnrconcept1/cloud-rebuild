# Implémentation du Module Comptabilité Administration (Réconciliation) & Facturation au Réel

Ce document retrace la création du tout nouveau module de rapprochement financier réservé à l'équipe cœur de TOK, ainsi que la refonte de l'interface restaurateur qui lie physiquement les commandes aux factures.

## Refonte de la Méthode de Facturation
Sur le Dashboard du Restaurateur (onglet Factures) :
1. **Montant Temporel Continu (Encours)** : Le restaurateur voit désormais en temps réel le "Montant à facturer", qui n'est plus forcé par un délai mensuel fixe. Ce montant représente la somme de toutes les réservations, commandes emporter/livraison et subventions Miamz réalisées **mais qui n'ont pas encore été collectées sur une facture**.
2. **Assignation Définitive** : Lorsqu'il clique sur "Générer la facture pour l'encours", le bouton n'est cliquable que s'il y a plus de 0 CHF. L'action assigne instantanément un `restaurant_invoice_id` à la base de données propre à **chaque commande ciblée**, évitant physiquement toute double-facturation dans le temps.
3. **Preuves Détaillées par Lignes** : L'Aperçu de la Facture (document PDF affiché à l'écran) a été enrichi. En dessous de la vue globale, un tableau détaillé répertorie l'intégralité des commandes spécifiques (Numéro de commande / flash, date individuelle) englobées par cette facture, affichant clairement d'où vient la somme TTC de manière granulaire.

---

## Ce qui a été mis en place côté Administration (Ancien point)

1. **Dashboard Outil Admin "Comptabilité"** :
   - Insertion d'une nouvelle page accessible pour les modérateurs/fondateurs depuis l'accueil (tuile "Comptabilité").
   - Ce module exploite le feature flag interne `admin-compta`.

2. **Interface de Rapprochement : `AdminCompta.tsx`** :
   - **Filtres Séparatifs** : Un sélecteur de Restaurant et un sélecteur de Période (affichage mensuel glissant). La vision mensuelle facilite les calculs de paies en fin de mois.
   - **Métriques Financières :** 
     - *CA Virtuel Brut* : La somme de l'argent réel injecté + l'apport de Miamz. 
     - *Commission TOK* : 10% de la somme brute retenue.
     - *Reversement Restos* : Les 90% obligatoires que le restaurateur devait facturer. Permet une comparaison stricte pour éviter l'erreur.
     - *Miamz Compensés* : Le montant total subventionné par TOK, permettant une trace budgétaire du programme.
   - **Historiques Dédiés** :
     - *Toutes les transactions* : Affichage de `Numéro/Date/Statut/Payé Carte/Part Miamz/Total`.
     - *Vue Filtrée Miamz* : Affichage centré uniquement sur les commandes bénéficiant de réductions Miamz pour un audit détaillé de la fidélité.
