# Paiement Stripe TEST du scénario commercial

Le scénario multi-espace commercial utilise exclusivement l'Edge Function
`commercial-demo-checkout`. Il ne doit jamais appeler `create-checkout`, écrire
dans `orders`, produire une facture, un ledger ou déclencher un virement.

En production, ce parcours est servi uniquement depuis
`https://commercial.thetok.ch`. Les requêtes et les URL de retour provenant de
`thetok.ch`, `www.thetok.ch`, `app.thetok.ch`, `admin.thetok.ch` ou d'un aperçu
Vercel sont refusées. `localhost` et les domaines `.test` restent acceptés
uniquement hors runtime Supabase de production.

## Secret requis

Configurer **uniquement côté Supabase Edge Functions** :

```text
STRIPE_SECRET_KEY_TEST=rk_test_...   # recommandé
```

Une clé `sk_test_...` est également acceptée. Toute clé live, publishable ou
absente provoque respectivement `INVALID_TEST_STRIPE_KEY` ou
`DEMO_STRIPE_NOT_CONFIGURED`. La clé test existante
`STRIPE_TOK_ONE_TEST_SECRET_KEY` peut servir de repli afin d'activer la démo
sans nouvelle configuration ; son préfixe test est contrôlé de la même manière.
Pour les installations historiques, `STRIPE_TOK_ONE_SECRET_KEY` est également
acceptée uniquement si sa valeur porte réellement un préfixe `sk_test_` ou
`rk_test_`. Une valeur live sous ce nom est ignorée et provoque le blocage sûr
du paiement de démonstration.
Il n'existe aucun fallback vers `STRIPE_SECRET_KEY`,
`STRIPE_SECRET_KEY_LIVE`, une clé Tok One live ou Stripe Connect.

Pour une clé restreinte Stripe, accorder seulement les permissions nécessaires
à la création/lecture de Checkout Sessions et à la lecture des Payment Intents.
Ne jamais créer de variable `VITE_STRIPE_SECRET_KEY_TEST` : une variable `VITE_`
est intégrée au JavaScript public.

Provisionnement initial (depuis un poste autorisé, après avoir chargé la valeur
dans une variable d'environnement sans l'écrire dans le dépôt ou les logs) :

```bash
supabase secrets set "STRIPE_SECRET_KEY_TEST=${STRIPE_SECRET_KEY_TEST}" --project-ref wwcrtyoueexyxkkikaos
```

Le secret homonyme doit aussi être créé dans l'environnement GitHub
`production`, puis transmis tel quel au job `deploy_supabase` et autorisé par
`scripts/write-supabase-secrets-env.mjs`. La valeur ne doit jamais être ajoutée
au build Vercel/frontend.

## Contrat Edge Function

Toutes les requêtes sont des `POST` authentifiés avec le JWT Supabase courant.
Seuls les rôles `commercial` et `admin` sont acceptés. Pour un commercial, la
commande, la session et le restaurant doivent appartenir à son mapping
`commercial_demo_accounts` actif. Le restaurant doit être non publié,
`is_demo=true`, sans compte Stripe Connect.

Création :

```json
{
  "action": "create",
  "demo_restaurant_id": "uuid",
  "demo_session_id": "uuid",
  "return_url": "https://commercial.thetok.ch/commercial/demo-live"
}
```

Réponse :

```json
{
  "checkout_url": "https://checkout.stripe.com/...",
  "stripe_session_id": "cs_test_...",
  "mode": "test",
  "demo_order_id": "uuid",
  "demo_session_id": "uuid"
}
```

Le frontend n'envoie jamais de prix, devise, article ou identifiant de commande.
L'Edge Function lit le total autoritatif via
`commercial_demo_get_checkout_order(p_session_id)` et utilise une clé
d'idempotence dérivée de la commande/session démo.

Confirmation après retour de Stripe :

```json
{
  "action": "confirm",
  "demo_restaurant_id": "uuid",
  "demo_session_id": "uuid",
  "stripe_session_id": "cs_test_..."
}
```

L'Edge Function relit la Checkout Session sur Stripe, impose `livemode=false`,
`payment_status=paid`, compare le montant, la devise et toutes les métadonnées,
puis appelle elle-même la RPC service-role
`commercial_demo_confirm_test_payment`. Le navigateur n'a aucun droit direct
sur cette RPC. Une confirmation répétée de la même session est idempotente.
Le secret test n'est pas ajouté à la sélection des clés du webhook live : la
confirmation explicite est le seul chemin qui fait avancer la commande démo.

## Vérification avant activation

1. Sans secret : vérifier le code `DEMO_STRIPE_NOT_CONFIGURED`.
2. Avec une fausse clé live : vérifier `INVALID_TEST_STRIPE_KEY`.
3. Avec une clé test : créer une commande démo et payer avec une carte de test
   Stripe ; l'identifiant retourné doit commencer par `cs_test_`.
4. Vérifier que seule `commercial_demo_orders` passe à `test_paid` et
   `restaurant_received`.
5. Vérifier l'absence de nouvelle ligne liée à ce scénario dans `orders`,
   `payment_transactions`, `financial_ledger`, les factures et les payouts.
6. Rejouer `confirm` : le snapshot doit être identique, sans double transition.
7. Appeler un flux réel (`create-checkout`, `validate-order` ou
   `create-reservation`) avec le JWT commercial : vérifier un `403` avant toute
   écriture, notification ou création de session Stripe.
8. Vérifier qu'un compte commercial non administrateur ne lit aucun restaurant,
   menu, commande, réservation ou paiement réel et ne voit que son restaurant
   de démonstration associé.
