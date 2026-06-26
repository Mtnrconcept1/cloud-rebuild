# Audit codebase TOK - 2026-06-26

## Perimetre

Audit local du repository `cloud-rebuild-recovered` sur la branche `main`, avec focus securite, bugs applicatifs, logique metier, Supabase/RLS, Edge Functions, paiements, CI/deploiement, tests et etat Git non pousse.

Etat Git au moment de l'audit:

- Branche: `main`
- Upstream: `origin/main`
- Ecart commits: `+0 -0`
- Aucun commit local non pousse
- Worktree sale uniquement

## Fichiers modifies non pousses

Decision recommandee:

1. Ne pas pousser les fichiers TS/TSX listes par `git status` dans un commit fonctionnel.
2. Garder `public/sitemap.xml` seulement si l'objectif est bien de rafraichir les dates SEO au 2026-06-26.
3. Si l'on veut conserver la normalisation CRLF/LF, faire un commit technique separe du type `chore: normalize line endings`.
4. Sinon, nettoyer le worktree avant une feature/release pour eviter un diff illisible.

Constat:

- `git log origin/main..HEAD` est vide: aucun commit local a pousser.
- `git diff --ignore-space-at-eol --numstat` ne garde qu'un vrai diff: `public/sitemap.xml` avec `140 insertions / 140 deletions`.
- Les autres fichiers ne montrent que l'avertissement Git `CRLF will be replaced by LF`.
- `.gitattributes:1-8` impose `eol=lf` pour les fichiers texte, JS, TS, TSX, JSON, MD et env.
- `public/sitemap.xml:5` est passe de `2026-06-16` a `2026-06-26` pour les balises `lastmod`; aucune route sitemap n'a ete ajoutee ou supprimee.

## Commandes executees

Commandes OK:

- `pnpm lint`
- `pnpm audit --prod`
- `pnpm test`
- `pnpm run test:prod`
- `pnpm build`
- `pnpm run build:prod`
- `pnpm run release:readiness` en mode advisory
- `pnpm run scale:readiness`
- `pnpm run supabase:doctor`
- `pnpm run supabase:doctor:prod`

Commande KO:

- `pnpm exec tsc -p tsconfig.app.json --noEmit --pretty false`
- Resultat: 226 erreurs TypeScript dans 60 fichiers.

## Findings critiques et prioritaires

### P0 - Stripe webhook: risque de paiement traite comme reussi apres echec interne

Fichiers:

- `supabase/functions/stripe-webhook/index.ts:68`
- `supabase/functions/stripe-webhook/index.ts:567`
- `supabase/functions/stripe-webhook/index.ts:596`
- `supabase/functions/stripe-webhook/index.ts:1720`
- `supabase/functions/stripe-webhook/index.ts:1739`
- `supabase/migrations/20260412211629_stripe_webhook_idempotency.sql:7`

Probleme:

Le webhook Stripe insere l'evenement dans `stripe_webhook_events` avant les effets metier, puis capture les erreurs de traitement et retourne quand meme HTTP 200. Comme les doublons sont ensuite ignores, un echec apres le claim peut etre acquitte a Stripe sans retraitement fiable.

Impact:

- paiement confirme cote Stripe mais commande, abonnement, credit, facture ou campagne non finalise
- event Stripe rejoue mais ignore comme doublon
- reconciliation manuelle necessaire

Action recommandee:

- Remplacer la table d'idempotence simple par un etat `processing/succeeded/failed`.
- Retourner 500 tant qu'un event critique n'est pas finalise ou planifier un retry interne robuste.
- Ne marquer `succeeded` qu'apres tous les effets metier idempotents.
- Ajouter un test Edge Function simulant une exception apres le claim.

### P1 - TypeScript strict non execute en CI alors qu'il echoue localement

Fichiers:

- `package.json:10-31`
- `.github/workflows/ci.yml:41-48`
- `.github/workflows/deploy-production.yml:95-102`

Probleme:

La CI lance lint, tests et build, mais pas de `tsc --noEmit`. Localement, le typecheck pur echoue avec 226 erreurs. Vite peut builder malgre des incoherences de types, donc les erreurs Supabase/Edge responses peuvent passer en production.

Exemples detectes:

- `src/pages/RestaurantDetail.tsx:334`: cast invalide autour de `review_replies`
- `src/pages/Panier.tsx`: plusieurs champs `unknown` sur les reponses Edge Function
- `src/pages/dashboard/DashboardPlanSalle.tsx`: types floor plan/reservations incoherents
- `src/lib/featureCatalog.ts:952`: groupe `custom` incompatible avec `FeatureFlag`
- `supabase/functions/_shared/cors.ts`: types Deno inclus dans le mauvais contexte TS

Action recommandee:

- Ajouter un script `typecheck`.
- Corriger les erreurs par domaine, sans casts globaux.
- Ajouter `pnpm run typecheck` dans CI et deploy production avant build.

### P1 - Reponses aux avis restaurant non fiables cote fiche client

Fichiers:

- `src/pages/RestaurantDetail.tsx:96`
- `src/pages/RestaurantDetail.tsx:118`
- `src/pages/RestaurantDetail.tsx:323`
- `src/pages/RestaurantDetail.tsx:334`
- `src/pages/admin/AdminAvis.tsx:51`
- `src/pages/admin/AdminAvis.tsx:96`

Probleme:

La fiche restaurant typpe `review_replies` comme un tableau et appelle `.find()`. L'admin accepte deja les deux formes `ReviewReply[] | ReviewReply | null`, ce qui montre que la relation Supabase peut revenir comme objet unique ou tableau selon le schema/cache. Cela correspond au bug signale: reponse faite sur le dashboard restaurateur mais non affichee cote client.

