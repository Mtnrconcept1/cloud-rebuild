# TOK Media and AI Skill

À utiliser pour toute modification liée aux uploads, images publiques, Supabase Storage, thumbnails, génération IA, retouche IA, visuels restaurant, médias sociaux, avatars, bannières ou quotas IA.

## Objectif

Préserver la qualité visuelle de TOK sans créer de dette technique, de coûts IA incontrôlés, de lenteur front ou de faille Storage.

## Règles obligatoires

1. Toute image publique doit être optimisée.
2. Préférer WebP ou AVIF pour l’affichage public lorsque le pipeline le permet.
3. Générer ou utiliser des thumbnails pour les listes, cartes et previews.
4. Limiter la taille et le type des uploads.
5. Vérifier les droits d’accès sur chaque bucket Supabase Storage.
6. Ne pas exposer publiquement des fichiers privés sans signed URL ou policy adaptée.
7. Ajouter des quotas IA par restaurant ou par utilisateur quand une génération coûteuse est introduite.
8. L’IA ne doit jamais bloquer une commande, un paiement ou une réservation.
9. Les générations IA doivent être historisées avec modèle, prompt, utilisateur, restaurant, statut et coût estimé si disponible.
10. Les contenus IA visibles publiquement doivent pouvoir être revus, supprimés ou archivés.
11. Les uploads doivent éviter les noms de fichiers dangereux, collisions et chemins non contrôlés.

## Points sensibles TOK

- Photos restaurants.
- Images de plats.
- Médias du fil d’actualités.
- Assets IA générés.
- Bannières restaurant.
- Logos, avatars et visuels marketing.
- Buckets publics ou semi-publics.

## Avant de finaliser

- Vérifier le poids des images.
- Vérifier les formats acceptés.
- Vérifier bucket, policy et signed URLs.
- Vérifier quotas et coûts IA.
- Vérifier fallback si l’IA échoue.
- Vérifier que l’image ne ralentit pas les pages publiques.
- Ajouter ou mettre à jour un test si la modification touche Storage, upload ou génération critique.
