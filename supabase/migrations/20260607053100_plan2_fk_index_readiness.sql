-- Plan 2 launch audit: close the next Supabase advisor tranche for high-traffic FK indexes.
-- Guard every index because some production branches may lag optional feature migrations.

DO $$
DECLARE
  index_spec record;
BEGIN
  FOR index_spec IN
    SELECT * FROM (VALUES
      ('commercial_commissions', 'restaurant_id', 'idx_commercial_commissions_restaurant_id_fk'),
      ('carts', 'restaurant_id', 'idx_carts_restaurant_id_fk'),
      ('clicks', 'impression_id', 'idx_clicks_impression_id_fk'),
      ('clicks', 'user_id', 'idx_clicks_user_id_fk'),
      ('chef_table_checkout_holds', 'drop_id', 'idx_chef_table_checkout_holds_drop_id_fk'),
      ('chef_table_checkout_holds', 'user_id', 'idx_chef_table_checkout_holds_user_id_fk'),
      ('chef_table_drops', 'restaurant_id', 'idx_chef_table_drops_restaurant_id_fk'),
      ('favorites', 'restaurant_id', 'idx_favorites_restaurant_id_fk'),
      ('favorites', 'user_id', 'idx_favorites_user_id_fk'),
      ('impressions', 'user_id', 'idx_impressions_user_id_fk'),
      ('restaurant_deals', 'lead_id', 'idx_restaurant_deals_lead_id_fk'),
      ('restaurant_deals', 'restaurant_id', 'idx_restaurant_deals_restaurant_id_fk'),
      ('restaurant_leads', 'assigned_sales_rep_id', 'idx_restaurant_leads_assigned_sales_rep_id_fk'),
      ('ai_usage_costs', 'user_id', 'idx_ai_usage_costs_user_id_fk')
    ) AS plan2_fk_index_specs(table_name, column_name, index_name)
  LOOP
    IF to_regclass(format('%I.%I', 'public', index_spec.table_name)) IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = index_spec.table_name
          AND column_name = index_spec.column_name
      )
    THEN
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON public.%I(%I)',
        index_spec.index_name,
        index_spec.table_name,
        index_spec.column_name
      );
    END IF;
  END LOOP;
END
$$;
