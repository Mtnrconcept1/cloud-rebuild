# TOK — Stripe Connect refuse la création de comptes (profil plateforme incomplet)

## Incident du 17 octobre 2026

Depuis le tableau de bord restaurateur, le bouton **Connecter mon compte Stripe** de Les Brasseurs renvoyait un message générique de paiement sur iPhone.

Trois refus réels sont visibles dans les audits Edge de production à **05:56:51, 05:56:56 et 05:57:50 UTC**. Le rôle du demandeur était **restaurateur**.

**Réponse de Stripe :** Please review the responsibilities of managing losses for connected accounts at https://dashboard.stripe.com/settings/connect/platform-profile.

L'échec se produit au moment de la création du compte Express, **avant** le Checkout client. La base de production ne référence aucun compte Stripe Connect pour Les Brasseurs.

## Action requise par l'administrateur de TOK

1. Ouvrir https://dashboard.stripe.com/settings/connect/platform-profile avec les accès au compte Stripe de la **plateforme TOK**, pas ceux d'un restaurant tiers.
2. Examiner les conditions de responsabilité en cas de soldes négatifs, litiges, remboursements et pertes des comptes connectés. **Ne pas accepter automatiquement ces engagements à la place d'un représentant habilité.**
3. Compléter le profil légal exigé par Stripe, ou contacter son support si aucune action n'est proposée.
4. Revenir dans TOK → Dashboard restaurant → Paiements Stripe Connect et relancer « Connecter mon compte Stripe » pour accomplir l'onboarding KYC du restaurant.
5. Vérifier ensuite details_submitted, charges_enabled, payouts_enabled et l'absence de requirements_due via le serveur.
6. Avant les premiers paiements clients Live, réaliser une recette Stripe Test isolée et réconcilier les commissions, transferts, ledgers et webhooks. L'activation globale du routage financier demeure bloquée jusqu'à validation.

**Attention :** avec les destination charges utilisées par TOK, la plateforme peut être responsable de certaines pertes et contestations. La vérification du profil Stripe est une décision juridique et financière, pas une simple correction technique.

## Correctif produit

Le backend convertit ce refus précis en code stable STRIPE_CONNECT_PLATFORM_PROFILE_REQUIRED avec HTTP 409 et sans exposer le message brut du fournisseur.

L'interface restaurant présente une explication persistante et un lien HTTPS statique vers Stripe Dashboard, sans redirection automatique provenant d'une erreur. Elle traite également le cas ready=true sans URL pour un compte déjà connecté.

Le correctif ne change aucune permission, clé, donnée bancaire, responsabilité, configuration Stripe ni règle de paiement.

## Contrôles

Tests ciblés avec le véritable gestionnaire Edge et Stripe/DB simulés, absence de mutation après erreur, statut/code stables et message UI compréhensible. Valider lint, typecheck, build, CI, puis comparer la version déployée. Aucun test en production ne doit créer un compte Connect tant que la décision de la plateforme manque.

Retour arrière : revenir sur la PR ciblée.
