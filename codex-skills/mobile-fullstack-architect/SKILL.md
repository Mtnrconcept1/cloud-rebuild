---
name: mobile-fullstack-architect
description: "Design, review, and improve mobile applications and their supporting systems across frontend, backend, data, delivery, and security. Use when Codex needs to analyze a whole repository or monorepo, reconstruct business and technical flows end-to-end, identify missing components or weak architecture, assess production readiness, or propose deep prioritized improvements for mobile apps, APIs, web frontends, integrations, testing, performance, and secure-by-default engineering."
---

# Mobile Fullstack Architect

Treat the repository as one system. Reconstruct how it works before proposing changes.

## Core Rules

- Build a repo map before suggesting refactors.
- Prefer evidence from code, configs, CI, schemas, migrations, tests, and runtime wiring over README claims.
- Trace business flows end-to-end across UI, API, persistence, async jobs, notifications, and third-party services.
- Look for what is missing, not only what is broken.
- Prioritize correctness, security, operability, maintainability, and delivery safety over style.
- Distinguish assumptions from verified facts.

## Workflow

1. Build the system map.
   - Identify apps, services, packages, databases, queues, jobs, edge functions, native layers, and external integrations.
   - Detect the actual stack from manifests and entrypoints.
   - Read the main config files, dependency manifests, route roots, auth/session wiring, data client setup, and migration folders.
2. Reconstruct critical flows.
   - App bootstrap, auth/session lifecycle, navigation, role checks, feature flags, search, ordering, payment, notifications, offline/native behavior, dashboards, and admin flows.
   - Follow the same entity across frontend, API, SQL, and async handlers before drawing conclusions.
3. Evaluate each layer.
   - Mobile: native boot, deep links, push, plugin initialization, background behavior, storage, release safety, and degraded-network behavior.
   - Frontend: routing, rendering boundaries, state ownership, forms, caching, optimistic updates, feature gating, error handling, accessibility, and performance hotspots.
   - Backend/data: schema design, RLS or authz model, privileged functions, transactions, idempotency, concurrency, observability, webhook handling, secrets, and rollback safety.
   - Delivery/security: build pipeline, environment separation, sensitive assets in repo, secret exposure, logging of sensitive data, unsafe trust boundaries, and supply-chain risk.
4. Identify missing capabilities.
   - Tests, monitoring, tracing, rate limiting, retries/backoff, validation, migrations discipline, rollback strategy, feature-flag lifecycle, recovery paths, and documentation.
5. Produce prioritized findings.
   - P0: auth bypass, data leakage, irreversible corruption, payment or order integrity failures, or production-break deployment risk.
   - P1: major functional correctness issue, privilege boundary weakness, severe reliability issue, or architecture that blocks safe evolution.
   - P2: maintainability, observability, performance, scalability, and DX gaps with meaningful cost.
   - P3: consistency or hygiene improvements.
6. Propose improvements with depth.
   - For each finding, explain impact, evidence, likely root cause, safer direction, implementation shape, tradeoffs, and rollout order.
   - Separate quick wins from structural refactors.
7. If asked to implement, change the smallest safe surface first, validate with tests or builds, and report residual risk.

## Output Contract

Always return:

- a concise system map
- the main flows reviewed
- prioritized findings with file evidence
- missing capabilities and blind spots
- a staged roadmap: now, next, later
- open questions that block certainty

If the user asks for a review, make findings the primary output. Keep any summary short.

## Reference Loading

After detecting the stack, load only the relevant files from `references/`.

- Read `references/repo-mapping.md` first for whole-system analysis.
- Read `references/react-capacitor.md` for React, Vite, Capacitor, native shell, push, and deep-link review.
- Read `references/supabase-backend.md` for Supabase client, edge functions, schema, RLS, and migration review.
- Read `references/security.md` for security-focused verification.

Do not load every reference by default if the task is narrower than a full-system review.
