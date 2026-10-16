# TOK Connect et TOK Équipe — livraison du 16 octobre 2026

## Périmètre

Cette branche consolide les parcours clients des PR #865 et #868 sur le main
`6f30cd83ef68d52321d95462065c146adc072206`, puis complète leur gestion des erreurs
et les fonctions TOK Équipe issues de Swiss Time Tracker.

- Réservation classique dans le widget : disponibilités, devis de garantie,
  consentement, confirmation, historique et annulation des réservations éligibles.
- Panier à emporter et Zéro Attente : produits et quantités, créneau, devis serveur,
  confirmation du montant, checkout Stripe, suivi et annulation d’une tentative.
- Mutations accessibles au widget, authentification TOK et rôle client obligatoires.
  Les écritures génériques, administratives et partenaires restent fermées au modèle.
- Prix et activation du restaurant revérifiés côté serveur. Une même tentative
  ne crée pas une seconde commande. Un résultat incertain impose une vérification
  du paiement ou de l’historique ; seul un refus prouvé avant écriture libère le panier.
- TOK Équipe : édition des collaborateurs, badgeuse protégée pendant les requêtes,
  heures PostgreSQL avec secondes, durée réelle des pointages et changement d’heure,
  rapports hebdomadaires/mensuels paginés, employés sortis inclus dans leur période,
  régularisation motivée des sessions clôturées sans altérer les pointages originaux.

Le paiement s’effectue dans le checkout Stripe ouvert depuis le widget. Il ne
s’agit pas d’une intégration à la feuille de paiement native privée de ChatGPT.
Les commandes gratuites à emporter et les cas nécessitant une assistance continuent
de passer par TOK. Les paniers ne couvrent pas la livraison ni les options payantes.
La planification assistée par IA externe du projet source Swiss Time Tracker
n’est pas intégrée à cette livraison.

## Risque et contrôles

Niveau 3 : commandes, réservation, authentification, paiement et RPC privilégiée.
Les contrôles portent sur le recalcul des prix, le consentement, la propriété des
tentatives, les reprises sans duplication, les erreurs réseau et les permissions
entre restaurants. La RPC de régularisation refuse les anonymes, les autres
restaurants, les collaborateurs différents, les sessions ouvertes et les relevés
déjà signés. La date locale Europe/Zurich doit correspondre.

Validation locale : tests du domaine, lint, TypeScript, build frontend et fixture
SQL PostgreSQL via PGlite. La suite SQL est également déclenchée par la CI PostgreSQL 17.
Le build de validation utilise des valeurs publiques fictives ; les requêtes SEO
dynamiques ne constituent pas un test d’intégration avec la production.

Le contrôle Deno complémentaire utilise les mêmes versions de paquets obtenues
par npm, car esm.sh est inaccessible depuis cet environnement. Il retrouve des
erreurs de typage préexistantes dans les dépendances partagées de create-checkout
(59 diagnostics également sur le fichier de main), notamment les deux versions
Stripe déjà présentes. Aucun diagnostic ne reste dans les deux handlers TOK Connect
modifiés ; leurs dépendances partagées conservent 23 de ces diagnostics.

L’advisor Supabase signale les RPC SECURITY DEFINER intentionnellement accessibles
aux utilisateurs authentifiés. Les autorisations sont vérifiées dans ces RPC et
par les tests RLS ; aucune autorisation anonyme n’est ajoutée.
Référence : https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

## Déploiement et retour arrière

1. Attendre les contrôles de la PR et valider en environnement de test un parcours
   ChatGPT connecté, une réservation avec/sans garantie et un paiement Stripe sandbox
   avec retour, interruption et webhook. Ces tests réels ne sont pas remplacés par
   les simulations automatisées et n’ont pas été exécutés dans cette session.
2. Appliquer la migration additive
   `20261016201212_tok_workforce_clock_reconciliation.sql` à la cible Supabase vérifiée.
3. Déployer `create-checkout`, `tok-connect-app-bridge` et `tok-connect-remote-mcp`
   avec leurs modules partagés. La configuration OAuth publiée a été vérifiée en lecture.
4. Déployer le frontend par le workflow production existant après fusion autorisée.
   Les nouvelles colonnes de pointage doivent être disponibles avant ce frontend.
5. Vérifier la réservation, le checkout, les statuts après webhook, la badgeuse,
   la régularisation par manager et le rapport mensuel sur le déploiement final.

Retour arrière : redéployer les fonctions et le frontend du commit précédent.
Conserver la migration additive et les traces de régularisation ; aucune suppression
de données n’est nécessaire. Ne pas supprimer les clés d’idempotence pour relancer
un paiement dont l’état est incertain.

Aucune migration, fonction ni publication Vercel de production n’est effectuée
par cette branche tant que la PR n’est pas fusionnée et le déploiement validé.
