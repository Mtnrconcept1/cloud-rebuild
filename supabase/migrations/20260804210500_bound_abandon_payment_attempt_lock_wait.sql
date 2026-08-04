-- Bound the lock wait of abandon_payment_attempt_session.
--
-- stripe-webhook returned 500 on checkout.session.expired after 128 s of
-- execution, with "PAYMENT_ATTEMPT_ABANDON_FAILED:upstream request timeout":
-- the gateway gave up while the RPC was still queued behind
--   PERFORM pg_advisory_xact_lock(hashtextextended('payment-attempt:' || ...))
--   SELECT ... FROM public.payment_attempts WHERE id = ... FOR UPDATE
-- Neither wait was bounded, so contention turned into an unbounded hang.
--
-- The work itself is trivial and not the problem: payment_attempts holds 11
-- rows in 272 kB, max metadata 900 bytes, max generation 2. What made the wait
-- unbounded was instance-wide contention (see the companion migration adding
-- the missing created_at index on edge_function_audit_logs).
--
-- Hanging is strictly worse than failing here. Stripe has already abandoned the
-- delivery and scheduled its own retry long before 128 s, so the extra wait
-- buys nothing while it pins one of only 60 Postgres connections and keeps the
-- edge invocation billing. With the bound, a contended call raises 55P03
-- quickly, the webhook answers, and Stripe replays checkout.session.expired —
-- an event that is safe to replay, since the RPC rejects a session that no
-- longer matches the attempt.
--
-- ALTER FUNCTION ... SET applies the timeout for the duration of each call and
-- leaves the body untouched. Reverted with RESET.

ALTER FUNCTION public.abandon_payment_attempt_session(uuid, text, text, uuid)
  SET lock_timeout = '5s';
