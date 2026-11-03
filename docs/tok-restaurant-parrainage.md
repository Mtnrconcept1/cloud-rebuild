# TOK — Programme de parrainage restaurateurs

## Offre

Un restaurant TOK actif partage son code depuis le dashboard restaurateur → Parrainage. Un nouveau restaurant qui s'inscrit avec ce code, est validé et paie son premier abonnement peut lui faire gagner un avoir équivalent à un mois de sa propre formule.

La période de vérification est de 30 jours après le premier paiement. L'avoir est crédité sur le solde Stripe du parrain et s'applique aux factures ultérieures. Pour les abonnements annuels, il ne prolonge pas automatiquement la date d'échéance : il s'utilise à la prochaine facture. Les parrainages sont cumulables, sans plafond. Aucun versement en espèces ou réduction des commissions.

Inéligibles : même propriétaire ou même numéro d'identification commerciale/fiscale, ancien abonnement, site annuaire, site démonstration, inscription non payée, remboursement ou établissement inactif.

## Parcours et sécurité

- Le dashboard donne un lien et un QR code individuels, le partage par WhatsApp et email, des statistiques et l'historique.
- Le code se transmet dans les métadonnées de l'inscription restaurateur et dans son dossier de reprise sécurisé.
- La migration tok_restaurant_referrals crée les codes, un registre avec un filleul unique, les déclencheurs d'inscription et de facture payée, les RPC privés et le suivi admin.
- Les tables sont sous RLS sans accès public ou utilisateur direct ; seules les RPC vérifient la propriété ou le rôle admin.
- Le worker horaire stripe-subscription-reconcile est responsable des crédits Stripe. Aucun secret Stripe ne passe dans le navigateur.
- Chaque avoir correspond au tarif mensuel réel du parrain enregistré dans son abonnement en centimes CHF.

## Protection financière et traitement des anomalies

Un crédit en traitement ne repasse jamais directement au statut qualifiant. Le worker vérifie d'abord toutes les transactions de solde client Stripe du client et la référence tok_restaurant_referral_id ; les réémissions incertaines sont bloquées si cet historique ne peut pas être obtenu. Les demandes de refus admin ne peuvent intervenir qu'avant la phase de traitement financier.

Une situation en traitement depuis plus d'une journée apparaît dans les alertes du tableau admin. Si une facture est remboursée après l'octroi du crédit, le support doit décider de sa régularisation comptable (pas d'annulation automatique d'un avoir déjà appliqué).

## Mise en production / retour arrière

1. Contrôler et appliquer la nouvelle migration sur le projet Supabase TOK approprié, après validation de la PR.
2. Déployer le front et la fonction Edge mise à jour avec le pipeline GitHub du projet ; vérifier le cron horaire existant.
3. Tester en environnement isolé le cycle d'inscription, les droits d'accès et les crédits Stripe test, sans argent réel.
4. Surveiller le journal des parrainages et les erreurs du worker.

En cas d'incident, désactiver le nouveau parcours et revenir à la révision précédente du front et de l'Edge. Ne supprimer ni registre financier ni avoir Stripe avant rapprochement complet.