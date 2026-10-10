-- Behavioral tests with actual PostgreSQL roles. Fixture is created by the runner.
BEGIN;
CREATE FUNCTION pg_temp.check_710(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION '710 assertion failed: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.denied_710(statement text,expected text DEFAULT 'permission denied') RETURNS void
LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  BEGIN
    EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ~* expected THEN RETURN; END IF;
    RAISE;
  END;
  RAISE EXCEPTION '710 expected rejection did not occur: %',statement;
END $$;

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.role','anon',true);
SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('request.jwt.claims','{"role":"anon"}',true);
SELECT pg_temp.check_710(
 (SELECT array_agg(right(id::text,2) ORDER BY id) FROM public.menu_items WHERE id::text LIKE '71040000-%')
 = ARRAY['01','07','08'], 'anonymous public menu requires availability and every publication condition');
SELECT pg_temp.denied_710($q$SELECT public.rate_limit_consume('710','anon',10,60)$q$);
SELECT pg_temp.check_710((SELECT count(*) FROM public.restaurants WHERE is_demo)=0,'canonical demo is not publicly listed');
SELECT pg_temp.denied_710($q$SELECT public.apply_checkout_benefits('71000000-0000-4000-8000-000000000002','71020000-0000-4000-8000-000000000001')$q$);

RESET ROLE;
UPDATE public.feature_flags SET is_active=false WHERE name='public-restaurants-all-sources';
SET LOCAL ROLE anon;
SELECT pg_temp.check_710((SELECT count(*) FROM public.menu_items WHERE id::text LIKE '71040000-%')=0,'non-catalogue source cannot leak menus');
RESET ROLE;
UPDATE public.feature_flags SET is_active=true WHERE name='public-restaurants-all-sources';
UPDATE public.restaurants SET address='1 Rue Test, 1000 Lausanne' WHERE id='71010000-0000-4000-8000-000000000007';
SET LOCAL ROLE anon;
SELECT pg_temp.check_710((SELECT count(*) FROM public.menu_items WHERE id='71040000-0000-4000-8000-000000000007')=0,'contradictory address city cannot leak menus');
RESET ROLE;
UPDATE public.restaurants SET address='1 Rue Test, 1201 Geneve' WHERE id='71010000-0000-4000-8000-000000000007';
SELECT set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000002',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.check_710(
 (SELECT array_agg(right(id::text,2) ORDER BY id) FROM public.menu_items WHERE id::text LIKE '71040000-%')
 = ARRAY['01','07','08'], 'authenticated public menu matches anonymous boundary');
SELECT pg_temp.denied_710($q$SELECT public.rate_limit_consume('710','authenticated',10,60)$q$);
SELECT pg_temp.denied_710($q$INSERT INTO public.promo_code_uses(promo_code_id,user_id,discount_applied) VALUES ('71030000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000002',999)$q$);
SELECT pg_temp.denied_710($q$UPDATE public.promo_code_uses SET discount_applied=999 WHERE id='71050000-0000-4000-8000-000000000001'$q$);
SELECT pg_temp.denied_710($q$DELETE FROM public.promo_code_uses WHERE id='71050000-0000-4000-8000-000000000001'$q$);
SELECT pg_temp.check_710((SELECT count(*) FROM public.promo_code_uses WHERE id='71050000-0000-4000-8000-000000000001')=1,'own history remains readable');
SELECT pg_temp.check_710((public.apply_checkout_benefits('71000000-0000-4000-8000-000000000002','71020000-0000-4000-8000-000000000001',0,'71030000-0000-4000-8000-000000000001',999)->>'promo_discount_applied')::numeric=10,'forged percentage discount ignored');
SELECT pg_temp.check_710((public.apply_checkout_benefits('71000000-0000-4000-8000-000000000002','71020000-0000-4000-8000-000000000001',0,'71030000-0000-4000-8000-000000000001',1000000)->>'promo_discount_applied')::numeric=10,'replay retains authoritative first amount');
SELECT pg_temp.check_710((public.apply_checkout_benefits('71000000-0000-4000-8000-000000000002','71020000-0000-4000-8000-000000000002',0,'71030000-0000-4000-8000-000000000002',999)->>'promo_discount_applied')::numeric=5,'cash order remains eligible with fixed server discount');
SELECT pg_temp.check_710((public.apply_checkout_benefits('71000000-0000-4000-8000-000000000002','71020000-0000-4000-8000-000000000003',0,'71030000-0000-4000-8000-000000000003',999)->>'promo_discount_applied')::numeric=5,'free delivery uses order delivery fee');
SELECT pg_temp.check_710((public.apply_checkout_benefits('71000000-0000-4000-8000-000000000002','71020000-0000-4000-8000-000000000004',0,'71030000-0000-4000-8000-000000000002',999)->>'promo_discount_applied')::numeric=0,'zero subtotal cannot receive caller forged amount');
SELECT pg_temp.check_710((public.apply_checkout_benefits('71000000-0000-4000-8000-000000000002','71020000-0000-4000-8000-000000000005',0,'71030000-0000-4000-8000-000000000004',999)->>'promo_discount_applied')::numeric=100,'zero payable balance retains server pre-discount subtotal');
SELECT pg_temp.denied_710($q$SELECT public.apply_checkout_benefits('71000000-0000-4000-8000-000000000003','71020000-0000-4000-8000-000000000008',0,'71030000-0000-4000-8000-000000000001',999)$q$,'Forbidden');
SELECT pg_temp.denied_710($q$SELECT public.apply_checkout_benefits('71000000-0000-4000-8000-000000000002','71020000-0000-4000-8000-000000000001',0,'71030000-0000-4000-8000-000000000005',999)$q$,'pas valable');
SELECT pg_temp.denied_710($q$SELECT public.apply_checkout_benefits('71000000-0000-4000-8000-000000000002','71020000-0000-4000-8000-000000000001',101)$q$,'insuffisants');

