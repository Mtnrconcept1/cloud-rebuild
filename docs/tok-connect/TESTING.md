# Recette TOK Connect dans ChatGPT

## Connexion vérifiée le 16 octobre 2026

Le plugin personnel historique utilisait `tok-connect-oauth/authorize`, destiné au
B2B. La reconnexion échouait avec `Missing TOK Connect scope: openid, email,
profile`. Ne pas ajouter ces scopes d'identité au client B2B pour contourner le
problème.

Le nouveau plugin personnel **TOK Connect — Test** utilise le contrat public :

- MCP : `https://www.thetok.ch/mcp`.
- Serveur OAuth : `https://wwcrtyoueexyxkkikaos.supabase.co/auth/v1`.
- Autorisation : `/oauth/authorize`, token : `/oauth/token`, DCR :
  `/oauth/clients/register`, relativement au serveur OAuth.
- Scopes : `openid`, `email`, `profile`, PKCE S256, client public sans secret.

La création DCR, la connexion du compte et un consentement Supabase ont été
vérifiés. Une recherche depuis une conversation ChatGPT a affiché le vrai widget
avec trois pizzerias et deux restaurants de sushi à Genève. Un appel authentifié
`tok_list_capabilities` depuis le connecteur réinstallé a renvoyé `ok: true`.
Ces constats ne prouvent ni une réservation ni un paiement.

Le nom « Test » désigne la recette du connecteur : son endpoint reste celui de
production. Les lectures peuvent utiliser le vrai catalogue et le compte connecté.
Ce nom n'active pas Stripe Test et ne crée pas une base transactionnelle isolée.

## Corrections de continuité OAuth

- Quand Supabase envoie `authorization_id` directement à `/auth`, reconstruire une
  continuation locale vers `/oauth/consent`, après validation de l'identifiant.
- Reprendre le consentement avant la redirection client vers `/coming-soon`.
- Permettre cette page précise dans la barrière de lancement. Les autres pages
  clients, les permissions serveur, les RLS et les contrôles métier restent actifs.

Les nouveaux tests reproduisent les blocages avant correction. La configuration
Supabase devrait cibler `/oauth/consent` comme Authorization Path ; la compatibilité
avec `/auth?authorization_id=...` évite de perdre une demande déjà initiée.

## Diagnostic réseau reproductible

```powershell
node scripts/tok-connect-smoke.mjs
pnpm test -- tok-connect auth-post-login-routing launch-state launch-edge-access launch-provider
pnpm typecheck
pnpm lint
```

Le smoke vérifie six contrats : métadonnées OAuth/OIDC, initialisation, catalogue,
ressource HTML, refus de données de compte sans session et sandbox sans mutation.
Il n'accepte aucun jeton, refuse les redirections HTTP, fixe les destinations et
n'enregistre aucun client OAuth. Ses deux seuls appels d'outil sont
`tok_list_capabilities` sans authentification et `open_application_sandbox` en
`safe_preview`. Un refus métier JSON-RPC ou HTTP ne peut pas devenir un succès.

Le rapport distingue explicitement les vérifications non effectuées. Une sortie
verte du smoke ne valide pas le paiement, le consentement ChatGPT ou le refresh.

## Aperçu navigateur avec données fictives

Utiliser les dépendances du lockfile et des variables publiques fictives :

```powershell
pnpm install --frozen-lockfile --ignore-scripts
$env:VITE_SUPABASE_URL='https://example.supabase.co'
$env:VITE_SUPABASE_PUBLISHABLE_KEY='ci-public-placeholder'
pnpm dev --host 127.0.0.1 --port 5187 --strictPort
```

Ouvrir `/tok-connect/mcp-widget?mode=sandbox`. Le paramètre force les données
fictives, sans tentative préalable de lecture du catalogue Supabase. Le clic sur
une carte utilise aussi les fiches fictives. Le reste de la coque applicative
peut tenter ses requêtes habituelles vers le fournisseur public fictif ; aucune
clé ni donnée de production n'est nécessaire à cet aperçu.

