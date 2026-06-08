# TOK Global Rules

Ces règles doivent être lues avant toute génération de code sur TOK.

## Objectif

TOK est une application transactionnelle de réservation, commande directe, paiements, outils restaurateurs et back-office. Le code généré doit privilégier la fiabilité, la sécurité, la traçabilité et la scalabilité avant l’effet visuel.

## Règles permanentes

1. Ne jamais casser le tunnel commande/paiement.
2. Ne jamais mettre de logique critique uniquement côté front.
3. Ne jamais faire confiance au prix, rôle, permission ou statut envoyé par le client.
4. Ne jamais exposer de secret, clé privée, token serveur ou client Supabase privilégié dans le navigateur.
5. Ne jamais contourner RLS depuis le front.
6. Utiliser les Edge Functions pour les opérations serveur sensibles.
7. Séparer strictement les rôles client, restaurateur, livreur, admin et service interne.
8. Ajouter une migration SQL pour tout changement de table, index, policy ou fonction SQL.
9. Ne jamais modifier une migration historique déjà appliquée ; ajouter une nouvelle migration.
10. Ajouter ou mettre à jour les tests dès qu’une zone critique est touchée.
11. Paginer les lectures sur les tables qui peuvent grossir.
12. Préférer les patterns existants du repo aux nouvelles abstractions.
13. Garder les modifications minimales, lisibles et auditées.
14. Enregistrer tous les fichiers texte modifiés en UTF-8, sans conversion ANSI/Windows-1252, et vérifier les accents français pour éviter le mojibake.
15. Quand une tâche de code est terminée, validée et publiable, terminer par un commit et un push de la branche demandée (main si l'utilisateur le demande). Ne pas pousser de fichiers hors périmètre, de secrets, ou de changements non vérifiés ; si le push est bloqué ou risqué, le signaler explicitement.

## Avant de finir une tâche

- Lister les fichiers modifiés.
- Vérifier les impacts paiement, Supabase, RLS, rôles, SEO et performance.
- Vérifier que les commandes `pnpm lint`, `pnpm test` et `pnpm build` restent applicables.
- Vérifier qu'aucun fichier modifié n'a introduit de mojibake ou d'encodage non UTF-8.
- Committer puis pousser la branche cible quand les validations sont passées et que la publication est autorisée.
