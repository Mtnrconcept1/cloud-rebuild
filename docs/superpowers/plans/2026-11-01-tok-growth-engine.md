# Moteur TOK autonome — plan d’implémentation

**Goal:** construire le domaine éditorial du moteur natif validé par la demande du 1er novembre, puis compléter les intégrations par lots vérifiables.
**Architecture:** conserver le BFF MFA et son CSRF. Un dispatcher dédié fixe le site TOK côté serveur. Données privées sous RLS, versions immuables, file avec leases et plafond de coûts réservé avant appel IA.
**Tech Stack:** React/Vite/TypeScript, PostgreSQL Supabase, Edge Functions existantes, OpenAI existant.
**Spec:** PR #1061, `docs/superpowers/specs/2026-11-01-tok-growth-engine-design.md` sur `agent/marketing-growth-parity-20261101` (7855bfe599c10f06d7642066e3f129d64e28e052).

## Contraintes

- Site TOK unique ; aucun tenant choisi par le navigateur ; mode revue initial ; aucune nouvelle offre SaaS/Stripe.
- Prix/promesses uniquement issus du profil approuvé ; aucune donnée de trafic inventée.
- Budget absent bloque toute génération. Approbation attachée à la version exacte. Une modification conserve l’ancienne version publiée.
- Aucun appel fournisseur ni migration de production pendant les tests ; aucune fusion autorisée.
- Le blog natif est en cours dans le worktree indépendant `agent/native-blog-seo-20261101`. Ne pas toucher ses fichiers ; l’export structuré du moteur doit être raccordé à sa publication dans un lot suivant.

## Fichiers et tâches

### 1. Contrat de contenu
- Créer `supabase/functions/_shared/marketing-growth/content.ts` : validation bornée de documents, profil, URLs autorisées, rendu HTML sûr, préparation de prompts.
- Créer `src/test/marketing-growth-content.test.ts` : injections HTML/URL, champs inconnus, source périmée, taille, citation, édition, prompt non autoritaire.
- RED puis GREEN : `node node_modules/vitest/vitest.mjs run src/test/marketing-growth-content.test.ts`.

### 2. Persistance et frontières
- Créer la migration via CLI `marketing_growth_engine` : site TOK, profils/revisions, articles, jobs, audit ; RLS sans accès client ; fonctions service-only, session BFF et admin revalidés, concurrence optimiste.
- Modifier `server/marketingBff.ts` : allowlist dédiée et validation stricte du contrat.
- Créer `src/test/marketing-growth-bff.test.ts` et `supabase/tests/marketing_growth_engine.sql` : refus directs, MFA/CSRF, version obsolète, approbation invalide, budget, lease et publication non disponible sans adaptateur.
- Aucun déploiement sans exécution SQL isolée. Si PostgreSQL indisponible, rester en brouillon et déclarer cette limite.

### 3. Génération durable
- Créer `supabase/functions/_shared/marketing-growth/worker.ts` : un job par tick, appel borné via client OpenAI existant, validation et persistance ; erreur ambiguë conserve la réservation de budget, aucune relance automatique payante.
- Modifier `supabase/functions/marketing-orchestrator/index.ts` : exécuter après les campagnes existantes uniquement sur `run_due`, isolation des erreurs.
- Tester succès, erreur, absence de budget, résultat invalide, lease perdue et absence de doublon via le contrat worker.

### 4. Interface et recette
- Créer `src/marketing/growth/client.ts`, `src/components/marketing/views/MarketingGrowthView.tsx` ; modifier types, chrome, workspace et gestion URL si nécessaire.
- Profil, liste paginée, brief, édition structurée, versions, approbation, génération, pause et état des prérequis. Aucun bouton ne revendique une publication non implémentée.
- Tests UI, BFF, worker ; lint ciblé, typecheck, build, contrôles CI ; régénérer l’index documentaire.
- Commit et PR dédiée sans fusion ; récapituler les exigences réellement couvertes et restantes dans `docs/marketing/TOK_GROWTH_ENGINE_STATUS.md`.

## Risques et rollback

Risque 3 : privilèges serveur, contenu public futur et coûts IA. Pause initiale ; rollback applicatif par revert de la PR, conservation des tables et révisions. Aucun changement de routes publiques, DNS ou workflow de déploiement. Aucun secret nouveau. Supprimer les données n’est pas un rollback.

## Review Focus

- Un autre admin édite pendant une génération : rejet du résultat périmé.
- Timeout fournisseur après facture : pas de remboursement fictif ni retry payant automatique.
- Texte source contenant des instructions : jamais traité comme autorisation d’outil.
- Nouveau brouillon après approbation : ancienne approbation ne couvre pas la nouvelle version.
- Lecteur public : aucun accès aux données privées ; publication bloquée jusqu’au lot de raccordement blog.

## Ajustements issus de l’implémentation et de la relecture

- Worker séparé `supabase/functions/marketing-growth-worker/index.ts` + déclaration dans `supabase/config.toml` et timer SQL, pour préserver le délai du BFF et de la distribution. L’orchestrateur historique ne change finalement pas.
- `budget.ts` calcule la réserve sur modèle/tokens/prix vérifiés et expirables ; `openai.ts` accepte un tier standard optionnel sans changer ses autres appels.
- `operations.ts` centralise la validation ; suffixe runtime `.js` requis côté Node/Vercel.
- Tests additionnels Edge et budget ; fixture SQL isolée livrée, non exécutée faute de PostgreSQL/Docker.
- Statut par exigence et liste complète : `docs/marketing/TOK_GROWTH_ENGINE_STATUS.md`. La couverture n’est pas la parité entière.
- 1349 tests marketing et 33 tests d’outillage CI réussis à ce stade ; aucune validation SQL/fournisseur ni activation annoncée.

- Registre généré : `scripts/application-index-core.mjs` doit lire la nouvelle allowlist partagée ; `src/test/application-search-index.test.ts` vérifie ses six opérations et le nouveau timer.
