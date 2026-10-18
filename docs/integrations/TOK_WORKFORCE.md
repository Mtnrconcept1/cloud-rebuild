# TOK Équipe — intégration de SwissTime Tracker

## Sources analysées

- Portage initial : [mtnrconcept/swiss-time-tracker, branche main](https://github.com/mtnrconcept/swiss-time-tracker/tree/7cab98100ae189b7eec1234a7cbc6b49db2f95b7), commit `7cab98100ae189b7eec1234a7cbc6b49db2f95b7`.
- Parcours d’accès employé : [branche nouvelles-fonctions](https://github.com/mtnrconcept/swiss-time-tracker/tree/6648cf5c414145b516c20f7dcdd426ddddb4001d), commit `6648cf5c414145b516c20f7dcdd426ddddb4001d`.
- Cette seconde branche expose l’option « Générer un accès employé » dans `src/pages/Employees.tsx`, la liaison de la fiche au compte dans `supabase/functions/create-employee-auth/index.ts`, puis le tableau de bord personnel dans `src/pages/MyDashboard.tsx`.

SwissTime propose un accès individuel depuis la fiche employé, puis une vue personnelle regroupant le planning, les heures et les demandes. Son implémentation crée directement un compte Auth ; elle ne contient pas d’invitation envoyée par e-mail. TOK reprend ce parcours fonctionnel et ajoute l’invitation demandée en utilisant son propre compte Auth, son e-mail vérifié et sa file d’envoi existante. Les mots de passe communs/prévisibles et l’auto-confirmation d’adresse de la référence ne sont pas repris.

## Choix d’architecture

Portage natif dans le dashboard restaurateur TOK, avec les composants, les thèmes clair/sombre et la navigation existants.

- Routes de gestion : `/dashboard/equipe` (restaurateur) et `/admin/equipe` (administrateur).
- Espace individuel : `/equipe/mon-espace` ; gestion déléguée : `/equipe/gestion`.
- Données : tables `tok_workforce_*` isolées par `restaurant_id`, clés étrangères composites et politiques RLS. Les tables et migrations historiques de SwissTime ne sont pas importées.
- Activation : administrateur TOK uniquement, `tok_workforce_settings.enabled=false` par défaut, contrôle serveur pour toute mutation du restaurateur et historique d’activation.
- Comptes : le salarié conserve son compte TOK. L’association vérifiée à `tok_workforce_employees.user_id` lui ouvre les données autorisées par RLS. Aucun rôle plateforme `restaurateur` n’est attribué.
- Données RH : employés, services, heures, validations nominatives, absences, demandes, échanges et rapports.
- Les contrôles de pauses, repos et dépassements, ainsi que les coûts indicatifs, ne constituent pas un calcul de paie ou une certification LTr.

## Invitations et vue d’ensemble

### Parcours restaurateur

Dans l’onglet Collaborateurs, une fiche active sans compte lié propose **Inviter**. La boîte de dialogue permet de renseigner ou corriger l’adresse réelle ; elle explique que le salarié doit utiliser cette adresse pour son compte TOK. Une option permet aussi d’envoyer l’invitation immédiatement après la création d’une fiche.

La création de la fiche et son invitation sont deux opérations explicites : si la fiche a été enregistrée mais que l’invitation échoue, l’interface conserve la fiche, signale le résultat partiel et propose de réessayer depuis celle-ci. Elle ne recrée pas un doublon.

Chaque fiche distingue l’envoi en attente, l’envoi en cours, l’invitation envoyée, l’échec, l’expiration, l’annulation et l’accès activé. **Renvoyer**, **Annuler l’invitation** et **Actualiser les accès** permettent le suivi. Un message accepté par le prestataire n’est pas un accès activé ; l’employé doit encore accepter l’invitation. Une fiche inactive ou déjà liée ne peut pas recevoir une nouvelle invitation.

### Parcours collaborateur

1. Le lien de l’e-mail ouvre `https://www.thetok.ch/equipe/mon-espace?restaurant=<UUID>`.
2. La connexion ou l’inscription conserve cette destination. Le lien de confirmation d’inscription et son renvoi la conservent également.
3. La base recherche une invitation courante correspondant à l’adresse Auth vérifiée et à celle de la fiche. Le salarié accepte volontairement l’association.
4. Son espace s’ouvre sur **Vue d’ensemble** : prochain service, heures du mois, vacances restantes, demandes en attente, dernières demandes et badgeuse, avec accès aux onglets détaillés.

Le lien désigne un établissement ; il ne constitue pas un secret d’accès. La possession de ce lien seule ne permet ni de voir une fiche ni de l’accepter. Aucun compte ou mot de passe n’est créé à l’insu du salarié. Les comptes déjà liés avant cette migration conservent leur accès.

Le portail affiche le compte connecté et permet d’actualiser les droits ou de changer de compte. Si le restaurant du lien est invalide ou inaccessible, il affiche une explication et ne sélectionne pas silencieusement un autre établissement. L’utilisateur peut choisir explicitement un de ses établissements autorisés.

Seules les deux routes internes exactes de TOK Équipe bénéficient de la continuation d’authentification et de l’accès pendant la phase de lancement après résolution des rôles. Les autres règles de lancement, de consentement OAuth et d’accès restent appliquées.

### Contrats serveur

Migrations additives : `supabase/migrations/20261018190000_tok_workforce_invitations.sql` et `supabase/migrations/20261018191000_tok_workforce_launch_access.sql`.

La seconde migration étend les listes d’autorisation du verrou de lancement à 11 tables et 10 RPC TOK Équipe précises pour les utilisateurs authentifiés avec un identifiant réel. Les contrôles RLS et les droits internes des RPC restent appliqués. La définition du hook PostgREST, ses privilèges et le flag de lancement sont conservés.

| Contrat | Comportement |
| --- | --- |
| `tok_workforce_invitations` | Une invitation courante par fiche, e-mail normalisé, dates d’émission/expiration/acceptation/annulation, auteur et référence au message. |
| `tok_workforce_invite_employee` | Vérifie le restaurateur/l’administrateur autorisé, l’activation et la fiche active non liée ; met à jour son e-mail et écrit le message dans une même transaction. |
| `tok_workforce_list_invitations` | Retourne le suivi limité au restaurant autorisé, sans exposer le contenu brut ou les erreurs internes de la file d’e-mails. |
| `tok_workforce_revoke_invitation` | Annule l’invitation en attente et son message encore annulable ; un accès déjà accepté doit être suspendu via la fiche. |
| `tok_workforce_my_restaurants` | Retourne les comptes déjà liés et les invitations explicites, actives et non expirées correspondant à l’e-mail vérifié. |
| `tok_workforce_claim_employee` | Vérifie la session, l’e-mail, le restaurant et l’invitation ; associe la fiche et enregistre l’acceptation atomiquement, de façon idempotente. |

Les invitations expirent après 7 jours. Le serveur limite les nouveaux envois à 5 par collaborateur sur 24 heures et 100 par établissement sur une heure ; un renvoi ou changement d’adresse est espacé d’au moins une minute. Les doubles clics réutilisent un message encore en attente ou en cours. Après un échec de transport, la relance conserve l’identifiant et le corps exacts du message pour conserver la clé d’idempotence du prestataire, avec au plus 5 relances.

Les clients ne peuvent pas insérer une invitation, écrire la file d’e-mails, imposer un `user_id` à une fiche ou confirmer une adresse Auth. Les fonctions serveur vérifient les droits et utilisent un `search_path` fixe. Les données des autres établissements restent protégées par RLS. Désactiver un collaborateur lui retire aussi la lecture directe de sa fiche.

Les envois réels sont interdits pour les restaurants de démonstration et les modules désactivés.

### Envoi et exploitation

L’invitation utilise `email_queue` et le worker TOK `supabase/functions/send-email/index.ts`. Celui-ci réserve le message avant l’envoi, utilise Resend et une clé d’idempotence fondée sur l’identifiant du message, puis enregistre le résultat. Le worker existant est planifié chaque minute ; le dashboard interroge le suivi toutes les 15 secondes quand il est affiché. Les adresses et les noms insérés dans l’e-mail HTML sont échappés ; son URL est fixée côté serveur.

Le fonctionnement effectif de l’envoi dépend du worker planifié, de ses autorisations et de la configuration d’expéditeur existante. Un message en file reste affiché comme en attente. Un message déjà en cours d’expédition ne peut pas être rappelé ; l’annulation bloque néanmoins son acceptation.

Aucun envoi réel n’est effectué par les tests et aucune migration n’est appliquée en production lors de la préparation de la PR.

## Fonctions RH conservées

- Collaborateurs : création, désactivation, fonction employé/responsable et coût horaire indicatif.
- Planning : grille sur 7 jours, création/confirmation/déplacement/suppression, absences visibles et coûts prévisionnels.
- Badgeuse : arrivée, début/fin de pause et départ ; horodatage serveur immuable, une seule session active, aucune écriture directe depuis le navigateur.
- Conversion des pointages en relevés d’heures seulement si la session est valide ; sessions longues ou impossibles à convertir à régulariser par un responsable.
- Heures : relevés, validation nominative et signature manuscrite conservées avec l’identité et la date. Il s’agit d’une signature simple, non qualifiée.
- Demandes de congés : période et jours demandés ; l’accord du responsable crée l’absence atomiquement.
- Planning et absences : déclencheurs PostgreSQL empêchant un service pendant une absence et une absence sur un service non annulé.
- Échanges : accord du collègue, puis validation transactionnelle limitée à l’établissement.
- Délégation : le responsable RH lié peut superviser son équipe sans obtenir les droits plateforme du restaurateur ni modifier les fiches, coûts ou rôles.
- Rapports : récapitulatif hebdomadaire, CSV protégé contre les formules, impression/PDF.
- L’assistant IA externe de SwissTime n’est pas importé. Les contrôles restent déterministes, sans transmission de données RH à ce prestataire. Toute future IA doit respecter les quotas et autorisations TOK.

La badgeuse nécessite une connexion Internet ; un clic hors ligne n’est pas un pointage validé. Les horaires inhabituels, changements d’heure, conventions RH et règles de conservation doivent être vérifiés avant l’utilisation officielle des données pour la paie.

## Validation, déploiement et retour arrière

La workflow `.github/workflows/tok-workforce-postgres.yml` exécute `src/test/sql/tok_workforce_postgres_smoke.sql` sur PostgreSQL 17 temporaire. Il applique les deux migrations historiques, crée des comptes déjà liés, applique la nouvelle migration puis vérifie :

- badgeuse, relevés, absences, signatures et isolation entre deux restaurants ;
- conservation des comptes liés et impossibilité de réclamer une fiche sans invitation ;
- droits du restaurateur, refus d’un responsable non propriétaire, des autres salariés et des anonymes ;
- e-mail réel normalisé, échappement HTML, file d’envoi, double clic et reprise après échec ;
- adresse non vérifiée, mauvaise identité, expiration, annulation et acceptation répétée ;
- impossibilité de forger `user_id`, désactivation, restaurant démo/module désactivé, quotas et atomicité ;
- via `src/test/sql/tok_workforce_launch_smoke.sql`, le hook réel de lancement actif, les chemins TOK Équipe autorisés, les autres chemins refusés et le maintien de RLS, des privilèges et du flag.

Les tests React/Vitest ciblent aussi le formulaire, les états d’envoi, le résultat partiel, la vue personnelle et la continuation après authentification. Les contrôles de livraison comprennent le typecheck, le lint, le build et l’index applicatif.

Ordre de livraison : faire réviser la PR et ses contrôles ; appliquer les migrations via le pipeline contrôlé existant avant la publication du frontend ; vérifier le worker d’e-mails, puis tester le parcours avec des comptes dédiés autorisés. L’activation de TOK Équipe reste effectuée par l’administrateur, établissement par établissement.

Retour arrière fonctionnel : désactiver TOK Équipe pour l’établissement concerné. Les fiches, pointages, historiques et comptes déjà associés sont conservés. Un retour de version du frontend ne doit pas supprimer la migration de sécurité ; toute suppression ultérieure de tables exige une migration dédiée et revue.
