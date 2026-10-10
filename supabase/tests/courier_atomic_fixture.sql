-- Synthetic fixtures only, in the isolated runner database.
BEGIN;
SELECT set_config('request.jwt.claim.role','service_role',true);
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
INSERT INTO auth.users(instance_id,id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
SELECT '00000000-0000-0000-0000-000000000000'::uuid,
 ('74500000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated',
 'courier-atomic-'||n||'@example.test',now(),'{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()
FROM generate_series(1,5)n;
INSERT INTO public.restaurants(id,owner_id,name,address,city,is_active,status,is_demo)
VALUES ('74510000-0000-4000-8000-000000000001','74500000-0000-4000-8000-000000000001','Synthetic courier fixture','1 Rue Test, 1201 Geneve','Geneve',false,'pending',false);
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
