# TOK Release Gatekeeper

À utiliser avant tout merge vers `main`, avant une livraison production ou avant une modification sensible sur paiement, Supabase, admin, SEO, sécurité ou commandes.

## Objectif

Bloquer les changements qui pourraient casser la production, perdre une commande payée, exposer des données, dégrader le SEO ou rendre le support incapable de diagnostiquer un incident, sans transformer un changement léger en audit complet inutile.

## Niveau de gate avant merge

### Niveau 1 — léger

Exemples : documentation, favicon, asset statique, texte, CSS localisé, métadonnée non sensible.

Vérifier uniquement :

1. Le diff reste strictement dans le périmètre prévu.
2. Aucun secret ou fichier généré indésirable n’est ajouté.
3. Les assets ou références modifiés sont cohérents et valides.
4. Le test ciblé éventuel passe.
5. Les checks CI obligatoires du dépôt sont verts.

Ne pas exiger de vérification Stripe, Supabase, RLS, migration, logs ou production si le changement n’en dépend pas.

### Niveau 2 — standard

Exemples : logique frontend, route publique, formulaire, SEO de page, intégration non sensible.

Vérifier :

1. Le comportement modifié est couvert par un test ciblé lorsque pertinent.
2. Lint/typecheck/build applicables passent.
3. Aucun impact inattendu sur routes, SEO, permissions ou performances.
4. Les checks CI requis sont verts.

### Niveau 3 — critique

La checklist complète ci-dessous s’applique.

## Checklist critique avant merge

1. Le build doit passer.
2. Les tests critiques applicables doivent passer ou les tests non lancés doivent être explicitement déclarés.
3. Aucun secret ne doit être présent dans le code.
4. Aucune clé `service_role` ne doit être exposée côté front.
5. Aucune migration destructive ne doit être ajoutée sans demande explicite.
6. Aucune table sensible ne doit être créée sans RLS.
7. Aucune fonction `SECURITY DEFINER` sensible ne doit être exposée trop largement.
8. Aucune modification paiement ne doit être mergée sans test.
9. Aucune requête non paginée ne doit être introduite sur table volumineuse.
10. Aucun `noindex` ne doit être introduit sur les pages publiques de production sans intention explicite.
11. Aucun upload média ne doit être ajouté sans limite de taille/type.
12. Aucun realtime global inutile ne doit être introduit.
13. Aucun changement admin sensible ne doit être fait sans audit log ou contrôle de rôle.
14. Aucun changement de commande ne doit être fait sans état clair et traçable.
15. Les migrations doivent être nouvelles, idempotentes quand possible, et ne doivent pas modifier l’historique déjà appliqué.
16. Tous les fichiers texte modifiés doivent rester en UTF-8, sans mojibake dans les copies françaises.
17. Les connecteurs et sous-systèmes critiques réellement concernés doivent être vérifiés.
18. Une fois les validations terminées et le périmètre confirmé, publier la branche dédiée et ouvrir une PR. Ne pas modifier `main` directement.

## Points de blocage immédiat

Bloquer la PR si :

- un paiement peut réussir sans commande traçable ;
- un webhook peut créer un doublon ;
- un restaurateur peut voir les données d’un autre restaurant ;
- un utilisateur `anon` peut accéder à une donnée privée ;
- une requête peut charger une table entière ;
- une action admin sensible n’est pas protégée ;
- une page publique importante devient non indexable par erreur ;
- une migration supprime des données ou objets existants sans validation explicite ;
- un fichier texte modifié contient du mojibake ou a été enregistré hors UTF-8 ;
- une validation directement liée au risque du changement échoue.

Ne pas bloquer une PR légère parce qu’une vérification sans rapport avec son périmètre n’a pas été exécutée.

## Réponse attendue de l’IDE ou de l’agent

Avant de proposer le merge, fournir :

- le niveau de risque retenu ;
- la liste des fichiers modifiés ;
- les risques réellement vérifiés ;
- les tests ajoutés ou modifiés ;
- les commandes exécutées ;
- les commandes non exécutées et la raison ;
- les points qui nécessitent une validation humaine ;
- le commit et la PR, ou la raison précise si la publication n'a pas été faite.
