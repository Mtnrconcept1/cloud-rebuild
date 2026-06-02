# TOK Scale Readiness Skill

À utiliser pour toute modification qui peut impacter performance, charge, requêtes Supabase, images, recherche, realtime, pages publiques, dashboards, commandes ou réservations.

## Objectif

Préparer TOK à supporter les pics midi/soir, les recherches fréquentes, les commandes simultanées, les paiements et les dashboards actifs sans saturation inutile.

## Règles obligatoires

1. Ne jamais charger tous les restaurants d’un coup.
2. Ne jamais charger tous les menus d’un coup.
3. Utiliser pagination, limite, offset ou curseur sur les listes.
4. Ajouter du cache pour les données publiques peu changeantes.
5. Optimiser les images et utiliser le lazy loading.
6. Réduire les appels Supabase inutiles.
7. Éviter les subscriptions realtime globales.
8. Limiter le realtime aux commandes actives, restaurants concernés et utilisateurs concernés.
9. Ajouter des indexes pour les requêtes fréquentes.
10. Ne pas bloquer une action critique par une génération IA, un upload ou une tâche lente.
11. Les pages critiques doivent rester utilisables sur mobile et connexion moyenne.

## Questions à se poser avant de coder

- Cette page peut-elle charger 1 000 lignes sans le vouloir ?
- Cette requête a-t-elle un index ?
- Le front fait-il plusieurs appels là où un seul suffit ?
- La donnée peut-elle être mise en cache ?
- Le realtime est-il strictement nécessaire ?
- Que se passe-t-il pendant un pic de commandes ?

## Avant de finaliser

- Vérifier la pagination.
- Vérifier les indexes.
- Vérifier le poids des images.
- Vérifier le nombre d’appels Supabase.
- Vérifier que les composants lourds sont chargés progressivement.
- Ajouter un test ou un guard si la modification touche une zone de charge critique.
