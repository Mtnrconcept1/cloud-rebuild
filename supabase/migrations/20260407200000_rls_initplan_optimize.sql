-- Optimize RLS policies flagged by Supabase linter (auth_rls_initplan).
-- Wraps auth.<fn>() calls in (select auth.<fn>()) so they are evaluated
-- once per query instead of per row.
--
-- Reads existing policy definitions from pg_policies, rewrites the
-- qual/with_check expressions, and recreates each policy preserving
-- name, command, roles, and permissive flag.

DO $mig$
DECLARE
  targets text[][] := ARRAY[
    ['public','user_roles','Users can view their own roles'],
    ['public','courier_documents','courier_docs_own'],
    ['public','courier_documents','courier_docs_admin'],
    ['public','payment_transactions','payment_transactions_own'],
    ['public','payment_transactions','payment_transactions_admin'],
    ['public','user_wallets','wallets_own'],
    ['public','user_wallets','wallets_admin'],
    ['public','user_wallets','Require auth for user_wallets'],
    ['public','conversations','conversations_participant'],
    ['public','conversations','conversations_admin'],
    ['public','messages','messages_participant'],
    ['public','messages','messages_admin'],
    ['public','promo_codes','promo_codes_admin'],
    ['public','promo_codes','promo_codes_restaurant'],
    ['public','promo_code_uses','promo_uses_own'],
    ['public','promo_code_uses','promo_uses_admin'],
    ['public','referral_codes','referral_own'],
    ['public','support_tickets','support_tickets_own'],
    ['public','support_tickets','support_tickets_admin'],
    ['public','support_messages','support_messages_own'],
    ['public','support_messages','support_messages_admin'],
    ['public','user_profiles','Require auth for user_profiles'],
    ['public','user_addresses','Require auth for user_addresses'],
    ['public','user_payment_methods','Require auth for user_payment_methods'],
    ['public','user_devices','Require auth for user_devices'],
    ['public','user_preferences','Require auth for user_preferences'],
    ['public','user_preferences','Users can manage their preferences'],
    ['public','solidarity_donations','Authenticated users can create donations'],
    ['public','user_analytics','Users can insert their own analytics'],
    ['public','user_analytics','Users can view their own analytics'],
    ['public','user_analytics','Admins can view all analytics'],
    ['public','user_notification_settings','Require auth for user_notification_settings'],
    ['public','wallet_transactions','Require auth for wallet_transactions'],
    ['public','user_referrals','Require auth for user_referrals'],
    ['public','user_subscriptions','Users can manage their subscriptions'],
    ['public','user_subscriptions','Require auth for user_subscriptions'],
    ['public','user_subscription_plans','Require auth for user_subscription_plans'],
    ['public','restaurant_branches','Require auth for restaurant_branches'],
    ['public','restaurant_hours','Require auth for restaurant_hours'],
    ['public','restaurant_service_areas','Require auth for restaurant_service_areas'],
    ['public','restaurant_delivery_rules','Require auth for restaurant_delivery_rules'],
    ['public','restaurant_payout_settings','Require auth for restaurant_payout_settings'],
    ['public','restaurant_documents','Require auth for restaurant_documents'],
    ['public','restaurant_staff','Require auth for restaurant_staff'],
    ['public','restaurant_settings','Require auth for restaurant_settings']
  ];
  i int;
  sch text; tbl text; pol text;
  rec record;
  new_qual text;
  new_check text;
  cmd_kw text;
  roles_csv text;
  permissive_kw text;
  sql text;
BEGIN
  FOR i IN 1 .. array_length(targets, 1) LOOP
    sch := targets[i][1];
    tbl := targets[i][2];
    pol := targets[i][3];

    SELECT p.cmd, p.permissive, p.roles, p.qual, p.with_check
      INTO rec
      FROM pg_policies p
     WHERE p.schemaname = sch AND p.tablename = tbl AND p.policyname = pol;

    IF NOT FOUND THEN
      RAISE NOTICE 'Skipping missing policy: %.%.%', sch, tbl, pol;
      CONTINUE;
    END IF;

    new_qual  := rec.qual;
    new_check := rec.with_check;

    -- Wrap auth.<fn>() unless already wrapped with (select ...).
    IF new_qual IS NOT NULL THEN
      new_qual := regexp_replace(
        new_qual,
        '(?<!select )auth\.(uid|role|jwt|email)\(\)',
        '(select auth.\1())',
        'gi'
      );
    END IF;
    IF new_check IS NOT NULL THEN
      new_check := regexp_replace(
        new_check,
        '(?<!select )auth\.(uid|role|jwt|email)\(\)',
        '(select auth.\1())',
        'gi'
      );
    END IF;

    cmd_kw := CASE rec.cmd
      WHEN 'ALL'    THEN 'ALL'
      WHEN 'SELECT' THEN 'SELECT'
      WHEN 'INSERT' THEN 'INSERT'
      WHEN 'UPDATE' THEN 'UPDATE'
      WHEN 'DELETE' THEN 'DELETE'
      ELSE rec.cmd
    END;

    permissive_kw := CASE WHEN rec.permissive = 'PERMISSIVE' THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END;

    SELECT string_agg(quote_ident(r), ', ')
      INTO roles_csv
      FROM unnest(rec.roles) r;
    IF roles_csv IS NULL OR roles_csv = '' THEN
      roles_csv := 'public';
    END IF;

    EXECUTE format('DROP POLICY %I ON %I.%I', pol, sch, tbl);

    sql := format(
      'CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s',
      pol, sch, tbl, permissive_kw, cmd_kw, roles_csv
    );
    IF new_qual IS NOT NULL THEN
      sql := sql || ' USING (' || new_qual || ')';
    END IF;
    IF new_check IS NOT NULL THEN
      sql := sql || ' WITH CHECK (' || new_check || ')';
    END IF;

    EXECUTE sql;
  END LOOP;
END
$mig$;
