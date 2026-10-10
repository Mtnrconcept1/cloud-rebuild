-- Run after fixture + the actual migration, in a disposable database.
\set ON_ERROR_STOP on
BEGIN;
SET request.jwt.claims='{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000001"}';
SET ROLE authenticated;
SELECT public.admin_toggle_feature_flag('coming-soon',true,'test',NULL);
DO $$ BEGIN
 IF NOT public.launch_gate_enabled() THEN RAISE EXCEPTION 'Activation failed'; END IF;
 IF abs(extract(epoch FROM ((public.get_launch_gate_state()->>'ends_at')::timestamptz-clock_timestamp()))-1728000)>5 THEN RAISE EXCEPTION 'Not twenty days'; END IF;
END $$;
RESET ROLE;
-- An expired clock must never reopen access.
UPDATE public.launch_gate_clock SET ends_at=now()-interval '1 day';
SET request.jwt.claims='{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000002","user_metadata":{"role":"admin"}}';
SET ROLE authenticated;
SET request.path='/orders';
DO $$ BEGIN
 BEGIN PERFORM public.enforce_launch_gate(); RAISE EXCEPTION 'Client REST bypass'; EXCEPTION WHEN SQLSTATE 'PT403' THEN NULL; END;
 IF EXISTS(SELECT 1 FROM public.orders) THEN RAISE EXCEPTION 'Client RLS/Realtime bypass'; END IF;
 IF NOT public.launch_gate_enabled() THEN RAISE EXCEPTION 'Expired clock opened access'; END IF;
 BEGIN INSERT INTO public.orders VALUES(gen_random_uuid(),auth.uid()); RAISE EXCEPTION 'Client write bypass'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.admin_toggle_feature_flag('coming-soon',false,'attack',NULL); RAISE EXCEPTION 'Admin spoof'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='Admin spoof' THEN RAISE; END IF; END;
 BEGIN UPDATE public.launch_gate_clock SET ends_at=now(); RAISE EXCEPTION 'Clock write bypass'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF (SELECT count(*) FROM storage.objects)<>1 THEN RAISE EXCEPTION 'Private storage bypass or signup denied'; END IF;
END $$;
SET request.path='/rpc/create_order';
DO $$ BEGIN
 BEGIN PERFORM public.enforce_launch_gate(); RAISE EXCEPTION 'RPC bypass'; EXCEPTION WHEN SQLSTATE 'PT403' THEN NULL; END;
END $$;
SET request.path='/rpc/sync_signup_application'; SELECT public.enforce_launch_gate();
SET request.path='/rpc/get_launch_gate_state'; SELECT public.enforce_launch_gate();
SET request.path='/user_roles'; SELECT public.enforce_launch_gate();
RESET ROLE;
SET request.jwt.claims='{"role":"anon"}'; SET ROLE anon;
SET request.path='/orders';
DO $$ BEGIN
 BEGIN PERFORM public.enforce_launch_gate(); RAISE EXCEPTION 'Anonymous bypass'; EXCEPTION WHEN SQLSTATE 'PT403' THEN NULL; END;
END $$;
RESET ROLE;
SET request.jwt.claims='{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000003"}'; SET ROLE authenticated;
SET request.path='/menu_items'; SELECT public.enforce_launch_gate();
UPDATE public.menu_items SET name='Prepared' WHERE id='30000000-0000-0000-0000-000000000001';
DO $$ BEGIN
 IF (SELECT name FROM public.menu_items LIMIT 1)<>'Prepared' THEN RAISE EXCEPTION 'Own menu denied'; END IF;
 BEGIN INSERT INTO public.menu_items VALUES(gen_random_uuid(),'20000000-0000-0000-0000-000000000002','Attack'); RAISE EXCEPTION 'Cross-owner menu bypass'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF public.launch_rpc_allowed('create_order') THEN RAISE EXCEPTION 'Restaurant client RPC bypass'; END IF;
 IF public.launch_table_allowed('orders') THEN RAISE EXCEPTION 'Restaurant client table bypass'; END IF;
END $$;
RESET ROLE;
SET request.jwt.claims='{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000001"}'; SET ROLE authenticated;
SELECT public.admin_toggle_feature_flag('coming-soon',false,'release',NULL);
SELECT public.admin_activate_all_feature_flags();
DO $$ BEGIN IF public.launch_gate_enabled() THEN RAISE EXCEPTION 'Bulk activation closed app'; END IF; END $$;
RESET ROLE;
SET request.jwt.claims='{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000002"}'; SET ROLE authenticated;
SET request.path='/orders'; SELECT public.enforce_launch_gate();
DO $$ BEGIN IF (SELECT count(*) FROM public.orders)<>1 THEN RAISE EXCEPTION 'Admin release failed'; END IF; END $$;
RESET ROLE;
SET request.jwt.claims='{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000001"}'; SET ROLE authenticated;
SELECT public.admin_toggle_feature_flag('coming-soon',true,'reactivate',NULL);
DO $$ BEGIN
 IF (public.get_launch_gate_state()->>'ends_at')::timestamptz < now()+interval '19 days' THEN RAISE EXCEPTION 'Reactivation deadline failed'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'launch_gate_access: PASS' AS result;
