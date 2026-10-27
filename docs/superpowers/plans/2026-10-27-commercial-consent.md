# Consentement restaurateur dans le Cockpit commercial

## Demande et choix
Le restaurateur approuve lui-même son autorisation sur le téléphone/tablette du commercial, dans la fiche prospect. L'accord signé devient une preuve de consentement pour Marketing TOK, sans CSV, abonnement ni validation de consentement par un commercial.

Approches examinées : conserver l'outil autonome #988 (ne répond pas à l'intégration demandée) ; créer des invitations par e-mail (autre parcours, plus de dépendances) ; compléter le formulaire natif de la PR #987 (retenu). La confirmation de propriété de la boîte mail reste distincte du consentement donné en présence : pas de statut « identité/e-mail vérifié » créé par une simple signature.

## Architecture
React/shadcn existants, RPC PostgreSQL contrôlés et preuves privées, liaison atomique avec marketing_contacts et son journal de preuves existant. Pas de nouveau prestataire, clé, déploiement principal ni fusion dans main. Réutilisation de tok_consent_settings pour l'identité du responsable, avec configuration administrative intégrée et contrôle MFA. Le formulaire charge le texte et son empreinte côté serveur et refuse une version périmée.

## État vérifié
Branche dédiée existante : feat/commercial-signed-email-consent-20261027, PR 987, HEAD 2a53f31bb17b7477f0f4075795b36c6106463eae. Base main : 3fb491355dbf8a45fd222140fb69f77fc4313e1a. Les tables de la PR987 n'existent pas en production ; sa migration est un brouillon non appliqué, elle peut être corrigée sans réécrire d'historique appliqué. tok_consent_settings existe mais n'a aucune ligne. Les connecteurs GitHub, Supabase et Vercel sont accessibles ; le poste distant est hors ligne et le conteneur ne résout pas GitHub. Édition canonique via connecteur, copie de travail locale pour tests ciblés, aucun worktree revendiqué.

## Ordre et fichiers
1. Tests de validation/signature, isolation de formulaire et RPC. Ajouter src/lib/commercialEmailConsent.ts, src/test/commercial-email-consent.test.tsx et supabase/tests/commercial_email_consent.sql ; adapter le test de contrat existant.
2. Compléter src/components/commercial/CommercialEmailConsentDialog.tsx : formulaire destiné au restaurateur, accord décoché, réinitialisation à chaque prospect/ouverture, erreurs lisibles, verrou pendant l'envoi, reçu et téléchargement. Le point d'entrée dans src/pages/CommercialProspection.tsx existe déjà dans la PR.
3. Corriger supabase/migrations/20261027161000_commercial_signed_email_consent.sql : contrôle commercial actif/attribution, configuration du responsable par admin MFA, validation serveur, idempotence, preuve immuable, contexte de preuve system_event au lieu du défaut verified, aucune levée d'opposition. Restreindre au canal e-mail une nouvelle autorisation qui ne repose sur aucune autre base préalable.
4. Ajouter un test PostgreSQL isolé dans .github/workflows/commercial-consent.yml et sa fixture limitée. Réutiliser la fonction de journalisation réelle du dépôt dans la fixture. Exécuter tests, lint, typecheck et build via la CI du dépôt. Générer les références canoniques avec le script officiel et publier seulement ses résultats vérifiés si nécessaire.
5. Commit propre sur la branche de la PR987, contrôles de diff et CI, rapport et archive des fichiers complets. Aucun merge ou déploiement de production dans cette tâche.

## Risques et revue
Niveau 3 : données personnelles, autorisations et éligibilité marketing. Un dessin de signature ne vérifie ni l'identité civile ni la titularité de la boîte ; conserver cette limite. Les désabonnements et suppressions restent prioritaires. Aucun e-mail n'est envoyé par la signature ; les limites d'envoi et préférences de notification existantes restent actives. Les preuves ne sont jamais mises dans les métadonnées publiques ni dans le stockage du navigateur.

## Retour arrière
Revert des fichiers de ce lot avant livraison. Après une livraison ultérieure, désactiver le point d'entrée ou révoquer l'EXECUTE des RPC, conserver les preuves et oppositions ; ne jamais supprimer des contacts ou réactiver une adresse opposée. Ne pas appliquer la migration tant que les tests concernés et la CI ne sont pas validés.

## Validation prévue
Tests de comportement React (reset, checkbox, signature, erreur, double clic, reçu), helper TypeScript, PostgreSQL17 (droits, contrat périmé, rôle, attribution, doublon, preuve déclenchée, conservation des refus, portée par canal). Les essais de production et la revue juridique ne sont pas revendiqués ; l'identité professionnelle reste à saisir par le responsable habilité.
