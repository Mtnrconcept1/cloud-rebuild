-- Security abuse monitoring for 10k launch readiness.
-- This is read-only supervision: it does not block traffic and does not touch
-- secrets. Production execution remains owned by GitHub Actions migrations.

CREATE INDEX IF NOT EXISTS idx_edge_function_audit_logs_status_created_10k
  ON public.edge_function_audit_logs (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_edge_function_audit_logs_ip_created_10k
  ON public.edge_function_audit_logs ((request_metadata->>'ip'), created_at DESC)
  WHERE request_metadata ? 'ip';

CREATE INDEX IF NOT EXISTS idx_payment_transactions_user_status_created_10k
  ON public.payment_transactions (user_id, status, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.admin_get_security_abuse_summary(p_hours integer DEFAULT 24)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_hours integer := GREATEST(1, LEAST(COALESCE(p_hours, 24), 720));
  v_since timestamptz := now() - make_interval(hours => GREATEST(1, LEAST(COALESCE(p_hours, 24), 720)));
  v_mass_accounts jsonb := '{}'::jsonb;
  v_edge_failures jsonb := '{}'::jsonb;
  v_card_testing jsonb := '{}'::jsonb;
  v_uploads jsonb := '{}'::jsonb;
  v_sensitive_actions jsonb := '{}'::jsonb;
  v_status text := 'ok';
  v_watch_count integer := 0;
  v_critical_count integer := 0;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  WITH created_users AS (
    SELECT
      u.id,
      u.created_at,
      u.email_confirmed_at,
      lower(COALESCE(u.raw_user_meta_data->>'role', 'client')) AS requested_role
    FROM auth.users u
    WHERE u.created_at >= v_since
  ),
  role_counts AS (
    SELECT requested_role, COUNT(*)::integer AS role_count
    FROM created_users
    GROUP BY requested_role
  ),
  signup_requests AS (
    SELECT requested_role, COUNT(*)::integer AS count
    FROM public.signup_applications
    WHERE submitted_at >= v_since
    GROUP BY requested_role
  ),
  totals AS (
    SELECT
      COUNT(*)::integer AS new_accounts,
      COUNT(*) FILTER (WHERE email_confirmed_at IS NULL)::integer AS unconfirmed_accounts
    FROM created_users
  )
  SELECT jsonb_build_object(
    'status', CASE
      WHEN new_accounts >= 500 THEN 'critical'
      WHEN new_accounts >= 100 THEN 'watch'
      ELSE 'ok'
    END,
    'windowHours', v_hours,
    'newAccounts', new_accounts,
    'unconfirmedAccounts', unconfirmed_accounts,
    'requestedRoles', COALESCE((
      SELECT jsonb_object_agg(requested_role, role_count)
      FROM role_counts
    ), '{}'::jsonb),
    'signupApplications', COALESCE((
      SELECT jsonb_object_agg(requested_role, count)
      FROM signup_requests
    ), '{}'::jsonb),
    'message', CASE
      WHEN new_accounts >= 500 THEN 'Volume critique de creation de comptes dans la fenetre observee.'
      WHEN new_accounts >= 100 THEN 'Volume eleve de creation de comptes a verifier.'
      ELSE 'Creation de comptes sans volume anormal.'
    END
  )
  INTO v_mass_accounts
  FROM totals;

  WITH failures_by_ip AS (
    SELECT
      COALESCE(NULLIF(request_metadata->>'ip', ''), 'unknown') AS ip,
      COUNT(*)::integer AS failures,
      COUNT(DISTINCT actor_user_id)::integer AS users,
      array_remove(array_agg(DISTINCT function_name ORDER BY function_name), NULL) AS functions
    FROM public.edge_function_audit_logs
    WHERE created_at >= v_since
      AND status = 'failure'
      AND function_name IN (
        'validate-order',
        'create-checkout',
        'complete-order-checkout',
        'stripe-webhook',
        'send-push',
        'send-email',
        'notification-dispatch'
      )
    GROUP BY COALESCE(NULLIF(request_metadata->>'ip', ''), 'unknown')
    ORDER BY failures DESC
    LIMIT 25
  ),
  failures_by_user AS (
    SELECT
      actor_user_id,
      COUNT(*)::integer AS failures,
      array_remove(array_agg(DISTINCT function_name ORDER BY function_name), NULL) AS functions
    FROM public.edge_function_audit_logs
    WHERE created_at >= v_since
      AND status = 'failure'
      AND actor_user_id IS NOT NULL
      AND function_name IN ('validate-order', 'create-checkout', 'complete-order-checkout', 'stripe-webhook')
    GROUP BY actor_user_id
    ORDER BY failures DESC
    LIMIT 25
  ),
  totals AS (
    SELECT
      COALESCE(MAX(failures), 0)::integer AS max_ip_failures,
      COALESCE((SELECT MAX(failures) FROM failures_by_user), 0)::integer AS max_user_failures,
      COALESCE(SUM(failures), 0)::integer AS total_failures
    FROM failures_by_ip
  )
  SELECT jsonb_build_object(
    'status', CASE
      WHEN GREATEST(max_ip_failures, max_user_failures) >= 75 THEN 'critical'
      WHEN GREATEST(max_ip_failures, max_user_failures) >= 25 THEN 'watch'
      ELSE 'ok'
    END,
    'totalFailures', total_failures,
    'topIps', COALESCE((SELECT jsonb_agg(to_jsonb(failures_by_ip)) FROM failures_by_ip), '[]'::jsonb),
    'topUsers', COALESCE((SELECT jsonb_agg(to_jsonb(failures_by_user)) FROM failures_by_user), '[]'::jsonb),
    'message', CASE
      WHEN GREATEST(max_ip_failures, max_user_failures) >= 75 THEN 'Concentration critique d echecs sur endpoint sensible.'
      WHEN GREATEST(max_ip_failures, max_user_failures) >= 25 THEN 'Concentration d echecs a surveiller sur endpoint sensible.'
      ELSE 'Echecs sensibles sans concentration anormale.'
    END
  )
  INTO v_edge_failures
  FROM totals;

  WITH stripe_edge_failures AS (
    SELECT
      COALESCE(NULLIF(request_metadata->>'ip', ''), 'unknown') AS ip,
      COUNT(*)::integer AS failures
    FROM public.edge_function_audit_logs
    WHERE created_at >= v_since
      AND status = 'failure'
      AND function_name IN (
        'create-checkout',
        'complete-order-checkout',
        'stripe-webhook',
        'authorize-match-group-order',
        'confirm-match-group-authorization'
      )
      AND (
        error_message ILIKE '%card%'
        OR error_message ILIKE '%declin%'
        OR error_message ILIKE '%payment%'
        OR error_message ILIKE '%stripe%'
        OR request_metadata::text ILIKE '%card%'
        OR request_metadata::text ILIKE '%payment%'
      )
    GROUP BY COALESCE(NULLIF(request_metadata->>'ip', ''), 'unknown')
    ORDER BY failures DESC
    LIMIT 25
  ),
  failed_payment_users AS (
    SELECT
      user_id,
      COUNT(*)::integer AS failed_transactions,
      COUNT(DISTINCT COALESCE(stripe_payment_intent_id, stripe_checkout_session_id))::integer AS stripe_attempts
    FROM public.payment_transactions
    WHERE created_at >= v_since
      AND lower(COALESCE(status, '')) IN ('failed', 'payment_failed', 'requires_payment_method', 'declined')
      AND COALESCE(provider, 'stripe') = 'stripe'
      AND user_id IS NOT NULL
    GROUP BY user_id
    ORDER BY failed_transactions DESC
    LIMIT 25
  ),
  totals AS (
    SELECT
      COALESCE((SELECT SUM(failures) FROM stripe_edge_failures), 0)::integer AS edge_failures,
      COALESCE((SELECT SUM(failed_transactions) FROM failed_payment_users), 0)::integer AS failed_transactions,
      COALESCE((SELECT MAX(failures) FROM stripe_edge_failures), 0)::integer AS max_ip_failures,
      COALESCE((SELECT MAX(failed_transactions) FROM failed_payment_users), 0)::integer AS max_user_failures
  )
  SELECT jsonb_build_object(
    'status', CASE
      WHEN GREATEST(max_ip_failures, max_user_failures) >= 30 THEN 'critical'
      WHEN GREATEST(max_ip_failures, max_user_failures) >= 10 THEN 'watch'
      ELSE 'ok'
    END,
    'stripeEdgeFailures', edge_failures,
    'failedPaymentTransactions', failed_transactions,
    'topIps', COALESCE((SELECT jsonb_agg(to_jsonb(stripe_edge_failures)) FROM stripe_edge_failures), '[]'::jsonb),
    'topUsers', COALESCE((SELECT jsonb_agg(to_jsonb(failed_payment_users)) FROM failed_payment_users), '[]'::jsonb),
    'message', CASE
      WHEN GREATEST(max_ip_failures, max_user_failures) >= 30 THEN 'Signal critique compatible avec tests de cartes.'
      WHEN GREATEST(max_ip_failures, max_user_failures) >= 10 THEN 'Signal a surveiller compatible avec tests de cartes.'
      ELSE 'Aucun signal concentre de tests de cartes.'
    END
  )
  INTO v_card_testing
  FROM totals;

  WITH upload_counts AS (
    SELECT
      bucket_id,
      COALESCE(owner::text, 'unknown') AS owner_id,
      COUNT(*)::integer AS uploads,
      COALESCE(SUM(
        CASE
          WHEN metadata ? 'size' AND metadata->>'size' ~ '^[0-9]+$'
          THEN (metadata->>'size')::bigint
          ELSE 0
        END
      ), 0)::bigint AS total_bytes
    FROM storage.objects
    WHERE created_at >= v_since
      AND bucket_id IN (
        'images',
        'invoice-logos',
        'verification-documents',
        'social-post-media',
        'ai-generated-assets'
      )
    GROUP BY bucket_id, COALESCE(owner::text, 'unknown')
    ORDER BY uploads DESC, total_bytes DESC
    LIMIT 25
  ),
  totals AS (
    SELECT
      COALESCE(SUM(uploads), 0)::integer AS total_uploads,
      COALESCE(MAX(uploads), 0)::integer AS max_owner_uploads,
      COALESCE(SUM(total_bytes), 0)::bigint AS total_bytes
    FROM upload_counts
  )
  SELECT jsonb_build_object(
    'status', CASE
      WHEN max_owner_uploads >= 250 OR total_uploads >= 1000 THEN 'critical'
      WHEN max_owner_uploads >= 75 OR total_uploads >= 300 THEN 'watch'
      ELSE 'ok'
    END,
    'totalUploads', total_uploads,
    'totalBytes', total_bytes,
    'topUploaders', COALESCE((SELECT jsonb_agg(to_jsonb(upload_counts)) FROM upload_counts), '[]'::jsonb),
    'message', CASE
      WHEN max_owner_uploads >= 250 OR total_uploads >= 1000 THEN 'Volume critique d uploads media.'
      WHEN max_owner_uploads >= 75 OR total_uploads >= 300 THEN 'Volume eleve d uploads media a verifier.'
      ELSE 'Uploads media sans volume anormal.'
    END
  )
  INTO v_uploads
  FROM totals;

  WITH action_counts AS (
    SELECT
      function_name,
      action,
      COALESCE(request_metadata->>'auth_mode', CASE WHEN is_service_role THEN 'service_role' ELSE 'user_jwt' END) AS auth_mode,
      COUNT(*)::integer AS count,
      COUNT(*) FILTER (WHERE status = 'failure')::integer AS failures
    FROM public.edge_function_audit_logs
    WHERE created_at >= v_since
      AND (
        is_service_role = true
        OR request_metadata->>'auth_mode' IN ('service_role', 'scheduler_secret')
        OR function_name IN (
          'create-checkout',
          'complete-order-checkout',
          'stripe-webhook',
          'validate-order',
          'reconcile-paid-order-checkouts',
          'send-push',
          'send-email',
          'notification-dispatch'
        )
      )
    GROUP BY function_name, action, COALESCE(request_metadata->>'auth_mode', CASE WHEN is_service_role THEN 'service_role' ELSE 'user_jwt' END)
    ORDER BY failures DESC, count DESC
    LIMIT 50
  )
  SELECT jsonb_build_object(
    'status', CASE WHEN COALESCE(SUM(count), 0) = 0 THEN 'watch' ELSE 'ok' END,
    'auditedActions', COALESCE(SUM(count), 0)::integer,
    'failedActions', COALESCE(SUM(failures), 0)::integer,
    'items', COALESCE(jsonb_agg(to_jsonb(action_counts)), '[]'::jsonb),
    'message', CASE
      WHEN COALESCE(SUM(count), 0) = 0 THEN 'Aucune action sensible auditee dans la fenetre observee.'
      ELSE 'Actions sensibles auditees dans edge_function_audit_logs.'
    END
  )
  INTO v_sensitive_actions
  FROM action_counts;

  v_critical_count :=
    CASE WHEN v_mass_accounts->>'status' = 'critical' THEN 1 ELSE 0 END +
    CASE WHEN v_edge_failures->>'status' = 'critical' THEN 1 ELSE 0 END +
    CASE WHEN v_card_testing->>'status' = 'critical' THEN 1 ELSE 0 END +
    CASE WHEN v_uploads->>'status' = 'critical' THEN 1 ELSE 0 END +
    CASE WHEN v_sensitive_actions->>'status' = 'critical' THEN 1 ELSE 0 END;

  v_watch_count :=
    CASE WHEN v_mass_accounts->>'status' = 'watch' THEN 1 ELSE 0 END +
    CASE WHEN v_edge_failures->>'status' = 'watch' THEN 1 ELSE 0 END +
    CASE WHEN v_card_testing->>'status' = 'watch' THEN 1 ELSE 0 END +
    CASE WHEN v_uploads->>'status' = 'watch' THEN 1 ELSE 0 END +
    CASE WHEN v_sensitive_actions->>'status' = 'watch' THEN 1 ELSE 0 END;

  v_status := CASE
    WHEN v_critical_count > 0 THEN 'critical'
    WHEN v_watch_count > 0 THEN 'watch'
    ELSE 'ok'
  END;

  RETURN jsonb_build_object(
    'checkedAt', now(),
    'windowHours', v_hours,
    'status', v_status,
    'counts', jsonb_build_object(
      'critical', v_critical_count,
      'watch', v_watch_count
    ),
    'massAccountCreation', v_mass_accounts,
    'sensitiveEndpointFailures', v_edge_failures,
    'cardTesting', v_card_testing,
    'massUploads', v_uploads,
    'sensitiveActions', v_sensitive_actions
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_get_security_abuse_summary(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_security_abuse_summary(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_security_abuse_summary(integer) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
