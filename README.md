# TOK / TheTok

TOK est une plateforme suisse pour la decouverte de restaurants, la commande, la reservation, la fidelite, les operations restaurateur, le dispatch coursier et l'administration plateforme.

## Stack

- React, Vite, TypeScript
- Tailwind CSS et composants shadcn/Radix
- Supabase PostgreSQL, Auth, RLS, Edge Functions et Storage
- Stripe Checkout, abonnements, webhooks et Connect
- Vercel pour le frontend
- Capacitor pour les builds mobiles
- pnpm `10.28.1`
- Node.js `22`

## URLs de reference

- Site public : `https://www.thetok.ch`
- Admin : `https://admin.thetok.ch`
- Cible frontend de production actuelle : `https://cloud-rebuild-recovered.vercel.app/`
- Supabase production : `wwcrtyoueexyxkkikaos`

## Installation locale

```sh
corepack enable
corepack prepare pnpm@10.28.1 --activate
pnpm install
```

## Commandes principales

```sh
pnpm dev
pnpm build
pnpm build:prod
pnpm lint
pnpm test
pnpm test:prod
```

## Supabase

Les changements de base doivent passer par les scripts du depot et par des migrations nouvelles. Ne modifiez pas les anciennes migrations deja appliquees.

Commandes utiles :

```sh
pnpm supabase:target:dev
pnpm supabase:doctor
pnpm supabase:target:prod
pnpm supabase:doctor:prod
pnpm supabase:db:push:prod
```

Avant toute operation risquee, verifiez la cible Supabase. Les secrets ne doivent pas etre commit.

## Variables d'environnement

Les variables frontend exposees commencent par `VITE_`. Elles sont publiques dans le bundle navigateur.

Variables frontend courantes :

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`
- `VITE_STRIPE_PUBLISHABLE_KEY`
- variables publiques Firebase si le push web est active

Secrets Edge Functions courants :

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_WEBHOOK_SIGNING_SECRET`
- `INTERNAL_CRON_SECRET`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `RESEND_API_KEY`
- `EMAIL_FROM`
- `ALLOWED_ORIGINS`
- secrets Firebase serveur si necessaires

Consultez `.env.example` pour le modele local sans valeurs reelles.

## Deploiement

La production est geree par GitHub Actions et Vercel. Le workflow de production :

1. installe avec pnpm,
2. valide lint/tests/build selon le workflow,
3. cible Supabase production,
4. pousse les migrations via les scripts du depot,
5. synchronise les secrets Edge Functions autorises,
6. deploie les fonctions Supabase,
7. deploie le frontend Vercel si les secrets Vercel sont presents.

Ne creez pas de preview Vercel automatique depuis ce depot. La configuration `vercel.json` garde `deploymentEnabled: false`.

## Regles de contribution

- Utiliser pnpm, pas npm, pour les workflows du depot.
- Ne jamais exposer `SUPABASE_SERVICE_ROLE_KEY` ou une cle Stripe secrete cote frontend.
- Garder les roles `client`, `restaurateur`, `courier` et `admin` separes.
- Ne pas contourner RLS depuis le front.
- Recalculer les montants critiques cote serveur.
- Ajouter ou adapter des tests pour les zones paiement, commande, admin, Supabase, RLS, notifications et IA.
- Garder les fichiers texte en UTF-8.

## Documentation projet

Les garde-fous agent et projet sont dans `docs/skills/`, notamment :

- `TOK_APPLICATION_SKILL.md`
- `TOK_GLOBAL_RULES.md`
- `TOK_SUPABASE_RLS_SKILL.md`
- `TOK_TESTING_SKILL.md`
- `TOK_RELEASE_GATEKEEPER.md`
