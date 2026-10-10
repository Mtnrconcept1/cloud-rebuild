-- Synthetic fixture for the guarded disposable runner; no provider is called.
BEGIN;
SELECT set_config('request.jwt.claim.role','service_role',true);
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE id::text LIKE '74300000-%') THEN
    RAISE EXCEPTION 'Use a fresh disposable database for the Actualites fixture';
  END IF;
END $$;
INSERT INTO auth.users (instance_id,id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
SELECT '00000000-0000-0000-0000-000000000000'::uuid,
       ('74300000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
       'authenticated','authenticated','actualites-fixture-'||n||'@example.test',now(),
       '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()
FROM generate_series(1,4) n;
INSERT INTO public.user_roles(user_id,role) VALUES
 ('74300000-0000-4000-8000-000000000001','restaurateur'),
 ('74300000-0000-4000-8000-000000000004','admin')
ON CONFLICT (user_id,role) DO NOTHING;
INSERT INTO public.restaurants(id,owner_id,name,address,city,status,is_active,is_demo)
VALUES ('74310000-0000-4000-8000-000000000001','74300000-0000-4000-8000-000000000001',
 'Actualites billing fixture','1 Rue Test, 1201 Geneve','Geneve','pending',false,false);
-- Follow the real approval prerequisites; no trigger or RLS is disabled.
INSERT INTO public.signup_applications(id,user_id,requested_role,full_name,selected_subscription_plan_id,metadata)
VALUES ('74320000-0000-4000-8000-000000000001','74300000-0000-4000-8000-000000000001',
 'restaurateur','Synthetic reviewed owner',
 (SELECT id FROM public.restaurant_subscription_plans WHERE slug='premium' AND is_active),
 '{"restaurant_id":"74310000-0000-4000-8000-000000000001"}'::jsonb);
UPDATE public.restaurant_ai_subscriptions SET status='awaiting_activation',payment_method_ready_at=now()
WHERE signup_application_id='74320000-0000-4000-8000-000000000001';
INSERT INTO public.restaurant_subscription_payment_methods(subscription_id,restaurant_id,
 stripe_checkout_session_id,stripe_setup_intent_id,stripe_customer_id,stripe_payment_method_id,stripe_mode,ready_at)
SELECT id,restaurant_id,'cs_test_synthetic743_'||id,'seti_synthetic743_'||id,
 'cus_synthetic743_'||id,'pm_synthetic743_'||id,'test',now()
FROM public.restaurant_ai_subscriptions WHERE signup_application_id='74320000-0000-4000-8000-000000000001';
SELECT set_config('request.jwt.claim.sub','74300000-0000-4000-8000-000000000004',true);
SELECT set_config('request.jwt.claims','{"sub":"74300000-0000-4000-8000-000000000004","role":"service_role"}',true);
UPDATE public.signup_applications SET status='approved',reviewed_by='74300000-0000-4000-8000-000000000004',reviewed_at=now()
WHERE id='74320000-0000-4000-8000-000000000001';
UPDATE public.restaurants SET status='active',is_active=true WHERE id='74310000-0000-4000-8000-000000000001';

INSERT INTO public.social_posts(id,restaurant_id,author_id,body,status,post_type,cta_type,visibility,published_at)
SELECT ('74330000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 '74310000-0000-4000-8000-000000000001','74300000-0000-4000-8000-000000000001',
 'Synthetic sponsored post '||n,'published','promo','order','public',now()-interval '5 minutes'
FROM generate_series(1,6) n;
INSERT INTO public.ad_campaigns(id,restaurant_id,type,title,body,status,payment_status,target_pages,
 pricing_strategy,cpm_rate,cpc_rate,total_budget,budget_daily,spent,daily_spent,daily_spent_date,starts_at,ends_at)
SELECT ('74340000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 '74310000-0000-4000-8000-000000000001','actualites','Synthetic paid campaign '||n,'Disposable fixture',
 'active','paid','["actualites"]'::jsonb,CASE WHEN n%2=1 THEN 'visibility' ELSE 'traffic' END,
 10,1,100,50,0,0,current_date,now()-interval '1 hour',now()+interval '1 day'
FROM generate_series(1,6) n;
INSERT INTO public.social_post_promotions(post_id,campaign_id,restaurant_id,status,starts_at,ends_at,budget_amount,placement,boost_weight,created_by)
SELECT ('74330000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 ('74340000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 '74310000-0000-4000-8000-000000000001','active',now()-interval '1 hour',now()+interval '1 day',
 100,'actualites_feed',1,'74300000-0000-4000-8000-000000000001'
FROM generate_series(1,6) n;
COMMIT;
