# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

## Supabase target safety

This repo can talk to different Supabase projects depending on which env file
the frontend loads and which project the Supabase CLI is linked to locally.
That is the main source of "it worked in Antigravity but broke in Codex local"
drift on this project.

Rules for this repo:

- `supabase/.temp/` is local-only and must never be committed.
- The repo standardizes on the npm Supabase CLI via `npx supabase`. Do not rely on
  ad-hoc local binaries under `.tools/`.
- The default local target is development. Switch targets explicitly instead of
  reusing stale CLI link metadata.

## Feature flag governance

Public copy, route exposure, dashboards and support surfaces must follow the active feature flags.
