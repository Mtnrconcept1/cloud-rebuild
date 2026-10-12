# TOK — Litiges, Stripe Connect et responsabilités (12 octobre 2026)

**Périmètre :** application TOK, clients, restaurants, support, administration et comptabilité.
**Statut :** procédure opérationnelle à valider avec un juriste suisse et le prestataire d'assurance. Ce document n'est pas un avis juridique.

## Modèle économique autorisé

| Flux | Bénéficiaire commercial | Part TOK |
| --- | --- | --- |
| Réservation ordinaire facturable | Restaurant (prestation), TOK (service de réservation) | 5 CHF par réservation facturable selon contrat |
| Zéro Attente | Restaurant (repas) | 10 % de la base commissionnable |
| Commandes | Restaurant (repas) | 10 % de la base commissionnable |
| Abonnements | TOK | Prix d'abonnement applicable |
| Crédits IA | TOK | Prix du crédit applicable |

TOK n'est pas propriétaire du montant brut du repas. La qualification juridique de « merchant of record », les obligations TVA, remboursements et contestations dépendent du contrat et du montage Stripe réellement appliqué. Les pourboires et montants pass-through ne doivent pas subir la commission sur la même assiette que les repas, conformément aux règles de calcul serveur en place.

**Attention :** le checkout existant utilise des *destination charges*. Le fait que le montant du repas soit finalement transféré ne supprime pas les risques de remboursement, de contestation et de solde négatif supportés par la plateforme. Ne jamais présenter cette architecture comme l'absence complète d'encaissement de fonds par TOK.

## Constat sur la production au 12 octobre 2026

- Projet Supabase : `Tok` (`wwcrtyoueexyxkkikaos`).
- `finance_runtime_config.connect_routing_enabled = false`.
- Aucun restaurant n'avait `stripe_account_id` renseigné ; aucun compte restaurant n'était prêt pour les paiements et virements Connect.
- Stripe « Tok » en mode réel : aucun compte connecté renvoyé par la liste, trois PaymentIntents visibles.
- La base enregistrait 22 lignes `payment_transactions`, zéro `financial_ledger`, zéro `support_incidents` et zéro `refund_operations` au moment du contrôle.

**Ne pas activer `connect_routing_enabled` tant que les comptes restaurants, leur vérification KYC, leurs capacités `charges_enabled` / `payouts_enabled`, et le rapprochement du compte Stripe production ne sont pas validés.** Vérifier aussi les autres environnements Stripe / modes de paiement si nécessaire.

## Processus de sinistre

1. **Recevoir.** Le client ou le restaurateur ouvre un dossier via l'assistance ; un événement Stripe dispute lié à une commande produit un incident urgent automatiquement.
2. **Qualifier.** Identifier le paiement, le restaurant, la commande/réservation, la nature du litige et la date limite Stripe. Ne jamais faire confiance aux données client seules pour attribuer un débit.
3. **Préserver les preuves.** Historique de réservation, heure du service, validations, CGU acceptées, politique d'annulation publiée, échanges et justificatifs datés. Stocker les preuves dans un espace privé à accès contrôlé. Éviter de collecter des données bancaires complètes.
4. **Décider.** Proposer une solution et obtenir l'accord de la personne autorisée pour toute action financière. Le traitement d'une dispute ne donne pas automatiquement droit à débiter le restaurant ou le client.
5. **Exécuter.** Procéder au remboursement via le flux idempotent existant, ou produire les justificatifs requis dans Stripe ; ne jamais effectuer un second paiement ou remboursement manuellement hors procédure.
6. **Auditer.** Enregistrer les références Stripe, qui a validé, le motif, les montants, le résultat, et le rapprochement financier. Conserver les éléments selon la politique de rétention légale applicable.

### Priorités

- **Critique (immédiat) :** fraude présumée, contestation Stripe avec échéance imminente, fonds dirigés vers le mauvais bénéficiaire, paiement doublé, suspicion de fuite de données.
- **Haute (jour ouvrable) :** remboursement bloqué, commande payée sans prestation, désaccord sur une pénalité d'annulation.
- **Normale :** question de service ou justificatif complémentaire.

Ces délais sont des objectifs internes ; les délais de réponse Stripe affichés sur chaque dispute prévalent. Toute chargeback doit être assignée et suivie par un responsable.

### Cas non reliés à une commande

Le webhook enregistre la comptabilisation du litige. Le nouveau dossier automatique n'est créé que si la transaction permet de confirmer la commande et le restaurant côté serveur. Les contestations d'abonnements / crédits IA et événements sans rapprochement commande nécessitent un canal de surveillance séparé et un contrôle quotidien manuel tant qu'il n'existe pas d'automatisme dédié. Ne jamais lier arbitrairement à un restaurant.

## Validations contractuelles et assurances à effectuer

- CGU clients : rôle de TOK, prix, mandat, annulations, no-show, remboursement, procédure de plainte, données personnelles, consentement à l'empreinte bancaire.
- Contrats restaurateurs : identité du vendeur, conditions de service, attribution des frais, chargebacks, preuves, délais de reversement et soldes négatifs, droit de compensation et conditions de suspension.
- Mentions financières : afficher explicitement les 5 CHF de réservation facturable et 10 % Zéro Attente/commandes, sans double facturation, en tenant compte des paramètres de TVA et du contrat signé.
- Vérification juridique suisse par avocat spécialisé en plateformes, obligations consommateurs et LPD ; vérifier les obligations liées à la réglementation des paiements selon le modèle réel.
- Demander des devis pour RC professionnelle/exploitation, cyber, protection juridique et les couvertures d'interruption d'activité ; vérifier franchises, plafonds et exclusions (fraude interne, amendes, chargebacks, remboursements).
- Définir un responsable support, un responsable financier validant les remboursements, et une personne chargée de surveiller les échéances de contestation.
- Ne pas appliquer les pénalités d'annulation et les empreintes sans règles contractuelles explicites, mécanisme de consentement, preuve et revue juridique.

## Contrôles techniques avant activation Connect

- Comparer Stripe `acct_...` côté production avec la configuration runtime de toutes les fonctions Edge.
- S'assurer que chaque restaurant encaissant est authentifié et dispose d'un compte connecté propre, actif et vérifié ; ne jamais rediriger vers un compte global de test.
- Vérifier l'idempotence `checkout/session/payment_intent`, les webhooks et le rapprochement `payment_transactions` / `financial_ledger` / Stripe.
- Tester en sandbox les cas : paiement normal, MIAMZ à 0 CHF, remboursement partiel/total, retrait du transfert, litige, doublon de webhook et litige non lié à une commande.
- Examiner les permissions d'accès support et comptabilité (RLS, journal d'audit, séparation clients/restaurants/admin).
- Préparer un rollback Git de la modification du webhook ; ne pas modifier manuellement les écritures historiques ni le routage des paiements en production.

**Sans comptes Connect vérifiés, les paiements restaurant de montant positif doivent rester bloqués plutôt qu'être détournés vers TOK.**
