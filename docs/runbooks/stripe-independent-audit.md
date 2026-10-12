# Contrôle indépendant Stripe / TOK (lecture seule)

Ce contrôle est distinct du rapprochement interne de `/admin/compta`. Il consulte directement les PaymentIntents réussis de **chaque compte Stripe live explicitement autorisé**, puis rapproche leurs identifiants des tables `payment_transactions` et `payment_attempts` Supabase.

## Prérequis et exécution

Dans un environnement de confiance, fournir les variables **hors du dépôt** :

- `STRIPE_AUDIT_ACCOUNTS` : JSON `[{"accountId":"acct_...","secretKey":"sk_live_..."}]` contenant **tous** les comptes live TOK approuvés, y compris tout éventuel compte dédié à TOK One. Ne jamais committer ces valeurs.
- `SUPABASE_URL` : URL du projet Supabase TOK.
- `SUPABASE_SERVICE_ROLE_KEY` : clé privilégiée, **uniquement en environnement serveur protégé**. Préférer à terme un rôle Postgres dédié en lecture seule.
- `AUDIT_DAYS` : fenêtre, 7 par défaut, entre 1 et 90 jours.

Exécuter `node scripts/stripe-financial-reconciliation.mjs`.

Codes retour : 0 = aucune anomalie parmi les paiements examinés ; 2 = anomalie détectée ; 1 = configuration invalide ou vérification incomplète. Tout échec doit produire une alerte, jamais un statut « conforme ».

`node --test scripts/stripe-financial-reconciliation.test.mjs` exécute les tests sans accès réseau ni secrets. Une marge d'une heure avant la fin du contrôle permet aux événements asynchrones de parvenir à TOK.

## Alertes et limites de sécurité

Surveiller `missing_internal_record`, `missing_successful_transaction` et `amount_or_currency_mismatch`. Examiner d'abord les encaissements manuels légitimes, abonnements et anciens parcours avant de conclure à une fraude. Ne jamais enregistrer de coordonnées client, de clés Stripe ni de données carte dans les alertes.

La liste de comptes Stripe doit provenir d'un registre approuvé **hors du contrôle du prestataire comptable**. Un compte frauduleux non déclaré ne peut pas être découvert depuis une simple liste de comptes approuvés. Pour le détecter, comparer également les parcours clients, les reçus bancaires et les réservations enregistrées avant la redirection de paiement.

Il reste indispensable de :
1. Configurer un exécutant planifié fiable et ses identifiants dans un coffre à secrets ; envoyer les alertes au propriétaire de TOK via un canal indépendant.
2. Rapprocher séparément les virements bancaires, remboursements, frais, Stripe Connect et relevés développeur.
3. Ajouter une liste blanche **serveur** des destinations Stripe à tous les parcours de création de paiement, après inventaire des clés de production.
4. Bloquer administrativement les changements d'IBAN, de commissions et de bénéficiaires sans double approbation.
5. Conserver des journaux de tentatives pré-paiement dans une infrastructure indépendante et non modifiable par la fiduciaire.

**Ne pas déclencher automatiquement ce script sans avoir inventorié les comptes Stripe autorisés et vérifié la configuration réelle des variables d'environnement.** Le script est un premier garde-fou auditable, pas l'achèvement du dispositif antifraude.
