# Espace Comptabilité Administrateur

Ce plan d'implémentation décrit la création d'un outil de comptabilité côté Administration qui permet aux administrateurs de la franchise Tok de réconcilier les revenus bruts, la rétention des commissions (10%), et les paiements via Miamz. 

## Proposed Changes

### Configuration du Feature Flag et Navigation

#### [MODIFY] `src/lib/featureCatalog.ts`
- Ajout de la définition `admin-compta` au catalogue avec le groupe `admin_tools`.

#### [MODIFY] `src/App.tsx`
- Ajout d'une nouvelle route protégée `/admin/compta` vers le nouveau composant `AdminCompta`.

#### [MODIFY] `src/pages/admin/AdminHome.tsx`
- Ajout d'une carte d'accès avec l'icône appropriée (ex: `Calculator` ou `ReceiptEuro`) pour que les admins puissent trouver et cliquer sur l'espace de Comptabilité depuis leur accueil back-office.

---

### Création de la Vue Comptabilité

#### [NEW] `src/pages/admin/AdminCompta.tsx`
Ce composant agira comme le centre névralgique de rapprochement financier :
- **Sélecteur de Restaurants** : Une barre latérale ou un menu déroulant permettant de sélectionner un restaurant spécifique.
- **Requêtes de données (Tanstack Query)** : 
  - Requête vers la table `orders` pour récupérer toutes les transactions payées (ou délivrées) du restaurant ciblé.
- **Logique Financière Appliquée** :
  - **CA Total (Total des additions)** : Ce qui a été facturé aux clients.
  - **Part Payée en Miamz** : Extrait de `metadata->>'points_discount_amount'`.
  - **Revenu de Base** : Le total incluant les réductions Miamz compensées par Tok.
  - **Commission TOK (10%)** : Déduite du Revenu de Base.
  - **Montant à Reverser (90%)** : Montant finissant dans la facture réconciliée.
- **Interface Utilisateur (UI)** :
  - Utilisation de `Card` pour présenter le solde et les sous-totaux de manière très visible (ex: Gross Revenue, Commission Tok, Payout Restaurant, Miamz pris en charge).
  - Utilisation de `Table` pour afficher l'**historique des transactions standard** (ligne par commande, date, statut, montant brut).
  - Un onglet séparé ou un encart distinct pour l'**historique des transactions réglées en Miamz** afin de clairement tracer le décompte de fidélité et la participation de Tok.

## User Review Required

> [!WARNING]  
> Avez-vous besoin que ce tableau de bord comporte un filtre temporel spécifique (ex: Sélection du mois en cours vs. mois précédent) ou un affichage global ("Depuis toujours") suffit-il pour démarrer ?

## Verification Plan

### Manual Verification
1. Je me connecterai avec un profil "admin".
2. Je vérifierai que le flag `admin-compta` est actif.
3. J'ouvrirai l'onglet "Comptabilité" depuis l'accueil Admin.
4. Je sélectionnerai un restaurant.
5. Je comparerai les données (90% à reverser) avec les factures précédemment testées pour m'assurer que la formule de conversion Miamz et retenue correspond à ce que voit le restaurateur de son côté.
