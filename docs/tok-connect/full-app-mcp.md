# TOK Connect Full App MCP

Cette Edge Function expose une surface MCP dédiée pour rendre toute l'application TOK utilisable depuis ChatGPT en mode contrôlé.

Endpoint prévu :

```txt
https://wwcrtyoueexyxkkikaos.functions.supabase.co/tok-connect-full-app-mcp
```

Fonction Supabase :

```txt
tok-connect-full-app-mcp
```

## Objectif

Le MCP complet permet à ChatGPT de naviguer dans les principaux espaces TOK : client, restaurateur, admin, commercial, livreur et support.

Il ne remplace pas les Edge Functions métier existantes. Il sert de couche d'orchestration sécurisée pour :

- découvrir les modules TOK disponibles ;
- ouvrir une console ChatGPT Apps avec l'interface visuelle TOK ;
- planifier un parcours applicatif ;
- prévisualiser les parcours client, restaurateur, admin et support ;
- lire des snapshots restaurant ou disponibilité avec OAuth quand disponible ;
- préparer un paquet de confirmation humaine avant toute action sensible ;
- auditer le risque d'une action demandée.

## Outils MCP exposés

```txt
discover_tok_application
open_tok_application_console
plan_tok_application_route
preview_tok_client_journey
preview_tok_restaurant_journey
preview_tok_admin_journey
read_tok_restaurant_snapshot
read_tok_availability_snapshot
prepare_tok_human_confirmation_packet
audit_tok_action_risk
```

## Modules couverts

La fonction couvre les modules suivants : accueil/recherche, fiche restaurant, réservation, Zéro Attente, Table du Chef, commande/panier/checkout, Multi-resto, MIAMZ, TOK One, compte client, dashboard restaurateur, pilotage de service, plan de salle IA, menus/catalogue, commandes restaurant, réservations restaurant, crédits TOK, Studio Marketing, PhotoPro, campagnes sponsorisées, ventes flash, actualités, CRM clients, statistiques, facturation, abonnement restaurateur, espace commercial, portail livreur, supervision admin et support/litiges.

## Règles de sécurité

La console MCP ne doit jamais exécuter directement :

- une réservation définitive ;
- une commande définitive ;
- un paiement Stripe ;
- un remboursement ;
- une publication ;
- une génération IA payante ;
- un débit de crédits TOK ;
- une mutation admin ;
- une suppression ou modification sensible de compte.

Ces actions doivent passer par les flux TOK existants, avec authentification, droits restaurant/admin, RLS, idempotence, journalisation et confirmation humaine.

Sans OAuth TOK Connect, les outils retournent uniquement des données sandbox ou des plans de parcours.

## Déploiement Supabase

Ne pas déployer cette fonction sur un autre projet Supabase. Le projet déclaré dans `supabase/config.toml` est :

```txt
wwcrtyoueexyxkkikaos
```

Commande de déploiement :

```bash
supabase functions deploy tok-connect-full-app-mcp \
  --project-ref wwcrtyoueexyxkkikaos \
  --no-verify-jwt
```

`verify_jwt = false` est volontaire : l'authentification est gérée dans le handler MCP, comme les autres fonctions `tok-connect-*`.

## Configuration dans ChatGPT

Dans la configuration de l'application ChatGPT / MCP, utiliser :

```txt
https://wwcrtyoueexyxkkikaos.functions.supabase.co/tok-connect-full-app-mcp
```

Conserver l'OAuth TOK Connect existant pour obtenir les scopes réels. Les outils sans OAuth restent en mode preview/sandbox.

## Validation

Tests ajoutés :

```bash
npm test -- tok-connect-full-app-mcp
```

Le test vérifie que la fonction est enregistrée, que les surfaces majeures de TOK sont présentes et que les actions à risque restent bloquées derrière un paquet de confirmation humaine.
