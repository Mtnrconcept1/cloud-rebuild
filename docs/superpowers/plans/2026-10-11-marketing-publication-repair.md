# TOK marketing publication repair

## Scope and risk

Risk level 3: authenticated approval and externally visible social publishing.
Base: ecfd20d27a6abbe4db63ce7cab28c62e09d73221. Dedicated branch only; no merge to main.

## Confirmed causes

The manually prepared body already contains headline, CTA and hashtags. The
publisher appended them a second time. An illustrated Facebook post was sent
without visual_url while its visual_status was pending_generation. Instagram
failed with instagram_media_required. The public conversion page is
/restaurateurs/geneve and contains the demande-demo anchor; the hyphenated URL
used in the campaign had no redirect. Both integrations remain connected.

## Changes in order

1. Regression tests on the real caption composer, Meta adapter and bundle.
2. Deduplicate optional caption fields, preserving the body and legacy Facebook
   text-only posts. Reject missing required media before identity/provider calls.
3. Preserve image briefs and readiness in generated drafts. Share an image only
   for identical trimmed briefs, with the existing maximum of six generations.
   Count distinct generated files, not their reuse across channels.
4. Check stored social media readiness after the existing BFF session, CSRF and
   admin gates, before approval. Read only needed JSON fields, paginate by UUID
   in batches of 100, and fail closed after 2000 rows or malformed results.
5. Add the exact legacy-path redirect. Keep canonical pre-rendered routes and
   all other rewrites unchanged.
6. Validate targeted tests, lint, application and server typechecks, build,
   Edge checks and the generated application index. Run the full suite in CI.

Files: server/marketingBff.ts; supabase/functions/_shared/meta-publishing.ts;
marketing-ai-plan.ts and new marketing-visual-allocation.ts in that shared
folder; supabase/functions/ai-marketing-agent/index.ts; vercel.json; the two
existing marketing-meta-publishing and marketing-ai-agent tests, three new
approval-readiness, visual-allocation and legacy-landing tests; this plan;
and the two generated architecture indexes.

## Boundaries and rollout

No auth/MFA bypass, secret change, migration, RLS or Storage permission change.
No live publish, delete, reapproval or automatic retry of an ambiguous outcome.
The existing durable provider marker/reconciliation mechanism is unchanged.
Approval preflight is advisory, not a SQL transaction: the worker repeats media
validation and retains existing approval/lease guards before publication.

This change does not manufacture the missing campaign images, certify their
visual relevance or test a real Meta publication. HTTPS syntax is checked;
Meta still fetches and validates supplied image bytes. Existing 37 draft items
and two failed Instagram items require finished images and human review before
approval. The already published Facebook item is not republished automatically.

Before production: compare the deployed Edge sources with this branch, retain
existing deployed functionality, deliver BFF/redirect and affected Edge bundles,
then verify the actual HTTP redirect, anchor, approval error, and a reviewed
real image post on each channel. Do not deploy an older main snapshot over
separately deployed changes. PR 765 contains the same campaign message fix;
reconcile that overlap rather than applying it twice. PR 763's preview composer
must be aligned with the publisher when that separate PR is integrated.

Rollback: revert the code commit and redeploy only affected components. No
schema/data rollback. Keep unillustrated campaigns unapproved during rollback.

References: Vercel configuration passes query strings through a redirect;
RFC 9110 section 10.2.2 preserves the original fragment when Location has none.
https://vercel.com/kb/guide/how-do-i-perform-vercel-redirects-based-on-query-strings
https://www.rfc-editor.org/rfc/rfc9110.html#section-10.2.2

## Completion — 11 October afternoon

Remaining changes are restricted to the 31 cuisine thumbnails exceeding the
existing 12000-byte budget, src/marketing/marketingBffClient.ts and its existing
client tests. Keep thumbnail dimensions, source illustrations and test budgets.
Map only known media error codes to constant French client messages; never
render arbitrary upstream error details. Regenerate application/error indexes
if their inputs change. Validate full suite, lint, typecheck and build, then
create the next commit through GitHub createCommitOnBranch so the configured
verified-commit deployment policy remains enforced. No main merge.

The production historical landing is repaired with one project-level Vercel
route, limited to www.thetok.ch and ^/restaurateurs-geneve/?$, HTTP 308 to
/restaurateurs/geneve. Previous project route list was empty. Route ID
89251966-50eb-4f49-9cd1-a00c47688aaa, version
250b0e5b-2fbe-4d51-9fce-8bb184ce91ce. Rollback: disable this one rule and
promote the resulting version; preserve any subsequent unrelated rules.

Compare deployed Edge source before updating only marketing-orchestrator and
ai-marketing-agent. Missing campaign assets are not evidence of broken Meta
credentials: the campaign was manually planned with pending_generation.
Preparing its existing briefs must leave all not-yet-published items pending
human approval, and must not trigger any Meta publication or secret rotation.
