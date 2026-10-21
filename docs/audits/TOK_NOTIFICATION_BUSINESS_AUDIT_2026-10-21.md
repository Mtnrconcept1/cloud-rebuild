# Audit des notifications métier TOK — 21 octobre 2026

## Périmètre et statut

Audit de niveau 3 : notifications, données privées, fonctions SQL SECURITY DEFINER et fonctions Edge. Base examinée : `Mtnrconcept1/cloud-rebuild`, commit `4a55e19d4437b3f401dae62382a8151ba9e0410a`. Corrections sur `fix/notification-business-wiring-20261021`, sans fusion ni déploiement de production. La base Supabase de production a été consultée en lecture seule. Aucun paiement, email client, push réel ou modification de préférence n'a été déclenché pendant l'audit.

Le checkout local et le poste distant étaient indisponibles. Le mode connector-only prévu par AGENTS.md a été utilisé : branche GitHub dédiée, sources exactes récupérées depuis un checkout Actions et vérifiées par manifeste SHA-256, tests dans des runners isolés. Une création de sandbox Vercel a été refusée par le quota ; aucun abonnement, quota ou déploiement Vercel n'a été modifié.

Ce document distingue le câblage lu dans les sources, les données d'exploitation observées et les tests isolés. Il ne prétend pas avoir exécuté chaque opération réelle de chaque rôle en production.

## Causes vérifiées et correctifs

1. `apply_golden_tok_accreditation` et `admin_review_golden_tok_accreditation` enregistrent bien le dossier et son audit, mais aucun appel ni trigger de notification ne couvrait `golden_tok_accreditations`. Un dossier existant approuvé et non abonné a été observé : un agrément ne constitue pas un paiement.
2. La création d'un dossier `pending_review` après confirmation préalable de l'email ne passe pas nécessairement par l'ancien envoi de `handle_email_confirmation`. Les décisions ont déjà leur email dans `email_queue`, mais ne sont pas toutes présentes dans le centre de notifications.
3. Plusieurs changements de statut, de renouvellement et d'offre programmée dans `restaurant_ai_subscriptions` ne créent pas d'alerte durable. Le nouvel enregistrement initial n'est pas doublé : les accueils existants restent en place.
4. Les réponses publiques des administrateurs dans les incidents support, ainsi que leur résolution/clôture, ne créaient pas systématiquement d'alerte pour le demandeur.
5. `_shared/notifications.ts` acceptait comme succès une configuration absente et un HTTP 200 contenant des échecs métier. Le résultat des workers est désormais contrôlé, avec délai borné et sans journaliser le corps privé d'une erreur fournisseur.
6. Le routage et les caches des écrans métier ne connaissaient pas ces nouveaux types. Les liens sont associés au rôle actif ; l'espace commercial reste isolé. Les emails d'alerte admin utilisent le domaine admin canonique.

## Matrice de couverture

