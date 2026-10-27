# Confirmation e-mail du consentement commercial — plan

**Objectif :** après signature en présence, envoyer à l’adresse renseignée la copie de l’autorisation avec sa signature et un bouton « JE CONSENS » ; aucune nouvelle éligibilité campagne avant confirmation explicite depuis la boîte mail.

**Base auditée :** c8b99a99c7601329fa70e97a8ad94fc25efe2bd6 ; PR #987 et #989 déjà fusionnées. Niveau 3 : données personnelles, permissions, preuve et envoi transactionnel.

## Périmètre et ordre

1. Préparer un environnement isolé à partir du dépôt réel. DNS GitHub indisponible dans le conteneur ; Vercel Sandbox refuse la création pour quota Hobby atteint. Les connecteurs GitHub, Supabase, Vercel et Resend sont accessibles. Un workflow temporaire en lecture seule sur cette branche fournit les objets Git publics et les dépendances gelées pour tests locaux, sans credentials ni variables de production. Retirer cet export avant livraison.
2. Conserver les migrations historiques. Créer avec la CLI une migration additive pour la confirmation, l’éligibilité en attente, les capacités confidentielles, les statuts d’envoi et l’audit. Préserver les preuves signées existantes et les oppositions.
3. Adapter `src/components/commercial/CommercialEmailConsentDialog.tsx` et `src/lib/commercialEmailConsent.ts` : signature enregistrée, envoi automatique demandé, statut d’attente, échec récupérable et actualisation. Le commercial ne reçoit jamais le jeton de confirmation.
4. Étendre le worker transactionnel existant `send-email` et ajouter un helper testable pour envoyer l’autorisation et la signature intégrée en pièce jointe CID via l’infrastructure Resend existante. Le destinataire et la signature proviennent exclusivement de la preuve en base. Idempotence, limites de répétition et enregistrement des erreurs.
5. Ajouter une page publique de confirmation sans traqueur. Le bouton de l’e-mail ouvre le document ; seule l’action explicite « JE CONSENS » sur cette page produit un POST et autorise l’e-mail. Un GET, un aperçu ou un scanner ne suffit pas. Lien expirant, confirmation atomique et idempotente, refus des liens altérés ou révoqués.
6. Ajouter tests PostgreSQL, tests de la fonction et tests UI : attente non éligible, confirmation positive, expiration, retrait, opposition préalable/postérieure, droits, concurrence, doublons, erreurs d’envoi, signature intégrée, absence de secret côté client et absence d’activation par GET. Régénérer les références avec les scripts officiels et exécuter lint/typecheck/build/CI.

## Contraintes

- Aucun envoi de campagne, abonnement ou paiement n’est déclenché.
- Un clic ne réactive jamais une opposition ou suppression existante ; les préférences de notification restent prioritaires.
- L’accès à la boîte ne certifie pas l’identité civile ni les pouvoirs du signataire.
- Le responsable de collecte doit toujours être configuré par l’administrateur avec MFA ; ne pas inventer ses coordonnées.
- Utiliser le domaine d’envoi vérifié de l’infrastructure existante ; ne pas lire ni modifier les secrets.
- Ne pas exposer la signature ou le jeton dans des URLs publiques d’images, dans les logs, les listes commerciales ou l’analytique.
- Ne pas modifier le site autonome de la PR #988 ni les cartes saisonnières.

## Validation et retour arrière

Tests ciblés d’abord, puis les contrôles complets pertinents du dépôt. Aucun accord réel ni e-mail réel à un restaurateur pour les essais. Nouvelle PR dédiée, sans fusion automatique. Avant production, appliquer migration et fonction avant frontend. En cas de retrait de cette version : désactiver le nouveau parcours en conservant les preuves, l’attente et les oppositions ; ne jamais restaurer l’autorisation immédiate d’une demande non confirmée.


## Décisions d’exécution

- Environnement : les objets Git réels et les dépendances gelées ont été récupérés sans credentials par un workflow temporaire. Worktree local isolé `/mnt/data/tok-worktrees/consent-email`, branche dédiée, base inchangée ; statut initial propre. Le quota Sandbox n’exige aucune dépense supplémentaire.
- Ruling : réutiliser `email_queue` et son worker existant toutes les minutes, avec insertion atomique à la signature. Une fermeture du navigateur après signature ne peut pas supprimer la demande d’envoi. Une nouvelle fonction publique ne traite que consultation/confirmation/retrait, par capacité confidentielle.
- Ruling : les liens utilisent un fragment et la page statique `/consentement-email.html`, sans session ni traceur. Le proxy `/functions/v1/*` existe déjà ; aucune configuration Vercel ou route React n’est modifiée.
- Ruling : HMAC séparé par finalité avec la clé serveur existante, empreinte seulement en base ; le commercial ne reçoit jamais le jeton. Le document, le destinataire et la signature sont lus depuis la preuve. Un changement de clé ou de contenu pendant un retry échoue fermé.
- Ruling : retries automatiques bornés à cinq essais et à 23 heures du premier essai, avec un seul identifiant fournisseur. Cette limite reste inférieure à la fenêtre d’idempotence Resend de 24 heures. Un envoi accepté n’est jamais présenté comme une livraison reçue.
- Ruling : préserver les preuves et permissions historiques sans fabriquer de confirmation rétroactive. Toutes les nouvelles demandes ajoutent une barrière privée d’éligibilité e-mail, indépendante des métadonnées éditables et des réimports. Les oppositions révoquent définitivement les anciens liens.
- Migration générée par la CLI du dépôt : `20261027221840_commercial_email_confirmation.sql`. Aucun fichier historique modifié.

## Fichiers du lot

Formulaire et état : `src/components/commercial/CommercialEmailConsentDialog.tsx`, `src/lib/commercialEmailConsent.ts`.
Transport et confirmation : `supabase/functions/send-email/index.ts`, nouveau `_shared/commercial-consent-confirmation.ts`, nouveau `commercial-consent-confirmation/index.ts`, entrée publique dédiée dans `supabase/config.toml`.
Page isolée : `public/consentement-email.html`, `.js`, `.css`.
Base : migration additive ci-dessus et `supabase/tests/commercial_email_confirmation.sql`.
Tests : `scripts/test-commercial-consent-postgres.mjs`, `src/test/commercial-email-consent.test.tsx`, nouveaux `commercial-consent-confirmation.test.ts` et `commercial-consent-page.test.ts`, workflow `.github/workflows/consent-confirmation.yml`.
Références générées par les scripts du dépôt, uniquement si leur contenu change.

## Preuves de développement

Baseline : 20 tests locaux réussis. Tests du nouveau handler/template d’abord rouges (module absent), puis 15 réussis. Trois cas UI pending/confirmation/échec d’abord rouges, puis 12 tests UI réussis. Page statique d’abord absente (rouge), puis trois tests DOM réussis. Les réponses réseau sont simulées : aucun envoi réel ni signature réelle.
La validation PostgreSQL 17 et la CI finale sont les portes de livraison ; le plan ne vaut pas attestation de leur réussite.