RESET ROLE;
SELECT set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000003',true);
SELECT set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.check_710((SELECT count(*) FROM public.promo_code_uses WHERE id='71050000-0000-4000-8000-000000000001')=0,'other user history hidden');

RESET ROLE;
SELECT set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.check_710((SELECT count(*) FROM public.menu_items WHERE id IN ('71040000-0000-4000-8000-000000000002','71040000-0000-4000-8000-000000000009','71040000-0000-4000-8000-000000000010'))=3,'owner sees unpublished and unavailable own menu');
WITH changed AS (UPDATE public.menu_items SET price=price+1 WHERE id='71040000-0000-4000-8000-000000000008' RETURNING id)
SELECT pg_temp.check_710((SELECT count(*) FROM changed)=0,'owner cannot edit another restaurant menu');

RESET ROLE;
SELECT set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000004',true);
SELECT set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.check_710((SELECT count(*) FROM public.menu_items WHERE id::text LIKE '71040000-%')=10,'admin sees production menus including unavailable');
SELECT pg_temp.denied_710($q$DELETE FROM public.promo_code_uses WHERE id='71050000-0000-4000-8000-000000000001'$q$);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000005',true);
SELECT set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000005","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.check_710(public.commercial_demo_current_user_is_restricted(),'fixture is a restricted demo account');
SELECT pg_temp.check_710((SELECT count(*) FROM public.menu_items WHERE id::text LIKE '71040000-%')=0,'demo cannot see production menus');
SELECT pg_temp.denied_710($q$INSERT INTO public.menu_items(restaurant_id,name,price) VALUES ('71010000-0000-4000-8000-000000000001','forbidden demo write',10)$q$,'row-level security|permission denied');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('request.jwt.claim.role','service_role',true);
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
SELECT pg_temp.denied_710($q$UPDATE public.restaurants SET is_active=true WHERE id=public.commercial_demo_shared_restaurant_id()$q$,'COMMERCIAL_DEMO_CANONICAL_MUST_REMAIN_INERT');
SELECT public.rate_limit_consume('710','trusted-edge',10,60);
SELECT pg_temp.check_710((SELECT count(*) FROM public.menu_items WHERE id::text LIKE '71040000-%')=10,'trusted service retains menu access');
SELECT pg_temp.denied_710($q$INSERT INTO public.orders(user_id,restaurant_id,delivery_address,total_amount) VALUES ('71000000-0000-4000-8000-000000000005','71010000-0000-4000-8000-000000000001','forbidden demo transaction',10)$q$,'COMMERCIAL_DEMO');
ROLLBACK;
