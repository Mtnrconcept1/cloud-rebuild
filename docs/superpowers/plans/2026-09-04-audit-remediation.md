# Audit Remediation Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fermer les anciennes PR devenues obsolètes, corriger les risques d’exécution encore reproductibles sur le `main` actuel et ne fusionner que des changements vérifiés sur le SHA courant.

**Architecture:** Les corrections sont séparées par frontière de risque. La base protège l’association d’un incident à un unique run GitHub au niveau PostgreSQL, le code CRM classe les erreurs Resend sans exposer le corps fournisseur, et les anciens travaux sont fermés lorsqu’ils sont déjà présents, incompatibles avec les migrations immuables ou explicitement temporaires. Les consolidations destructives de données et de Storage restent précédées d’un inventaire de références et d’un dry-run.

**Tech Stack:** TypeScript, Vitest, GitHub Actions, Supabase PostgreSQL/Edge Functions, Vercel, Stripe.

**Spec:** Audit TOK vérifié les 3 et 4 septembre 2026 dans le dépôt, Supabase et les connecteurs de production.

## Global Constraints

- Ne jamais modifier une migration déjà versionnée.
- Ne jamais écrire directement sur `main`.
- Ne jamais créer de paiement, remboursement, abonnement ou écriture financière pendant la remédiation.
- Ne jamais supprimer une table ou un objet Storage sans graphe de références, dry-run et rollback.
- Chaque PR est fusionnée par squash uniquement après contrôles GitHub verts sur son SHA exact.
- Les branches anciennes divergentes ne sont pas fusionnées telles quelles.

---

### Task 1: Lier atomiquement un incident à un run GitHub

**Files:**
- Create: `src/test/ops-incident-run-binding.test.ts`
- Create: `supabase/migrations/20260904143000_ops_incident_github_run_binding.sql`

**Interfaces:**
- Consumes: `public.ops_incidents.github_run_id` et le flux `repair-context` existant.
- Produces: contrainte d’unicité partielle et trigger interdisant toute réaffectation vers un autre run.

- [ ] Écrire le test statique exigeant une fonction de trigger, un index unique partiel et l’absence de SQL destructif.
- [ ] Exécuter la CI et constater l’échec dû à la migration absente.
- [ ] Ajouter la migration additive et idempotente.
- [ ] Exécuter lint, typecheck, tests et build via la CI.
- [ ] Vérifier la migration dans une transaction annulée avant fusion.

### Task 2: Reprendre uniquement le correctif CRM MFA sûr

**Files:**
- Modify: `supabase/functions/crm-mfa-recovery/index.ts`
- Test: `src/test/crm-mfa-resend-readiness.test.ts`

**Interfaces:**
- Consumes: `RESEND_API_KEY`, `EMAIL_FROM` et les challenges MFA existants.
- Produces: erreurs fournisseur normalisées, métadonnées non sensibles et idempotence par challenge.

- [ ] Conserver la logique métier actuelle et ajouter les tests de classification.
- [ ] Ne pas imposer un envoi Resend réel dans la CI générale.
- [ ] Vérifier que la clé API, l’adresse du destinataire et le corps brut fournisseur ne sont jamais journalisés.
- [ ] Fusionner seulement après CI verte sur le `main` courant.

### Task 3: Assainir les PR historiques

**Files:**
- No repository file changes.

**Interfaces:**
- Consumes: état GitHub réel, diff contre `main`, statut draft et consignes de chaque PR.
- Produces: backlog ne contenant plus de doublons, PR temporaires ou WIP remplacés.

- [ ] Fermer les correctifs déjà présents dans `main` avec une preuve précise.
- [ ] Fermer les PR explicitement non destinées à être fusionnées.
- [ ] Remplacer les branches qui modifient des migrations historiques par une solution additive ou une issue documentée.
- [ ] Ne pas fusionner de texte juridique non validé ni de branche en conflit de plus de cent commits.

### Task 4: Vérification et livraison

**Files:**
- Update: ce plan et la description des PR uniquement si les résultats diffèrent.

**Interfaces:**
- Consumes: résultats GitHub Actions, état Supabase, déploiement Vercel et SHA de branche.
- Produces: commits squashés sur `main`, ou blocage explicite lorsque le contrôle externe requis n’est pas accessible.

- [ ] Lire tous les jobs du workflow sur le SHA exact.
- [ ] Refuser la fusion en présence d’un job en attente, annulé ou échoué.
- [ ] Fusionner par squash avec `expected_head_sha`.
- [ ] Vérifier le nouveau SHA de `main` et son workflow post-merge.
- [ ] Lister tous les fichiers et toutes les PR fermées/fusionnées.