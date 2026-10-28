# Cloudprinter native artwork implementation plan

> **For agentic workers:** use superpowers:executing-plans. The user's request in this conversation is the approved spec; no production deployment or merge is authorized.

**Goal:** Generate print-ready native artwork for the selected verified Cloudprinter product, never add artistic overlays, and fail closed before proof approval on unsupported or invalid artwork.

**Architecture:** One pure geometry/policy helper shared between the browser and Deno resolves physical dimensions, bleed, safe area and native pixel size. Server generation appends authoritative instructions, while export reads the stored original image, checks decoded dimensions and uses a bounded visual assessment. A PDF contains the original image and technical PDF boxes only. The browser proof shows non-exported guides and requires explicit human approval.

**Tech stack:** existing React/TypeScript, Supabase Edge Functions, pdf-lib, OpenAI image/vision, Vitest. No dependency or schema changes.

## Scope, risk and rollback

Risk level 3: Edge Functions and pre-print approval; retain restaurant authorization, storage boundaries, audit trails, quota/idempotency and all payment code. No live print order, payment, paid image test or production mutation. Worktree/branch `fix/cloudprinter-native-artwork-20261028`, base `40ffb0d6b7a40814f10a069bd487b67c415ca828`. Revert this application commit and redeploy the affected frontend/functions for rollback; no data migration to undo. Existing paid orders are not changed.

## Rules and limits

- Use actual provider dimensions, never infer A4/A5 from a ratio. Only flat, single-page, single-sided digital products are supported; unknown special products remain blocked.
- Absent safe margin defaults to the Cloudprinter documented 3 mm inside trim. Actual provider bleed must be known, not silently defaulted. Respect any larger recorded safe margin.
- 300 DPI is the supplier recommendation, not a fabricated universal mandatory minimum. Keep the explicit TOK minimum of 150 DPI unless a higher minimum is recorded. Warn below 300 DPI and require human proof approval. Never upscale to claim extra resolution.
- GPT Image 2 custom native dimensions follow documented multiples-of-16, maximum edge/pixel/aspect limits. Match the bleed-inclusive ratio within one pixel rounding, with no cover crop. No new model or quality setting.
- All title/price/CTA/logo/artwork is native. Reject any submitted text/logo/QR/opacity overlay at both client preflight and server. QR codes embedded in generated artwork are not guaranteed scannable: block automated print approval when a QR is detected until a decoder-backed validator exists.
- Vision reports observations/essential-element bounding boxes, not a trusted pass flag. Deterministic code checks every box against the physical safe area. Incomplete, uncertain or failed assessment blocks export; human proof remains necessary even after a successful assessment.
- Digital generation and social margins are outside this change. Preserve the single paid image attempt and active identity references.
- PDF 1.7/RGB raster output is supported by general Cloudprinter guidance, but is not certified PDF/X-4, vector typography or an ICC/CMYK conversion. Unsupported requirements must not be mislabeled compliant.

## Files and order

1. Add tests for native geometry, overlays, provider null margins, generation prompts, raster bounds, source integrity and proof guides. Run and observe expected failures.
2. Add `supabase/functions/_shared/print/artwork.ts` (pure policy/template/measurement helpers) and `artwork-review.ts` (bounded server vision). Update `source-format.ts`, `catalog.ts`, generation/catalog/export/PDF callers.
3. Update `src/lib/marketing/{outputGeometry,outputSession,imageOutput}.ts`, `src/lib/print/{document,preflight,rendering,client}.ts`, `PrintComposerDialog.tsx`, `PrintProof.tsx`, and output controls as needed. Remove resampling and editing overlays only in print workflows.
4. Run targeted print/generation tests, scoped lint, TypeScript and build. Add adversarial/malformed/unsupported tests, plus proof UI behavior. Verify actual PDF boxes without artwork overlays where runtime dependencies permit.
5. Update operations documentation and canonical generated application references if required by existing CI. Review diff, publish a clean commit and PR, inspect required checks. Do not merge.

## Review focus

- Missing safe margin versus explicit invalid geometry; absent data never means zero margin.
- Tampered browser URLs/dimensions/overlays and cross-restaurant asset access.
- Legacy generated contracts and stale catalogue dimensions/margins after generation.
- Native pixel limits, low DPI, unsupported folds/pages/offset/dielines and QR readability.
- Timeouts/malformed vision responses, approval without explicit acknowledgement, and preserving digital generation/payment behavior.

## Validation record

See the PR and delivery report for commands and actual outcomes. Temporary source/validation workflow is removed from the final branch tree and is not part of the deliverable.
