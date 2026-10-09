# Marketing : session, recherche de sources et diagnostic Meta

Risque : niveau 3 (authentification serveur, fonctions Edge, intégration Meta).

## Corrections

- Un 401 anonyme de `/api/marketing/session` reste attendu. Un challenge MFA expiré revient à la connexion ; une panne de confirmation après MFA ne se présente plus comme un code invalide.
- Les erreurs d'authentification entre le BFF et les fonctions Edge deviennent des indisponibilités 503, au lieu de faux 400 utilisateur.
- Le déploiement Vercel sélectionne une clé Supabase secrète active. Les appels Edge la transmettent uniquement dans `apikey`. Le périmètre marketing compare cette clé aux clés configurées côté serveur avant de vérifier l'administrateur délégué.
- La recherche web de backlinks exige un appel de recherche réel et des URL issues des sources retournées. Elle est limitée par utilisateur, conserve CSRF/MFA/admin et propose des cibles à examiner.
- Le filtre sans compte exige des conditions explicitement citées. Une suggestion ne garantit ni publication ni backlink. Les pistes initiales sont documentées dans `../marketing-backlink-opportunities.md`.
- Le bouton Meta vérifie les identités Facebook/Instagram et leur liaison via Graph, avec délais bornés. Il ne réactive pas les intégrations et ne confond pas lecture et droit de publication.

## Réconciliation de l'historique Meta

Le déploiement main `37864964324` échouait : la version distante `20261006022139` était absente de Git. Lecture seule de `supabase_migrations.schema_migrations` sur `wwcrtyoueexyxkkikaos` : cette version porte le nom `configure_meta_marketing_integrations`.

Son SQL normalisé est exactement identique au fichier Git `20261006033000_configure_meta_marketing_integrations.sql`. Le fichier est renommé avec la version effectivement appliquée, sans changement SQL, sans réparation de l'historique distant ni réexécution en production. Cela évite également de déconnecter à nouveau les intégrations par une application en double.

## Preuves et limites externes

- Une lecture réelle `list_runs` avec la clé legacy retournait 401 ; la clé secrète active retournait 200. Aucun secret n'est conservé dans ce rapport.
- Deux canaris de recherche avec le fournisseur réel ont retourné des sources non vides ; le dernier utilise le schéma enrichi et la recherche obligatoire.
- La session utilisateur Meta donne accès à la Page TOK `1409554725565734`. L'interface propose encore d'associer Instagram. Le parcours lancé a abouti à une erreur Meta signalée par l'utilisateur : association non confirmée.
- Aucun formulaire de site tiers, publication Meta ou backlink n'a été envoyé pendant ces validations. La publication automatique sur un formulaire tiers arbitraire n'est pas implémentée ; les sites examinés acceptent des demandes soumises à modération ou décision éditoriale.
- Le diagnostic Meta serveur doit être exécuté après livraison, dans une session marketing administrateur. Une page navigateur accessible ne valide pas le jeton serveur.
- Ce lot ne rend pas exécutables les modèles Autopilot encore limités aux brouillons, ni les fournisseurs non configurés de l'audit du 8 octobre.

## Retour arrière

Revenir sur le commit applicatif puis livrer par le workflow normal. Conserver le nom de migration correspondant à l'historique réellement appliqué. Aucune donnée métier ni clé n'a été modifiée par la correction locale.
