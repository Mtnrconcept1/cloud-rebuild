-- Resend sender is checked by the production release preflight before database
-- deployment. The Edge secret is synchronized from the release environment.
-- Mark ONLY the initial stale Resend integration as ready; do not activate any
-- campaign, audience, or sending automation.
DO $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status
  FROM public.marketing_integrations
  WHERE provider = 'resend' AND channel = 'email'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Required Resend marketing integration is missing';
  END IF;

  IF v_status = 'connected' THEN
    RETURN;
  END IF;

  IF v_status IS DISTINCT FROM 'blocked_configuration' THEN
    RAISE EXCEPTION 'Refusing to overwrite explicit Resend integration status: %', v_status;
  END IF;

  UPDATE public.marketing_integrations
  SET status = 'connected',
      capabilities = capabilities || '{"send":true,"adapter_deployed":true}'::jsonb,
      secret_ref = 'RESEND_API_KEY',
      description = 'Resend authenticated sender validated in production preflight; TOK email adapter deployed.',
      configured_at = COALESCE(configured_at, now()),
      last_checked_at = now(),
      last_error = NULL
  WHERE provider = 'resend' AND channel = 'email'
    AND status = 'blocked_configuration';
END;
$$;
