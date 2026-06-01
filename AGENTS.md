# Contexte projet

Repo : `mtnrconcept/cloud-rebuild`
Workspace local : `C:\Users\Pc\cloud-rebuild-recovered`
Stack : React + Vite + TypeScript + Tailwind/shadcn-ui + Supabase + Stripe + Vercel + Capacitor
Gestionnaire de paquets : `pnpm@10.28.1`
Branche de travail actuelle : `main`
Objectif de cette session : creer ce fichier de contexte pour guider les prochaines conversations Codex.

# Etat actuel

## Ce qui est deja fait

- Application React/Vite avec routes publiques, dashboard restaurateur, espace admin, espace coursier et composants UI shadcn.
- Integration Supabase avec migrations, fonctions Edge et types dans `src/integrations/supabase`.
- Integration Stripe via fonctions Supabase et helpers frontend.
- Workflow de production GitHub Actions present dans `.github/workflows/deploy-production.yml`.
- Configuration Vercel presente dans `vercel.json`, avec `deploymentEnabled: false` pour eviter les previews automatiques.
- Scripts de verification, release readiness, ciblage Supabase et builds mobiles presents dans `package.json`.

## Ce qui est partiellement fait

- La copie locale contient des changements non commites sur :
  - `src/pages/admin/AdminCompta.tsx`
  - `src/pages/admin/adminComptaShared.ts`
  - `src/test/admin-compta-governance.test.ts`
  - `supabase/migrations/20260601043333_admin_compta_governance_controls.sql`
- Ces fichiers semblent concerner la gouvernance comptable admin. Les traiter comme travail en cours tant que l'utilisateur ne demande pas explicitement autre chose.

## Ce qui ne doit pas etre touche sans demande explicite

- Les secrets, cles API et fichiers d'environnement : `.env`, `.env.production`, `.env.production.local`, secrets Supabase, secrets Stripe, secrets Firebase, secrets Vercel.
- La configuration de deploiement production, sauf demande explicite : `.github/workflows/deploy-production.yml`, `vercel.json`, scripts de deploiement.
- Les routes existantes et le comportement de navigation dans `src/App.tsx`, `src/lib/routing.ts` et les composants de routes protegees.
- Les migrations Supabase deja appliquees ou historiques, sauf correction explicitement demandee.
- Les assets volumineux et fichiers generes (`dist`, screenshots, outputs, logs, caches) sauf besoin direct.

## Bugs connus

- Aucun bug confirme dans ce fichier de contexte.
- Avant toute correction, reproduire ou identifier le probleme dans le code/test concerne et eviter les changements larges non justifies.

## Commandes obligatoires avant commit

- `pnpm lint`
- `pnpm test`
- `pnpm build`

# Contraintes de travail

- Ne pas creer de preview Vercel.
- Preview uniquement en local avec `.env`.
- Production uniquement via workflow GitHub Actions.
- Ne pas modifier les cles ou secrets.
- Ne pas casser les routes existantes.
- Pour chaque modification, fournir le fichier complet ou un patch propre.
- Respecter les changements non commites deja presents : ne jamais les revert sans demande explicite.
- Preferer les patterns existants du repo aux nouvelles abstractions.
- Pour Supabase, verifier la cible avant toute operation risquee avec les scripts du repo (`pnpm supabase:doctor`, `pnpm supabase:target:dev` ou equivalent demande).

# Tache actuelle

Creer et maintenir ce fichier de contexte projet pour que les prochaines conversations disposent des regles, contraintes et etats importants du repo.