Vérifier les cinq cartes, l'ouverture d'une fiche, les créneaux fictifs, le retour
à la sélection, une seconde recherche et le comportement sur petit écran. Le
bouton de réservation ouvre le formulaire du widget, mais l'hôte de prévisualisation
refuse explicitement les outils de commerce. Il ne réserve pas de table et ne
déclenche pas Stripe ; une action refusée doit sortir de son état de chargement.

## Recette ChatGPT

Créer une conversation en sélectionnant explicitement **TOK Connect — Test** :

1. « Affiche 3 pizzerias et 2 restaurants de sushi à Genève. Aucune réservation,
   commande, campagne ni paiement. » Vérifier le widget et les cinq cartes.
2. Ouvrir une carte : vérifier les informations issues de `get_restaurant_details`.
3. « Ouvre la sandbox réservation, commande, Zéro Attente, Multi-resto et La Tok
   d'Or, sans écriture. » Vérifier `mutation_allowed: false`.
4. Lire les capacités authentifiées. Vérifier l'absence de demande de connexion
   supplémentaire, sans exécuter les capacités de mutation décrites par le catalogue.

## Outils transactionnels client

L'intégration commerce isolée de la PR #869 ajoute neuf outils au catalogue
initial de 27 outils. TOK Équipe reste hors périmètre. Quatre mutations précises
sont accessibles uniquement au widget : `tok_book_table`,
`tok_cancel_my_reservation`, `tok_checkout_customer_cart` et
`tok_cancel_cart_payment_attempt`. Les mutations génériques restent exclues.

Les écritures exigent un JWT utilisateur, le rôle client, un accord explicite et
une clé d'idempotence. L'historique reste filtré par propriétaire, même pour un
compte possédant aussi des rôles administratifs. Le restaurant doit être actif,
hors démo, avec `tok_connect_mcp_enabled=true` ; ne pas changer ces flags pour
contourner un refus. Les fonctions métier existantes recontrôlent les services,
la disponibilité, les prix et la garantie bancaire.

Pour une recette réelle autorisée : ouvrir la fiche du bon établissement,
sélectionner date/heure/convives, lire la garantie éventuelle, puis confirmer dans
le widget. Vérifier l'identifiant et la réservation persistée avec le même compte.
Rejouer la même clé ne doit pas créer de seconde réservation. Après accord de
l'utilisateur, annuler via « Mes tables » et vérifier le statut persistant.
Le test de référence demandé est La Gazelle d'Or, rue de Lyon 55, le 18 octobre
2026 à 19 h pour deux personnes, avec annulation après vérification. Ce protocole
ne vaut pas preuve d'exécution : conserver séparément les résultats observés.

Une URL Checkout ou une garantie à finaliser n'est jamais une réservation
confirmée ou une commande payée. En cas de réponse incertaine, garder la tentative
et sa clé ; consulter l'historique/statut sans créer une nouvelle tentative.

## Paiements restant à valider

Le projet Supabase **TOK Commercial Demo** existe, mais son existence et ses
tables ne prouvent pas un checkout client MCP en mode Stripe Test. Avant toute
recette transactionnelle, il faut un endpoint relié à une base de test, des
restaurants et comptes fictifs, des clés Stripe Test côté serveur et un webhook
de test vérifié. Le serveur doit refuser un mode live, y compris en cas de
mauvaise configuration. Ne jamais transformer le checkout live existant en test
avec un simple paramètre contrôlé par le widget.

La recette complète doit ensuite couvrir réservation/annulation, commande,
Zéro Attente, recalcul serveur, montants nuls, double clic, idempotence, paiement
refusé, retour navigateur absent, webhook signé et réconciliation. Multi-resto et
La Tok d'Or exigent leurs propres parcours, pas une assimilation au simple
emporter. Aucun paiement ou booking réel n'a été créé dans cette intervention.

Références : [connexion et tests OpenAI](https://developers.openai.com/plugins/deploy/connect-chatgpt),
[OAuth Supabase](https://supabase.com/docs/guides/auth/oauth-server/getting-started).

Retour arrière : revenir sur le commit du correctif pour restaurer le code et
retirer le mode d'aperçu explicite. Déconnecter le plugin de recette si nécessaire,
sans supprimer les données métier ni modifier les migrations historiques.
