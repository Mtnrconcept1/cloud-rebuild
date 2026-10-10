-- Synthetic fixtures only, in the isolated runner database.
BEGIN;
SELECT set_config('request.jwt.claim.role','service_role',true);
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
INSERT INTO auth.users(instance_id,id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
SELECT '00000000-0000-0000-0000-000000000000'::uuid,
 ('74500000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated',
 'courier-atomic-'||n||'@example.test',now(),'{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()
FROM generate_series(1,6)n;
INSERT INTO public.user_roles(user_id,role) VALUES
('74500000-0000-4000-8000-000000000001','restaurateur'),
('74500000-0000-4000-8000-000000000006','admin');
INSERT INTO public.restaurants(id,owner_id,name,address,city,is_active,status,is_demo,image_url,
 delivery_available,supports_dinein,supports_reservation,supports_scheduled,supports_pickup,supports_scheduled_orders,supports_group_orders)
VALUES ('74510000-0000-4000-8000-000000000001','74500000-0000-4000-8000-000000000001','Synthetic courier fixture','1 Rue Test, 1201 Geneve','Geneve',false,'pending',false,'https://example.test/courier-fixture.jpg',
 false,false,false,false,false,false,false);
-- Real publication prerequisites, not a disabled acceptance/publication trigger.
INSERT INTO public.signup_applications(id,user_id,requested_role,full_name,selected_subscription_plan_id,metadata)
VALUES ('74560000-0000-4000-8000-000000000001','74500000-0000-4000-8000-000000000001','restaurateur','Synthetic owner',
 (SELECT id FROM public.restaurant_subscription_plans WHERE slug='starter' AND is_active),
 '{"restaurant_id":"74510000-0000-4000-8000-000000000001"}');
UPDATE public.restaurant_ai_subscriptions SET status='awaiting_activation',payment_method_ready_at=now()
WHERE signup_application_id='74560000-0000-4000-8000-000000000001';
INSERT INTO public.restaurant_subscription_payment_methods(subscription_id,restaurant_id,stripe_checkout_session_id,
 stripe_setup_intent_id,stripe_customer_id,stripe_payment_method_id,stripe_mode,ready_at)
SELECT id,restaurant_id,'cs_test_synthetic745_'||id,'seti_synthetic745_'||id,'cus_synthetic745_'||id,'pm_synthetic745_'||id,'test',now()
FROM public.restaurant_ai_subscriptions WHERE signup_application_id='74560000-0000-4000-8000-000000000001';
SELECT set_config('request.jwt.claim.sub','74500000-0000-4000-8000-000000000006',true);
SELECT set_config('request.jwt.claims','{"sub":"74500000-0000-4000-8000-000000000006","role":"service_role"}',true);
UPDATE public.signup_applications SET status='approved',reviewed_by='74500000-0000-4000-8000-000000000006',reviewed_at=now()
WHERE id='74560000-0000-4000-8000-000000000001';
UPDATE public.restaurants SET is_active=true,status='active' WHERE id='74510000-0000-4000-8000-000000000001';
INSERT INTO public.couriers(id,user_id,first_name,last_name,status,is_online)
SELECT ('74530000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 ('74500000-0000-4000-8000-'||lpad((n+2)::text,12,'0'))::uuid,'Synthetic','Courier '||n,'approved',true
FROM generate_series(1,3)n;
INSERT INTO public.orders(id,user_id,restaurant_id,delivery_address,total_amount,status)
SELECT ('74520000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 '74500000-0000-4000-8000-000000000002','74510000-0000-4000-8000-000000000001','Synthetic delivery',10,'preparing'
FROM generate_series(1,12)n;
INSERT INTO public.dispatch_jobs(id,order_id,status)
VALUES ('74540000-0000-4000-8000-000000000001','74520000-0000-4000-8000-000000000001','searching');
INSERT INTO public.dispatch_attempts(id,dispatch_job_id,courier_id,timeout_seconds,estimated_earnings)
SELECT ('74550000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 '74540000-0000-4000-8000-000000000001',('74530000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,3600,5
FROM generate_series(1,2)n;
COMMIT;
