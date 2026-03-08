

# Plan: Remplacer les 17 stubs dashboard/admin restants par le code source réel

## Résumé

Il reste 17 pages "stubs" (placeholders) dans les répertoires `dashboard/` et `admin/` qui doivent être remplacées par le code réel du projet source Bite & Book. J'ai lu tout le code source nécessaire.

## Fichiers à remplacer

### Dashboard restaurateur (16 fichiers)

| Fichier | Lignes source | Complexité |
|---------|--------------|------------|
| `DashboardAvis.tsx` | 197 | CRUD avis avec formulaire |
| `DashboardReservations.tsx` | 386 | Filtres service/statut/tri, optimistic updates |
| `DashboardPerformances.tsx` | 93 | KPIs via RPC, création commandes test |
| `DashboardCompta.tsx` | 995 | Comptabilité complète avec Recharts (graphiques revenus, pie charts, affluence) |
| `DashboardFactures.tsx` | 67 | CRUD factures simples |
| `DashboardPhotos.tsx` | 61 | Gestion galerie photos via menu_items |
| `DashboardOffres.tsx` | 275 | CRUD offres anti-gaspi avec dialog et ImageUpload |
| `DashboardVentesFlash.tsx` | 319 | CRUD ventes flash avec calcul durée |
| `DashboardFormules.tsx` | 332 | Configuration formules repas avec scope delivery/reservation |
| `DashboardService.tsx` | 239 | Pilotage service lunch/dîner avec serviceSettings |
| `DashboardPromotions.tsx` | 96 | CRUD promotions via flash_sales |
| `DashboardComparaison.tsx` | 77 | Comparaison métriques via RPC |
| `DashboardRecommandations.tsx` | 57 | Recommandations via RPC |
| `DashboardCampagneOverview.tsx` | 75 | CRUD campagnes via anti_waste_offers |
| `DashboardCampagnes.tsx` | 887 | Marketing avancé: Boost + Campagne ciblée + Stats avec AudienceTargeting |
| `DashboardReseauxSociaux.tsx` | 63 | Connexion Instagram via opening_hours |

### Admin (1 fichier)

| Fichier | Lignes source | Complexité |
|---------|--------------|------------|
| `AdminNotifications.tsx` | 610 | Campagnes notifications: formulaire complet, ciblage rôles/villes, canaux, planification, historique paginé avec stats |

## Approche d'implémentation

Copie directe du code source lu ci-dessus, fichier par fichier. Aucune modification de schéma DB nécessaire (les tables existent déjà). Le code sera implémenté en plusieurs batches pour respecter les limites.

## Points d'attention

- `DashboardCompta.tsx` (995 lignes) et `DashboardCampagnes.tsx` (887 lignes) sont les fichiers les plus volumineux
- `DashboardReseauxSociaux.tsx` utilise `Json` type de Supabase (accès `item.opening_hours?.social_instagram` pourrait nécessiter un cast)
- `AdminNotifications.tsx` appelle l'edge function `create-campaign` qui devra être déployée séparément