| Parcours / événement | Destinataires et canaux | Source / décision de l'audit |
|---|---|---|
| Candidature restaurateur La Tok d'Or / nouvelle soumission | Tous les admins distincts et accusé de réception au propriétaire ; centre, email, push selon préférences | Nouveau trigger durable sur `golden_tok_accreditations` |
| Agrément La Tok d'Or approuvé, refusé, suspendu | Propriétaire ; centre, email, push | Nouveau ; ne publie pas la note privée dans l'email |
| Abonnement La Tok d'Or actif, essai, retard, impayé, suspendu, terminé, activation expirée | Propriétaire et admins ; trois canaux | Nouveau ; mode live requis, essai explicitement distinct d'un encaissement, période valide requise pour actif |
| Résiliation La Tok d'Or programmée / annulée | Propriétaire et admins | Nouveau ; précise la fin de période et ne prétend pas à une fin immédiate |
| Dossier d'inscription restaurateur/livreur à examiner | Admins ; centre/push et email si l'ancien RPC ne l'a pas déjà créé | Nouveau pont après commit ; rapprochement exact de l'email existant par dossier, type et transition |
| Inscription approuvée / à corriger / refusée | Candidat ; centre/push et fallback email sans doubler l'ancien email | Nouveau |
| Abonnement restaurateur : statut, résiliation/reprise, offre programmée | Propriétaire et admins ; trois canaux | Nouveau sur les UPDATE significatifs ; comptes démo/test exclus |
| Réponse publique admin au support | Demandeur de l'incident, à défaut propriétaire ; trois canaux | Nouveau ; notes internes et réponse à soi-même exclues, rôle réel de l'auteur vérifié |
| Incident support résolu / clôturé | Même demandeur | Nouveau ; pas de contenu interne dans l'alerte |
| Réservation créée, confirmée, modifiée, annulée | Client et propriétaire | Trigger `trigger_reservation_notifications` existant relu ; précommande et canaux existants préservés |
| Commande payée / validation et préparation | Restaurant, client selon événement | `_shared/order-checkout.ts`, `validate-order`, trigger de statut et emails dédiés existants ; pas de second reçu de paiement ajouté |
| Commande acceptée, refusée, prête, annulée | Client / parties prévues par le flux | Producteur de statut existant relu ; ne pas notifier comme payée une commande seulement créée |
| Mission livreur, offre, expiration, absence de livreur | Livreur, restaurant et escalade admin selon événement | Fonctions dispatch et courier existantes préservées |
| Factures et confirmations de paiement | Propriétaire / bénéficiaire autorisé | Trigger de facture, Stripe et emails transactionnels existants ; aucun paiement réel créé pour la recette |
| Réservation La Tok d'Or côté client | Client / restaurant | Notifications de réservation dans `_shared/chefs-table.ts` déjà présentes ; distinctes de la candidature d'agrément corrigée ici |
| TOK One / souscriptions client | Client | Producteurs existants webhook / flux dédiés inspectés ; pas d'achat réel ni de garantie de livraison à partir du seul code |
| Avis, réponses, signalements et activité sociale | Utilisateur concerné / admins pour modération | Producteurs SQL existants conservés |
| Contact, conversation et escalade support | Demandeur / support / admins | `contact-support`, `ai-client-chat`, `ai-client-support`, `ai-support-resolution` déjà câblés ; pas de duplication d'alerte d'incident créé |
| Rappels commerciaux | Commercial autorisé | `commercial-followup-reminders` et isolation commerciale conservés |
| Campagnes marketing / impressions | Gestionnaires et canaux propres au module | Producteurs identifiés ; cette PR ne change ni campagnes, consentement, calendriers, ni notifications de diffusion déjà traitées par des travaux parallèles |

## Circuit durable ajouté

`mutation métier → notification_business_events → process_notification_business_events → enqueue_notification → notifications + notification_deliveries → workers existants`.

La capture est atomique avec la mutation métier. Aucun appel réseau n'est effectué dans le trigger. La matérialisation, exécutée après commit toutes les minutes, est isolée : un défaut d'email, de préférence ou de transport ne révoque pas le paiement ni la décision déjà enregistrés.

Le processeur traite au plus 200 intentions par appel, prend des verrous `FOR UPDATE SKIP LOCKED`, limite à cinq tentatives et applique une temporisation croissante. La création de notification et le passage à `processed` sont atomiques. Un essai infructueux ne laisse pas de notification orpheline ; les destinataires déjà traités ne sont pas rejoués. La clé unique porte sur l'événement et le destinataire. Une vraie nouvelle transition peut produire une nouvelle alerte ; une mise à jour identique ou purement descriptive reste silencieuse.

La table est privée : RLS activée, aucun droit anon/authenticated. Les fonctions d'enqueue et de traitement sont réservées au service. Le processeur revérifie le rôle admin, la propriété et les comptes démo au moment de traiter une intention retardée. Ni note de candidature, ni document, ni coordonnées bancaires, ni identifiant secret Stripe n'est copié dans les notifications.

`processed` signifie « enregistré dans le circuit de notifications », jamais « reçu par le destinataire ». `notification_deliveries` reste la source du statut de transport. Les préférences de canal sont respectées. Une alerte sans appareil push autorisé reste visible dans le centre et peut être envoyée par email si autorisé.

## Exploitation observée avant modification