Impact:

- reponse restaurateur invisible sur la fiche restaurant
- possible erreur runtime si `review_replies` est un objet

Action recommandee:

- Reprendre le normalizer de `AdminAvis` dans `RestaurantDetail`.
- Tester un avis avec une reponse restaurateur et une reponse admin.
- Verifier que seules les reponses publiees/autorisees sont visibles selon RLS.

## Findings importants

### P2 - Release readiness peut rester advisory en production

Fichiers:

- `.github/workflows/deploy-production.yml:72`
- `.github/workflows/deploy-production.yml:75`
- `scripts/release-readiness.mjs:25`
- `scripts/release-readiness.mjs:257`

Probleme:

Le workflow production depend de `vars.PRODUCTION_RELEASE_STRICT`. En local, `release:readiness` passe en advisory avec des warnings sur secrets live, mobile associations, Android signing, Firebase/service account, email et leaked-password protection.

Impact:

- deploy production possible meme si des garde-fous release sont seulement en warning

Action recommandee:

- Mettre `PRODUCTION_RELEASE_STRICT=true` dans l'environnement GitHub production.
- Garder `release:readiness:strict` comme gate explicite pour les releases critiques.

### P2 - Ciblage Supabase local ambigu

Fichiers:

- `supabase/config.toml:1`
- `scripts/supabase-target.mjs:8`
- `scripts/supabase-target.mjs:22`

Probleme:

`supabase/config.toml` pointe le projet production `wwcrtyoueexyxkkikaos`, alors que le doctor dev indique que les env dev pointent un autre projet. Le script `supabase:target:dev` existe et doit etre lance avant toute operation dev DB/deploy.

Impact:

- risque d'operation Supabase sur la mauvaise cible en local si un agent ou dev saute l'etape de target

Action recommandee:

- Toujours executer `pnpm run supabase:target:dev` avant commandes dev.
- Garder `pnpm run supabase:doctor:prod` obligatoire avant release.

### P2 - Secrets webhook TOK Connect stockes en clair

Fichiers:

- `supabase/migrations/20260626101032_tok_connect_foundation.sql:123`
- `supabase/migrations/20260626101032_tok_connect_foundation.sql:128`

Probleme:

`tok_connect_webhook_endpoints.signing_secret` est stocke en clair. Les OAuth client secrets sont hashes, mais les secrets de signature webhooks doivent rester utilisables pour signer, ce qui augmente le besoin de chiffrement ou de masquage serveur.

Impact:

- blast radius plus important en cas d'acces DB/service-role/admin trop large

Action recommandee:

- Chiffrer au repos via mecanisme dedie ou colonne protegee.
- Ne jamais exposer la colonne dans les selects admin/portal.
- Ajouter rotation forcee et audit de consultation/rotation.

### P2 - Plusieurs lockfiles suivis

Fichiers:

- `pnpm-lock.yaml`
- `package-lock.json`
- `bun.lockb`

Probleme:

Le projet et la CI utilisent pnpm, mais `package-lock.json` et `bun.lockb` sont aussi suivis. Cela ajoute du bruit et peut induire des audits/installations divergentes.

Action recommandee:

- Garder `pnpm-lock.yaml` comme source unique.
- Supprimer les lockfiles non utilises dans un commit dedie si aucune integration externe ne les consomme.

### P2 - Modele TypeScript des feature flags incoherent pour `custom`

Fichiers:

- `src/lib/featureCatalog.ts:1`
- `src/lib/featureCatalog.ts:15`
- `src/lib/featureCatalog.ts:23`
- `src/lib/featureCatalog.ts:942`
- `src/lib/featureCatalog.ts:952`

Probleme:

`FeatureFlagDefinition.group` exclut `custom`, mais `FeatureFlag` herite de cette definition et le code construit des flags custom avec `group: "custom"`.

Action recommandee:

- Separer `FeatureFlagDefinition` et `RuntimeFeatureFlag`, ou autoriser `custom` uniquement sur le type runtime.

## Controles positifs

- Aucun secret direct detecte dans le code frontend suivi.
- `pnpm audit --prod` ne remonte pas de vulnerabilite connue.
- Les uploads passent par `uploadSecurity` avec blocage des extensions dangereuses.
- Les sinks HTML inspectes sont encadres par `safePrintWindow` ou tests CSS dedies.
- Les workflows utilisent Node 22 et pnpm 10.28.1.
- `vercel.json` contient des headers CSP, frame deny, nosniff, referrer policy et permissions policy.
- Les migrations TOK Connect activent RLS et utilisent des tokens OAuth hashes.
- Le MCP TOK Connect expose seulement des tools prudents en v1; l'autopilot reste desactive.

## Actions recommandees par ordre

1. Corriger le webhook Stripe et ajouter des tests de retry/idempotence.
2. Corriger l'affichage des reponses d'avis sur `RestaurantDetail`.
3. Ajouter `typecheck` au package et a la CI, puis corriger les erreurs par lots.
4. Decider quoi faire du worktree: garder seulement `public/sitemap.xml`, ou faire un commit separe de normalisation LF.
5. Activer `PRODUCTION_RELEASE_STRICT=true` cote GitHub production.
6. Chiffrer/masquer les secrets webhook TOK Connect.
7. Supprimer les lockfiles non pnpm si non requis.
8. Continuer les corrections TypeScript sur les domaines admin compta, panier, floor plan et Edge responses.
