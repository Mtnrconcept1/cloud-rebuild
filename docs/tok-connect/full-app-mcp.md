# TOK Connect Full App MCP (surface historique interne)

Cette Edge Function conserve une surface de catalogue et de preview interne. Elle ne doit plus etre enregistree comme second connecteur ChatGPT: deux serveurs publics divergents rendent la decouverte, l'authentification et le support ambigus.

L'unique endpoint canonique ChatGPT est:

```txt
https://www.thetok.ch/mcp
```

La fonction historique reste, si necessaire, un detail d'implementation interne:

```txt
tok-connect-full-app-mcp
```

## Objectif

Le catalogue historique permet de decrire les principaux espaces TOK: client, restaurateur, admin, commercial, livreur et support. Les capacites destinees a ChatGPT doivent etre consolidees dans `tok-connect-mcp`, derriere `/mcp`, avant d'etre considerees comme supportees.

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

Sans OAuth Supabase natif, les outils retournent uniquement des données sandbox ou des plans de parcours. Le flux custom `client_credentials` est legacy B2B et ne constitue pas l'authentification ChatGPT.

## Déploiement Supabase interne

Ne pas deployer cette fonction sur un autre projet Supabase. Le projet declare dans `supabase/config.toml` est:

```txt
wwcrtyoueexyxkkikaos
```

Un redeploiement separe ne doit avoir lieu que si la compatibilite interne est encore intentionnellement maintenue. Il ne publie pas un second contrat MCP:

```bash
supabase functions deploy tok-connect-full-app-mcp \
  --project-ref wwcrtyoueexyxkkikaos \
  --no-verify-jwt
```

`verify_jwt = false` signifie que toute authentification doit etre geree et testee dans le handler. Ce parametrage ne rend jamais la fonction publique par defaut.

## Configuration dans ChatGPT

Dans la configuration ChatGPT / MCP, utiliser uniquement:

```txt
https://www.thetok.ch/mcp
```

Activer le serveur OAuth 2.1 natif Supabase, la page `/oauth/consent`, DCR ou le client public pre-enregistre, puis verifier la callback exacte fournie par ChatGPT. Le serveur custom `tok-connect-oauth` en `client_credentials` reste reserve aux backends partenaires B2B.

Le contrat protocolaire courant est MCP `2025-11-25`, avec negociation des versions de compatibilite declarees. L'endpoint public doit aussi exposer `/.well-known/oauth-protected-resource` et pointer vers l'Authorization Server Supabase.

## Validation

Les tests historiques restent disponibles pour verifier le catalogue interne:

```bash
corepack pnpm test -- tok-connect-full-app-mcp
```

Le test vérifie que la fonction est enregistrée, que les surfaces majeures de TOK sont présentes et que les actions à risque restent bloquées derrière un paquet de confirmation humaine.
