# Simulateur de paiement — démonstration commerciale TOK

## Objectif

Le domaine `commercial.thetok.ch` présente le parcours complet de commande sans dépendre d’un compte Stripe ni d’une clé Stripe Test.

Quand le commercial clique sur **Simuler le paiement accepté** :

1. la fonction `commercial-demo-checkout` vérifie la session Démo et le restaurant partagé ;
2. elle refuse de fonctionner hors du projet Supabase Démo dédié ;
3. elle calcule une référence `demo_sim_…` déterministe ;
4. la RPC `commercial_demo_confirm_simulated_payment` verrouille la commande ;
5. la commande passe de `awaiting_payment` à `restaurant_received` ;
6. le statut interne devient `test_paid` pour préserver la machine métier existante ;
7. un événement Realtime et les notifications des dashboards sont créés ;
8. le restaurateur peut accepter/préparer la commande et le livreur poursuit la livraison.

## Garanties

- aucun appel à Stripe ;
- aucune clé Stripe injectée dans le projet Démo ;
- aucune session Checkout, aucun PaymentIntent et aucun webhook fournisseur ;
- aucune écriture dans les commandes, paiements, factures ou ledgers de production ;
- aucune commission, TVA, recette ou payable créé ;
- confirmation idempotente : un double clic produit la même référence et le même résultat ;
- RPC d’écriture accessible uniquement au `service_role` ;
- restaurant, commercial, session, commande et montant relus côté serveur ;
- OpenAI reste réel et exclusivement côté serveur.

## Exploitation

La variable non sensible `DEMO_PAYMENT_MODE=simulated` documente le comportement du projet Démo. Le déploiement n’exige ni `STRIPE_SECRET_KEY_TEST` ni secret de webhook Stripe.

Le simulateur doit rester limité au projet `TOK Commercial Demo`. La production et ses fonctions de paiement Stripe conservent leurs propres contrôles et ne partagent aucune donnée avec ce parcours.
