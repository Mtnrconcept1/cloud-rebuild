# IA dans la démonstration commerciale

Les trois interfaces embarquées utilisent les vrais composants Studio Marketing,
Assistant IA et Chat IA. Quand une interface est ouverte depuis
`/commercial/demo-live`, leurs écritures sont redirigées vers un domaine Supabase
isolé et gratuit.

## Garanties

- aucune requête vers une Edge Function IA payante ;
- aucun débit de crédit TOK et aucun événement de facturation ;
- aucune écriture dans `ai_conversations`, `ai_messages`, `restaurant_media`,
  `storage.objects` ou les tables comptables de production ;
- accès limité au commercial propriétaire de la session ou à un administrateur ;
- disponibilité pilotée par les flags admin `dashboard-advisor`,
  `dashboard-photos` et `ai_support_chat` ;
- messages et visuels rattachés à leur session Démo, invisibles dans la nouvelle
  session après réinitialisation et supprimés en cascade lors de sa purge.

## Tables Démo

- `commercial_demo_ai_conversations`
- `commercial_demo_ai_messages`
- `commercial_demo_ai_generations`

Le navigateur dispose uniquement de `SELECT` sous RLS. Les écritures passent par
les RPC `commercial_demo_ai_respond`, `commercial_demo_ai_generate_visual` et
`commercial_demo_ai_archive_conversation`, qui revalident la session, le rôle et
le flag actif.

## Moteur sans coût

`tok-demo-zero-cost-v1` compose les réponses à partir du restaurant simulé, de la
commande, des réservations et des flags actifs. Le Studio Marketing produit un
SVG responsive à partir du brief et de l'identité du restaurant simulé. Le SVG
est échappé côté PostgreSQL, stocké dans la table Démo puis affiché comme URL
`data:image/svg+xml` ; aucun fichier n'est envoyé dans le Storage de production.

Ollama peut continuer d'alimenter les traitements locaux de l'application, mais
la démonstration commerciale ne dépend pas de l'ordinateur du commercial : le
fallback gratuit reste donc disponible même si Ollama ou le worker local est
hors ligne.

## Vérification avant déploiement

1. Exécuter `src/test/commercial-demo-ai-workspaces.test.ts`.
2. Vérifier que la migration crée les trois tables avec RLS et les grants
   minimaux.
3. Ouvrir le Studio Marketing depuis la fenêtre Restaurateur et générer un
   visuel ; le résultat doit indiquer `0 crédit`.
4. Envoyer un message dans l'Assistant puis dans le Chat IA depuis les fenêtres
   Démo.
5. Confirmer qu'aucune ligne n'a été ajoutée aux tables IA ou média de
   production.
