# Contexte projet

Repo : `mtnrconcept/cloud-rebuild`
Workspace local : `C:\Users\Pc\cloud-rebuild-recovered`
Stack : React + Vite + TypeScript + Tailwind/shadcn-ui + Supabase + Stripe + Vercel + Capacitor
Gestionnaire de paquets : `pnpm@10.28.1`
Branche de travail actuelle : `main`
Objectif de cette session : traiter les issues GitHub ouvertes liees a l'admin, Supabase, comptabilite, feature flags, notifications, catalogue, avis, fidelite/Tok One, Operations Center, support et dispatch, en respectant `docs/skills/TOK_APPLICATION_SKILL.md`.

# Skills IDE obligatoires

Avant toute generation ou modification de code, lire les fichiers de contexte et de garde-fous dans `docs/skills/` :

1. `TOK_APPLICATION_SKILL.md` : contexte produit et technique global.
2. `TOK_GLOBAL_RULES.md` : regles permanentes de generation de code.
3. Le skill correspondant au domaine touche : paiement, Supabase/RLS, performance, operations restaurant, notifications, admin/support, SEO, media/IA.
4. `TOK_TESTING_SKILL.md` si une zone critique est touchee.
5. `TOK_RELEASE_GATEKEEPER.md` avant merge, livraison ou modification sensible.

Priorites absolues pour tout agent/IDE : paiement fiable, commande fiable, Supabase securise, RLS correcte, aucun secret expose, aucune modification critique sans test, aucune requete non paginee sur table volumineuse, aucun webhook non idempotent, aucune migration destructive.

# Etat actuel

## Ce qui est deja fait

- Application React/Vite avec routes publiques, dashboard restaurateur, espace admin, espace coursier et composants UI shadcn.
- Integration Supabase avec migrations, fonctions Edge et types dans `src/integrations/supabase`.
- Integration Stripe via fonctions Supabase et helpers frontend.
- Workflow de production GitHub Actions present dans `.github/workflows/deploy-production.yml`.
- Configuration Vercel presente dans `vercel.json`, avec `deploymentEnabled: false` pour eviter les previews automatiques.
- Scripts de verification, release readiness, ciblage Supabase et builds mobiles presents dans `package.json`.
- Admin compta renforcee avec exports CSV/PDF, verrouillage mensuel, rapprochement Stripe et RPC auditees.
- Feature flags admin renforces avec presets, historique audite et raisons obligatoires pour les bascules critiques.
- Admin avis renforce avec moderation priorisee et RPC auditees.
- Admin fidelite/Tok One renforce avec archivage non destructif, metriques et simulation marge.
- Admin catalogue renforce avec upload media, tri, preview publique et validation avant publication.
- Admin notifications renforce avec preview multi-canal, envoi test, duplication, annulation non destructive et visibilite scheduler/desabonnements.
- Skills IDE TOK ajoutes dans `docs/skills/` pour encadrer la generation de code.
- DNS `thetok.ch` bascule depuis Hostinger vers les nameservers Vercel `ns1.vercel-dns.com` et `ns2.vercel-dns.com`; les records publics/admin doivent etre geres cote Vercel DNS.

## Ce qui est partiellement fait

- Les migrations Supabase ajoutees localement doivent etre appliquees via le workflow habituel du repo, pas directement en production depuis une session Codex.
- La validation visuelle authentifiee de l'admin Operations Center n'a pas ete faite dans cette session.

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

Finaliser le traitement local des issues GitHub ouvertes, publier un statut factuel sur les issues et laisser la production au workflow GitHub Actions.
