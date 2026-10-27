# Confirmation e-mail du consentement commercial — plan

**Objectif :** après signature en présence, envoyer à l’adresse renseignée la copie de l’autorisation avec sa signature et un bouton « JE CONSENS » ; aucune nouvelle éligibilité campagne avant confirmation explicite depuis la boîte mail.

**Base auditée :** c8b99a99c7601329fa70e97a8ad94fc25efe2bd6 ; PR #987 et #989 déjà fusionnées. Niveau 3 : données personnelles, permissions, preuve et envoi transactionnel.

## Périmètre et ordre

1. Préparer un environnement isolé à partir du dépôt réel. DNS GitHub indisponible dans le conteneur ; Vercel Sandbox refuse la création pour quota Hobby atteint. Les connecteurs GitHub, Supabase, Vercel et Resend sont accessibles. Un workflow temporaire en lecture seule sur cette branche fournit les objets Git publics et les dépendances gelées pour tests locaux, sans credentials ni variables de production. Retirer cet export avant livraison.
2. Conserver les migrations historiques. Créer avec la CLI une migration additive pour la confirmation, l’éligibilité en attente, les capacités confidentielles, les statuts d’envoi et l’audit. Préserver les preuves signées existantes et les oppositions.
3. Adapter `src/components/commercial/CommercialEmailConsentDialog.tsx` et `src/lib/commercialEmailConsent.ts` : signature enregistrée, envoi automatique demandé, statut d’attente, échec récupérable et actualisation. Le commercial ne reçoit jamais le jeton de confirmation.
4. Ajouter une fonction serveur dédiée et son contrat de test pour envoyer l’autorisation et la signature intégrée en pièce jointe CID via l’infrastructure Resend existante. Le destinataire et la signature proviennent exclusivement de la preuve en base. Idempotence, limites de répétition et enregistrement des erreurs.
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
