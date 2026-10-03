-- Execute only against scripts/fixtures/tok-audit-schema.sql in an isolated DB.
BEGIN;
INSERT INTO restaurants VALUES
 ('10000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001',false,true,'active'),
 ('10000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000002',false,false,'inactive');
INSERT INTO menu_items VALUES
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',true),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',false),
 ('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002',true);
INSERT INTO profiles VALUES ('a0000000-0000-4000-8000-000000000001',1000),('b0000000-0000-4000-8000-000000000002',1000);
INSERT INTO orders (id,user_id,restaurant_id,total_amount,delivery_fee,metadata,status)
 SELECT ('30000000-0000-4000-8000-00000000000'||n)::uuid,'a0000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',100,0,'{}','confirmed' FROM generate_series(1,3) n;
INSERT INTO promo_codes(id,is_active,per_user_limit,max_uses,current_uses,type,value) VALUES
 ('40000000-0000-4000-8000-000000000001',true,1,100,0,'fixed',10);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT test_assert(NOT has_table_privilege(current_user,'promo_code_uses','DELETE'),'client cannot delete promo history');
SELECT test_assert(NOT has_table_privilege(current_user,'promo_code_uses','UPDATE'),'client cannot update promo history');
SELECT test_assert(NOT has_table_privilege(current_user,'promo_code_uses','INSERT'),'client cannot insert promo history');
SELECT test_assert(NOT has_table_privilege(current_user,'promo_code_uses','TRUNCATE'),'RLS does not substitute for TRUNCATE privilege restrictions');
DO $$ BEGIN
 BEGIN PERFORM rate_limit_consume('sensitive','victim',1000,1); RAISE EXCEPTION 'client limiter execution unexpectedly allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN DELETE FROM promo_code_uses; RAISE EXCEPTION 'client delete unexpectedly allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN INSERT INTO promo_code_uses(user_id) VALUES(auth.uid()); RAISE EXCEPTION 'client insert unexpectedly allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT test_assert((SELECT count(*) FROM menu_items)=2,'restaurant owner keeps private item visibility');
SELECT test_assert((apply_checkout_benefits(auth.uid(),'30000000-0000-4000-8000-000000000001',0,'40000000-0000-4000-8000-000000000001',999999,'test')->>'promo_discount_applied')::numeric=10,'server ignores inflated client discount hint');
SELECT test_assert((SELECT count(*) FROM promo_code_uses)=1,'user can read own immutable history');
SELECT test_assert((apply_checkout_benefits(auth.uid(),'30000000-0000-4000-8000-000000000001',0,'40000000-0000-4000-8000-000000000001',999999,'retry')->>'promo_discount_applied')::numeric=10,'retry is idempotent');
DO $$ BEGIN
 BEGIN PERFORM apply_checkout_benefits(auth.uid(),'30000000-0000-4000-8000-000000000002',0,'40000000-0000-4000-8000-000000000001',0,'test'); RAISE EXCEPTION USING ERRCODE='P9999',MESSAGE='per user limit bypass'; EXCEPTION WHEN SQLSTATE 'P0001' THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','b0000000-0000-4000-8000-000000000002',true);
SELECT test_assert((SELECT count(*) FROM promo_code_uses)=0,'second user cannot read first user history');
DO $$ BEGIN
 BEGIN PERFORM apply_checkout_benefits('a0000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000003',0,NULL,0,'test'); RAISE EXCEPTION USING ERRCODE='P9999',MESSAGE='cross user call accepted'; EXCEPTION WHEN SQLSTATE 'P0001' THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','c0000000-0000-4000-8000-000000000003',true);
SELECT test_assert((SELECT count(*) FROM menu_items)=3,'admin retains non-demo unavailable and inactive menu visibility');
SELECT test_assert(NOT has_table_privilege(current_user,'promo_code_uses','DELETE'),'admin direct history mutation still uses server flow');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('request.jwt.claim.role','anon',true);
SELECT test_assert((SELECT count(*) FROM menu_items)=1,'anonymous only sees available items from an active restaurant');
SELECT test_assert((SELECT count(*) FROM promo_code_uses)=0,'anonymous sees no promo history');
SELECT test_assert(NOT has_function_privilege(current_user,'rate_limit_consume(text,text,integer,integer)','EXECUTE'),'anonymous limiter execution denied');
SELECT test_assert(NOT has_function_privilege(current_user,'apply_checkout_benefits(uuid,uuid,integer,uuid,numeric,text)','EXECUTE'),'anonymous checkout benefits execution denied');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role','service_role',true);
SELECT test_assert(rate_limit_consume('test','subject',1,60),'server limiter first hit succeeds');
SELECT test_assert(NOT rate_limit_consume('test','subject',1,60),'server limiter second hit is blocked');
SELECT test_assert((SELECT current_uses FROM promo_codes WHERE id='40000000-0000-4000-8000-000000000001')=1,'idempotent application increments global use once');
RESET ROLE;
SELECT test_assert(to_regclass('public.idx_menu_items_restaurant_id') IS NOT NULL,'menu lookup index exists');
SELECT test_assert(to_regclass('public.idx_print_fulfillment_jobs_order_id') IS NOT NULL,'print job FK index exists');
SELECT test_assert(to_regclass('public.idx_promo_code_uses_order_id') IS NOT NULL,'promo order FK index exists');
ROLLBACK;