Sur les sept jours examinés : 29 notifications, sans notification totalement privée de ligne de livraison ; 14 emails avec statut fournisseur `delivered` ; 29 tentatives push ignorées avec `No active device tokens`. Les cinq jetons web enregistrés étaient désactivés, aucun appareil actif. Cela ne se corrige pas en forçant une permission utilisateur.

Dans l'heure inspectée, 60 exécutions SQL du cron email et 12 du cron push étaient réussies. Une exécution SQL du cron réussie ne prouve pas la réussite HTTP ou la réception d'un message. La publication Realtime contenait les tables de notifications, support, conversations et opérations concernées.

## Recette isolée et limites

La première exécution PostgreSQL, run `39550078488`, a échoué sur l'assertion attendue : « Golden TOK application notifies the administrator exactly once ». Après ajout de la migration, le run `39550590188` a réussi. Les fixtures sont entièrement synthétiques, dans une transaction rollbackée, sans secrets ni accès réseau aux fournisseurs. Seules les deux fonctions existantes de mise en file sont extraites des migrations ; l'historique entier n'est pas rejoué car il contient des opérations sans rapport et des appels réseau de production.

Les cas SQL couvrent les destinataires, canaux, absence de fuite de notes, relecture sans doublon, changements purement descriptifs, décision versus paiement, test versus live, exclusion démo, préférences email, échec et reprise, ancien email d'inscription, notes internes, support client, destinataire devenu non autorisé et permissions de la nouvelle table/fonctions.

Les tests TypeScript ont d'abord reproduit 13 échecs attendus sur les contrôles d'envoi, les destinations et les caches ; les 45 tests préexistants sélectionnés passaient. Les workflows de cette PR donnent les résultats courants de la recette, du lint, du typecheck et du build. Ne pas remplacer un résultat CI manquant par une affirmation de réussite.

Pas de preuve de réception réelle des nouveaux événements en production tant que la migration et les fonctions ne sont pas déployées. Pas de replay automatique des anciennes candidatures : cela créerait des alertes tardives ambiguës. Une éventuelle reprise historique doit être ciblée et validée séparément. Aucun SMS n'est annoncé : cette PR utilise les canaux existants centre/email/push.

## Mise en service et contrôles

Après validation et autorisation de fusion/déploiement : appliquer la nouvelle migration par le workflow officiel, déployer les fonctions utilisant `_shared/notifications.ts` et `send-email`, puis le frontend. Ne pas appliquer manuellement l'ensemble des migrations historiques. Les tâches cron email/push existantes ne sont pas remplacées.

Contrôles en lecture seule :

```sql
SELECT status, count(*), min(created_at) AS oldest
FROM public.notification_business_events GROUP BY status;
SELECT id, type, attempts, status, last_error, notification_id
FROM public.notification_business_events
WHERE status IN ('retrying','failed') ORDER BY created_at DESC LIMIT 50;
SELECT jobname, schedule, active FROM cron.job
WHERE jobname IN ('tok-process-business-notifications','send-email-worker','send-push-worker');
```

Valider une nouvelle candidature sur un environnement autorisé : alerte admin, accusé propriétaire, bonne page au clic, dossier rafraîchi et statut de livraison observé. Vérifier ensuite une décision, un cycle de facturation en mode de test isolé et une réponse support. Un email « sent » n'est pas une preuve de boîte principale ; une notification push nécessite un appareil autorisé.

Après correction d'une cause d'échec, un opérateur service peut remettre seulement les intentions `failed` sélectionnées en `retrying` avec `attempts=0`, `next_attempt_at=now()` et `last_error=NULL`. Ne pas réinitialiser les intentions `processed` et ne pas envoyer à nouveau un message dont la livraison est incertaine.

## Retour arrière non destructif

Désactiver le cron `tok-process-business-notifications`, puis le trigger `notification_business_capture` sur les cinq tables concernées. Ne supprimer ni la table d'intentions, ni les notifications, ni les preuves de livraison. Revenir aux versions précédentes du frontend et des fonctions Edge par le workflow officiel. La mise en file et les workers antérieurs restent inchangés. Aucune migration historique, configuration de paiement, secret ou permission existante n'est réécrite.
