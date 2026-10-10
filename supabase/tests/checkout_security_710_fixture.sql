-- Synthetic data ONLY. Run only in the disposable database guarded by the runner.
BEGIN;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE id::text LIKE '71000000-%') THEN
    RAISE EXCEPTION 'Security 710 fixtures already exist: use a fresh disposable database';
  END IF;
END $$;

INSERT INTO auth.users (instance_id,id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
SELECT '00000000-0000-0000-0000-000000000000'::uuid,
       ('71000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
       'authenticated','authenticated','security710-' || n || '@example.test',now(),
       '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()
FROM generate_series(1,6) n;
INSERT INTO public.profiles(user_id,full_name,loyalty_points)
SELECT ('71000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,'Security 710 fixture',100
FROM generate_series(1,6) n
ON CONFLICT (user_id) DO UPDATE SET loyalty_points=100;
INSERT INTO public.user_roles(user_id,role) VALUES
('71000000-0000-4000-8000-000000000001','restaurateur'),
('71000000-0000-4000-8000-000000000004','admin'),
('71000000-0000-4000-8000-000000000006','restaurateur')
ON CONFLICT (user_id,role) DO NOTHING;

INSERT INTO public.feature_flags(name,label,is_active)
VALUES ('public-restaurants-all-sources','Security fixture public sources',true)
ON CONFLICT (name) DO UPDATE SET is_active=true;

INSERT INTO public.restaurants(id,owner_id,name,address,city,is_active,status,is_demo,
 image_url,is_directory_listing,directory_public_name_verified,directory_image_verified)
SELECT ('71010000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
       CASE WHEN n=8 THEN '71000000-0000-4000-8000-000000000006'::uuid
            ELSE '71000000-0000-4000-8000-000000000001'::uuid END,
       'Security fixture ' || n,'1 Rue Test, 1201 Geneve','Geneve',n<>2,
       CASE WHEN n=4 THEN 'pending' ELSE 'active' END,false,
       CASE WHEN n=3 THEN NULL ELSE 'https://example.test/fixture.jpg' END,
       n IN (5,6,7),n<>5,n<>6
FROM generate_series(1,8) n;

INSERT INTO public.menu_items(id,restaurant_id,name,price,is_available)
SELECT ('71040000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
       ('71010000-0000-4000-8000-' || lpad(LEAST(n,8)::text,12,'0'))::uuid,
       'Security menu ' || n,10,CASE WHEN n=9 THEN false WHEN n=10 THEN NULL ELSE true END
FROM generate_series(1,10) n;
-- Unavailable/null-availability items belong to owner 1's public restaurant.
UPDATE public.menu_items SET restaurant_id='71010000-0000-4000-8000-000000000001'
WHERE id IN ('71040000-0000-4000-8000-000000000009','71040000-0000-4000-8000-000000000010');

INSERT INTO public.promo_codes(id,code,type,value,max_discount,max_uses,per_user_limit,current_uses)
VALUES
('71030000-0000-4000-8000-000000000001','SEC710-PERCENT','percentage',10,25,100,100,1),
('71030000-0000-4000-8000-000000000002','SEC710-FIXED','fixed',5,NULL,100,100,0),
('71030000-0000-4000-8000-000000000003','SEC710-DELIVERY','free_delivery',0,NULL,100,100,0),
('71030000-0000-4000-8000-000000000004','SEC710-ZERO-BALANCE','fixed',100,NULL,100,100,0),
('71030000-0000-4000-8000-000000000005','SEC710-RESTAURANT','fixed',5,NULL,100,100,0),
('71030000-0000-4000-8000-000000000006','SEC710-LAST-USE','fixed',5,NULL,1,1,0);
UPDATE public.promo_codes SET restaurant_id='71010000-0000-4000-8000-000000000008'
WHERE id='71030000-0000-4000-8000-000000000005';

INSERT INTO public.orders(id,user_id,restaurant_id,delivery_address,total_amount,delivery_fee,metadata)
SELECT ('71020000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
       CASE WHEN n=8 THEN '71000000-0000-4000-8000-000000000003'::uuid
            ELSE '71000000-0000-4000-8000-000000000002'::uuid END,
       '71010000-0000-4000-8000-000000000001','Synthetic security fixture',
       CASE WHEN n IN (4,5) THEN 0 ELSE 100 END,5,
       jsonb_build_object('pre_discount_subtotal',CASE WHEN n=4 THEN 0 ELSE 100 END,
                          'payment_method',CASE WHEN n=2 THEN 'cash' ELSE 'card' END)
FROM generate_series(1,9) n;

-- Historical evidence exists BEFORE migration and must remain byte-for-byte intact.
INSERT INTO public.promo_code_uses(id,promo_code_id,user_id,order_id,discount_applied)
VALUES ('71050000-0000-4000-8000-000000000001','71030000-0000-4000-8000-000000000001',
        '71000000-0000-4000-8000-000000000002','71020000-0000-4000-8000-000000000009',3);

SELECT set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000004',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal2"}',true);
SELECT public.provision_commercial_demo_account('71000000-0000-4000-8000-000000000005','Security Demo','security710-5@example.test');
COMMIT;
