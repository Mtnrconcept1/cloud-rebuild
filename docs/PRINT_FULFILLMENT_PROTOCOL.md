# Print fulfillment protocol — controlled rollout and recovery

Risk: level 3 (durable orders, privileged SQL, external cost). No production mutation or provider submission is part of these tests.

## Guarantees and limits

- The orchestrator reserves one job immediately before processing it, up to the request limit and a 120-second admission budget. It never reserves a batch whose leases expire in a local queue.
- Immediately before a create request, `prepare_print_fulfillment_submission` locks the job then the order. It verifies the current lease, payment/order state and kill switch; it stores `submission_started_at` and renews the lease for 180 seconds.
- Only the transaction that first sets this per-order marker may automatically create. A crash immediately after that transaction can prevent a send: this deliberate uncertainty requires reconciliation, not a second automatic create.
- Pre-send validation, quote and storage failures occur before the marker and can retry normally. Legacy attempted orders have insufficient evidence about whether a send happened; the migration conservatively marks them once. Review these separately rather than assuming they were submitted.
- Accepted provider submissions and job completion persist in one transaction. A cancellation/refund or a later webhook state is preserved when the monotone transition returns `advanced=false`. Cancellation after the gate can race with the external request; the recorded result requires reconciliation and does not assert that provider production was canceled.
- Expired final attempts become `failed` with `print_attempts_exhausted_reconcile_required` and `result.reconciliation_required=true`. Retry exhaustion is an actionable terminal job, not proof of provider failure. The order and immutable reference remain available.
- The provider [Core API documentation](https://docs.cloudprinter.com/client/cloudprinter-core-api-v1-0) requires a unique order reference. This is not a documented exactly-once delivery guarantee. The protocol retains the same `TOKP_…` reference and never depends on a negative lookup alone as permission to resend.

## Deployment order

1. Record the current `print_settings.new_orders_enabled` value and pause new submissions through the existing authorized operations path. Allow previous workers to drain; inspect in-flight leases and provider requests before continuing. This document does not authorize an actual provider operation.
2. Apply only the new `20261010203000_print_fulfillment_protocol.sql` after a successful schema replay and review. Historical migrations remain unchanged. Deploy the matching `print-orchestrator` before reopening new submissions; old workers do not honor the marker.
3. Inspect jobs marked `reconciliation_required`, including legacy attempted orders. Reopen using the previously recorded setting only after the rollout checks pass.
4. Rollback: pause new submissions and keep the additive schema/markers. Do not redeploy the old sending implementation while jobs may already have reached the provider. A forward fix is safer than removing the marker or restoring blind retry behavior.

## Resolve an ambiguous or exhausted job

1. Identify the order, existing job, immutable provider reference, lease/status, `submission_started_at`, order events and error code. Restrict this to authorized service/admin operations; do not log addresses, PDF URLs or provider credentials.
2. Query the provider using the same reference, then inspect provider logs/support evidence when the response is absent or uncertain. An empty lookup alone does not establish non-submission.
3. If the order exists at the provider, use the existing admin reconcile action for the order and verify its state/events. Close the existing exhausted job only after that persisted outcome is confirmed; do not reset the marker or create another job/reference.
4. If absence is positively established by provider evidence and a new send is intended, pause submissions and drain active leases first. An authorized operator may perform a reviewed, audited database transaction that locks the original job then the order, verifies paid pre-submission state and no active lease, records the evidence/actor/reason in order events, clears the marker and resets only the original job to pending with a bounded budget. Preserve the reference and check all other submission jobs for the same order. No automated reset endpoint is provided.
5. If acceptance/cancellation remains uncertain, leave the marker and failed job intact and escalate to provider support. Never bypass the marker just to clear a dashboard error.

## Evidence

- Runtime tests simulate transport/SDK failures, pre-send errors, delayed provider visibility, lease refusal, concurrent state changes and one-at-a-time reservation. They do not prove database concurrency or provider behavior.
- `scripts/test-print-protocol-postgres.mjs` requires an explicitly disposable loopback PostgreSQL 17+ or a named network-isolated test container. It verifies migration transition/reapplication, real role permissions, lease expiry/loss, final attempts, atomic rollback, monotone states and two concurrent jobs for one order.
- `supabase/tests/print_fulfillment_protocol_fixture.sql` contains synthetic data only. The SQL assertions roll back their state changes; the disposable database must be destroyed after the test.
- The CI replay must record its exact base/candidate SHAs and any synthetic prerequisites required by historical data-dependent migrations. A replay with those prerequisites is not evidence that a completely empty database can replay history unaided.
- No deployment, provider call, SQL replay or CI result should be claimed from the presence of these scripts alone.
