# Répartition des responsabilités — prix, disponibilité, allergènes et qualité

Version 1.0 — 24 juillet 2026

| Sujet | Restaurant | TOK | Client |
|---|---|---|---|
| Prix et TVA des produits | Définit, vérifie et met à jour les prix et la qualification fiscale | Affiche le snapshot serveur et calcule les frais annoncés | Vérifie le récapitulatif avant paiement |
| Stock et disponibilité | Tient le stock, horaires et fermetures à jour | Fournit les outils de blocage, synchronisation et alerte | Respecte les créneaux et quantités confirmés |
| Ingrédients et allergènes | Responsable de l’exactitude, des contaminations croisées et de l’information obligatoire | Transmet l’information sans altération et signale les champs manquants | Informe le restaurant de ses besoins et vérifie en cas de risque grave |
| Préparation et hygiène | Entière responsabilité de l’établissement | Aucun contrôle sanitaire sauf signalement ou vérification contractuelle | Signale rapidement un incident avec éléments utiles |
| Photos et descriptions | Garantit fidélité et droits | Héberge, adapte techniquement et modère | Ne doit pas considérer une photo illustrative comme garantie si cela est clairement indiqué |
| Paiement | Coopère aux rapprochements et remboursements de son périmètre | Sécurise le parcours, journalise et traite Stripe | Utilise un moyen autorisé et signale les débits contestés |
| Livraison par le restaurant | Organise, assure et exécute | Affiche le statut transmis | Fournit une adresse et des instructions exactes |
| Livraison organisée par TOK | Prépare à l’heure et remet correctement | Organise le dispatch et répond de son service selon le contrat | Est joignable et respecte les conditions de remise |
| Avis et réclamations | Répond loyalement et conserve les preuves | Fournit support, modération et piste d’audit | Publie un avis authentique et coopère à l’enquête |

## Règles communes

Chaque partie corrige immédiatement une information dont elle connaît l’inexactitude. TOK ne peut exclure sa responsabilité pour une erreur qu’il crée lui-même, notamment calcul, paiement, affichage ou transmission. Le restaurant ne peut transférer à TOK ses obligations sanitaires ou l’exactitude de ses données. Les clauses sont interprétées sous réserve du droit impératif suisse.

## Incident critique

En cas de risque allergène, sanitaire, fraude ou sécurité, l’offre peut être suspendue immédiatement. Le restaurant fournit traçabilité, lots, ingrédients et mesures prises. TOK conserve les journaux, informe les personnes nécessaires et coopère avec les autorités et assureurs selon le plan d’incident.
