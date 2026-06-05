# TOK Release Gatekeeper

À utiliser avant tout merge vers `main`, avant une livraison production ou avant une modification sensible sur paiement, Supabase, admin, SEO, sécurité ou commandes.

## Objectif

Bloquer les changements qui pourraient casser la production, perdre une commande payée, exposer des données, dégrader le SEO ou rendre le support incapable de diagnostiquer un incident.

## Checklist obligatoire avant merge

1. Le build doit passer.
2. Les tests doivent passer ou les tests non lancés doivent être explicitement déclarés.
3. Aucun secret ne doit être présent dans le code.
4. Aucune clé `service_role` ne doit être exposée côté front.
5. Aucune migration destructive ne doit être ajoutée sans demande explicite.
6. Aucune table sensible ne doit être créée sans RLS.
7. Aucune fonction `SECURITY DEFINER` sensible ne doit être exposée trop largement.
8. Aucune modification paiement ne doit être mergée sans test.
9. Aucune requête non paginée ne doit être introduite sur table volumineuse.
10. Aucun `noindex` ne doit être introduit sur les pages publiques de production.
11. Aucun upload média ne doit être ajouté sans limite de taille/type.
12. Aucun realtime global inutile ne doit être introduit.
13. Aucun changement admin sensible ne doit être fait sans audit log ou contrôle de rôle.
14. Aucun changement de commande ne doit être fait sans état clair et traçable.
15. Les migrations doivent être nouvelles, idempotentes quand possible, et ne doivent pas modifier l’historique déjà appliqué.
16. Tous les fichiers texte modifiés doivent rester en UTF-8, sans mojibake dans les copies françaises.

## Points de blocage immédiat

Bloquer la PR si :

- un paiement peut réussir sans commande traçable ;
- un webhook peut créer un doublon ;
- un restaurateur peut voir les données d’un autre restaurant ;
- un utilisateur `anon` peut accéder à une donnée privée ;
- une requête peut charger une table entière ;
- une action admin sensible n’est pas protégée ;
- une page publique importante devient non indexable ;
- une migration supprime des données ou objets existants sans validation explicite.
- un fichier texte modifié contient du mojibake ou a été enregistré hors UTF-8.

## Réponse attendue de l’IDE ou de l’agent

Avant de proposer le merge, fournir :

- la liste des fichiers modifiés ;
- les risques vérifiés ;
- les tests ajoutés ou modifiés ;
- les commandes exécutées ;
- les commandes non exécutées et la raison ;
- les points qui nécessitent une validation humaine.
