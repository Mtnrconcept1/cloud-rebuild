# Mailings ciblés TOK

## Parcours

Depuis **Campagnes → Créer un mailing ou une campagne IA**, la carte **Mailing ciblé** prépare des brouillons destinés aux restaurants prospects et leads. Les clients particuliers restent exclus.

1. Décrire la cible, le nombre de messages, le rythme et les bénéfices à présenter. Le bouton **Interpréter le brief** préremplit les filtres et la cadence ; les choix manuels restent prioritaires.
2. Cocher les cantons, villes, communes, codes postaux, cuisines/catégories, types d’établissement, tailles d’entreprise, langues, sources et statuts des contacts. Chaque rubrique propose **Tous**, une recherche et une pagination. Plusieurs valeurs d’une rubrique sont combinées par OU ; les rubriques sont combinées par ET.
3. Vérifier les destinataires, choisir le premier envoi en heure de Genève et entre 1 et 12 messages. Le rythme peut être quotidien, tous les deux jours, deux fois par semaine, hebdomadaire ou toutes les deux semaines.
4. Générer la séquence. Chaque message possède un objet, un titre, un corps complet et un appel à l’action. Une bannière native TOK 16:9 commune est produite avec les références de marque existantes.
5. Relire chaque e-mail dans son template, vérifier la bannière et les dates, puis utiliser les validations de campagne et de calendrier existantes. La génération et l’interprétation ne donnent aucune approbation et n’envoient aucun e-mail.

Exemple : « Campagne mailing de 4 mails sur un mois, un par semaine, visant les pizzerias de Genève. Promouvoir le zéro attente, les ventes flash, le marketing studio et le plan de table automatisé. » La séquence comporte quatre dates espacées d’une semaine, à heure locale constante, y compris lors du changement d’heure.

## Sémantique et limites des données

- Une rubrique absente de `selections` signifie Tous, y compris les contacts dont le champ est inconnu. Une liste vide signifie personne ; le formulaire refuse de générer dans cet état.
- Le serveur impose les sélections relues et le calendrier au résultat de l’IA. Les critères suggérés par le modèle ne remplacent pas ceux de la demande.
- Les choix viennent des données réellement présentes. Les cuisines séparées par `;` sont proposées individuellement. Une catégorie générale « Restaurant » ou « Italien » n’est jamais supposée être « Pizzeria ».
- L’interprétation reçoit au maximum 200 valeurs par rubrique. Une valeur non disponible ou un critère non pris en charge doit être signalé ; l’opérateur peut chercher et sélectionner manuellement une valeur au-delà de cette première page. Les avertissements exigent une vérification explicite avant génération.
- Les listes de sélection acceptent au maximum 100 valeurs par rubrique. Les facettes affichent des comptes globaux de restaurants, sans coordonnées individuelles ; le bouton de vérification calcule l’intersection réelle.
- L’éligibilité e-mail est revérifiée lors de l’envoi avec les oppositions, autorisations, plafonds et intégrations existants. Une connexion e-mail indisponible n’empêche pas de préparer des brouillons.
- Les coûts de texte et d’image passent par les fournisseurs IA existants. Aucun nouvel abonnement ou secret n’est introduit.

## Contrôles techniques

Le BFF conserve la session HttpOnly, le contrôle CSRF et la vérification du rôle administrateur courant. L’interprétation utilise le quota persistant existant avec un compartiment dédié. La fonction de facettes est réservée à `service_role` et vérifie aussi le rôle de la requête ; aucun accès direct `anon` ou `authenticated` n’est accordé.

La migration étend le validateur et le moteur de filtres sans modifier les sélecteurs scalaires historiques. Un trigger refuse l’approbation ou la planification d’un nouveau mailing sans texte complet et bannière HTTPS prête. Le BFF applique également ce contrôle. Le worker utilise le même moteur HTML que l’aperçu, avec désabonnement signé personnalisé et idempotence Resend existante. Le contenu et les URL sont échappés ; l’aperçu utilise une iframe sandboxée.

La migration ajoute `content` à la réponse de `service_prepare_marketing_email_delivery` en conservant sa définition existante. Elle échoue si le point d’insertion attendu manque ou est ambigu, afin de ne pas remplacer silencieusement des contrôles d’envoi divergents.

## Validation reproductible

Exécuter avec `pnpm@10.28.1` :

```sh
pnpm exec vitest run src/test/marketing-*.test.ts src/test/marketing-*.test.tsx --reporter=dot
pnpm lint
pnpm typecheck
pnpm build
pnpm docs:application-index:check
```

Les tests couvrent notamment les combinaisons Tous/cuisine/ville, le comptage périmé, le mode lecture seule, les pannes de facettes, la configuration e-mail manquante, le changement d’heure, l’unique génération de bannière, les destinataires imposés côté serveur, la session/CSRF, le template et le refus d’approbation incomplet.

Pour les assertions SQL, utiliser exclusivement une **base PostgreSQL jetable et vide**, jamais le projet Supabase partagé. La fixture est minimale ; elle ne reproduit pas les règles d’éligibilité historiques, couvertes séparément par les tests marketing existants.

```sh
psql "$MAILING_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/tests/marketing_targeted_mailing_fixture.sql \
  -f supabase/migrations/20261018171046_marketing_targeted_mailing.sql \
  -f supabase/migrations/20261018171046_marketing_targeted_mailing.sql \
  -f supabase/tests/marketing_targeted_mailing.sql
```

Cette séquence a aussi été exécutée dans une base PGlite isolée : application deux fois de la migration, filtres ET/OU, tableaux vides, compatibilité scalaire, catégories multiples, pagination, permissions et refus d’approbation sans bannière.

## Mise en service et retour arrière

Après validation de la PR, l’ordre prévu est : migration Supabase, Edge Functions `ai-marketing-agent` et `marketing-orchestrator`, puis BFF/frontend via le workflow de production existant. Ne pas créer de preview Vercel ni réactiver les déploiements Git automatiques.

`MARKETING_SENDER_ADDRESS` est une option serveur du worker pour préciser l’adresse d’expédition affichée ; le rendu utilise « Genève, Suisse » par défaut. Les autres clés IA, Resend et de signature restent celles du système existant.

Lors de l’inspection en lecture seule du 18 octobre 2026, l’intégration Resend du projet TOK était marquée `blocked_configuration`, sans `last_error`, avec un dernier contrôle enregistré au 1er août 2026. La connexion et le domaine d’envoi doivent être vérifiés dans les intégrations avant tout essai réel. Aucune migration de production, génération payante ou expédition réelle n’a été effectuée pour cette PR. Les tests de rendu sont automatisés ; une recette visuelle authentifiée et un essai contrôlé de réception restent à faire après mise en service.

En cas de retour arrière, suspendre d’abord les nouvelles campagnes mailing et leurs éléments, puis revenir au code précédent. Conserver le support SQL des filtres et le garde d’approbation tant que des brouillons ou éléments en file utilisent `selections` ou `tok-mailing-v1` ; supprimer ces contrôles pourrait élargir une audience ou permettre l’envoi d’un contenu incomplet. Aucune suppression de contacts n’est nécessaire.
