-- Remove legacy commercial simulation accounts and their demo data.
-- Real commercial accounts are provisioned through the authenticated admin flow.

DO $$
DECLARE
  v_demo_user_ids uuid[];
BEGIN
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[])
  INTO v_demo_user_ids
  FROM auth.users
  WHERE email ~ '^commercial(0[1-9]|10)@demo\.thetok\.ch$';

  DELETE FROM public.commercial_prospect_followups
  WHERE source_objectid BETWEEN 990001 AND 990010
     OR assigned_to = ANY(v_demo_user_ids)
     OR signed_by = ANY(v_demo_user_ids)
     OR last_contacted_by = ANY(v_demo_user_ids);

  DELETE FROM public.restaurants
  WHERE owner_id = ANY(v_demo_user_ids)
     OR slug LIKE '%-commercial0%'
     OR slug LIKE '%-commercial10';

  DELETE FROM auth.users
  WHERE id = ANY(v_demo_user_ids);
END $$;
