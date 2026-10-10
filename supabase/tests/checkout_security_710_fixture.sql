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
FROM generate_series(1,7) n;
INSERT INTO public.profiles(user_id,full_name,loyalty_points)
SELECT ('71000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,'Security 710 fixture',100
FROM generate_series(1,7) n
ON CONFLICT (user_id) DO UPDATE SET loyalty_points=100;
INSERT INTO public.user_roles(user_id,role) VALUES
('71000000-0000-4000-8000-000000000001','restaurateur'),
('71000000-0000-4000-8000-000000000004','admin'),
('71000000-0000-4000-8000-000000000007','restaurateur'),
('71000000-0000-4000-8000-000000000006','restaurateur')
ON CONFLICT (user_id,role) DO NOTHING;

INSERT INTO public.feature_flags(name,label,is_active)
VALUES ('public-restaurants-all-sources','Security fixture public sources',true)
ON CONFLICT (name) DO UPDATE SET is_active=true;

INSERT INTO public.restaurants(id,owner_id,name,address,city,is_active,status,is_demo,
 image_url,is_directory_listing,directory_public_name_verified,directory_image_verified,
 delivery_available,supports_dinein,supports_reservation,supports_scheduled,supports_pickup,
 supports_scheduled_orders,supports_group_orders,is_featured,directory_source,directory_source_reference)
SELECT ('71010000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
       CASE WHEN n=8 THEN '71000000-0000-4000-8000-000000000006'::uuid
            WHEN n=3 THEN '71000000-0000-4000-8000-000000000007'::uuid
            ELSE '71000000-0000-4000-8000-000000000001'::uuid END,
       'Security fixture ' || n,'1 Rue Test, 1201 Geneve','Geneve',n IN (5,6,7),
       CASE WHEN n IN (5,6,7) THEN 'active' ELSE 'pending' END,false,
       CASE WHEN n=3 THEN NULL ELSE 'https://example.test/fixture.jpg' END,
       n IN (5,6,7),n<>5,n<>6,
       false,false,false,false,false,false,false,false,
       CASE WHEN n IN (5,6,7) THEN 'security710-fixture' ELSE NULL END,
       CASE WHEN n IN (5,6,7) THEN n::text ELSE NULL END
FROM generate_series(1,8) n;

-- Establish actual publication prerequisites without bypassing any trigger:
-- submitted dossiers, synthetic payment-method readiness, then admin review.
INSERT INTO public.signup_applications(id,user_id,requested_role,full_name,metadata)
SELECT ('71060000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
       CASE n WHEN 1 THEN '71000000-0000-4000-8000-000000000001'::uuid
              WHEN 3 THEN '71000000-0000-4000-8000-000000000007'::uuid
              ELSE '71000000-0000-4000-8000-000000000006'::uuid END,
       'restaurateur','Synthetic reviewed owner',
       jsonb_build_object('restaurant_id','71010000-0000-4000-8000-' || lpad(n::text,12,'0'))
FROM unnest(ARRAY[1,3,8]) n;
INSERT INTO public.restaurant_ai_subscriptions(id,restaurant_id,signup_application_id,status,payment_method_ready_at,stripe_mode)
SELECT ('71070000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
       ('71010000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
       ('71060000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
       'awaiting_activation',now(),'test'
FROM unnest(ARRAY[1,3,8]) n;
INSERT INTO public.restaurant_subscription_payment_methods(subscription_id,restaurant_id,
 stripe_checkout_session_id,stripe_setup_intent_id,stripe_customer_id,stripe_payment_method_id,stripe_mode,ready_at)
SELECT id,restaurant_id,'cs_test_synthetic710_' || id,'seti_synthetic710_' || id,
       'cus_synthetic710_' || id,'pm_synthetic710_' || id,'test',now()
FROM public.restaurant_ai_subscriptions WHERE id::text LIKE '71070000-%';
SELECT set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000004',true);
SELECT set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000004","role":"service_role"}',true);
UPDATE public.signup_applications SET status='approved',reviewed_by='71000000-0000-4000-8000-000000000004',reviewed_at=now()
WHERE id::text LIKE '71060000-%';
UPDATE public.restaurants SET status='active',is_active=true
WHERE id IN ('71010000-0000-4000-8000-000000000001','71010000-0000-4000-8000-000000000003','71010000-0000-4000-8000-000000000008');

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
