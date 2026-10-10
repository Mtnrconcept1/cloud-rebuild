-- Synthetic fixtures for a disposable PostgreSQL only; no provider URLs or jobs.
BEGIN;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
INSERT INTO auth.users (id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
VALUES ('73200000-0000-4000-8000-000000000001','authenticated','authenticated','print-protocol@example.test','{}','{}',now(),now());
INSERT INTO public.restaurants (id,owner_id,name,address,city,is_active,status,is_demo)
VALUES ('73210000-0000-4000-8000-000000000001','73200000-0000-4000-8000-000000000001','Print protocol fixture','1 Test','Geneve',false,'pending',false);
INSERT INTO public.print_provider_products (id,provider,provider_reference)
VALUES ('73220000-0000-4000-8000-000000000001','cloudprinter','fixture-only');
INSERT INTO public.print_documents (id,restaurant_id)
VALUES ('73230000-0000-4000-8000-000000000001','73210000-0000-4000-8000-000000000001');
INSERT INTO public.print_exports (id,restaurant_id,print_document_id,provider_product_id,production_storage_path,md5,sha256)
VALUES ('73240000-0000-4000-8000-000000000001','73210000-0000-4000-8000-000000000001','73230000-0000-4000-8000-000000000001',
 '73220000-0000-4000-8000-000000000001','fixture-not-uploaded.pdf',repeat('a',32),repeat('b',64));
INSERT INTO public.print_quotes (id,restaurant_id,print_export_id,provider_product_id,quantity,country,provider_currency,
 provider_product_amount,selected_shipping_quote,selected_shipping_amount,customer_amount_cents,margin_cents,margin_bps,expires_at)
VALUES ('73250000-0000-4000-8000-000000000001','73210000-0000-4000-8000-000000000001','73240000-0000-4000-8000-000000000001',
 '73220000-0000-4000-8000-000000000001',100,'CH','CHF',10,'fixture-quote',1,1500,400,1000,now()+interval '1 hour');
INSERT INTO public.print_orders (id,restaurant_id,print_quote_id,print_export_id,status,payment_status,customer_amount_cents,quantity,shipping_address)
SELECT ('73260000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'73210000-0000-4000-8000-000000000001',
 '73250000-0000-4000-8000-000000000001','73240000-0000-4000-8000-000000000001','paid','paid',1500,100,'{}'
FROM generate_series(1,12) n;
INSERT INTO public.print_fulfillment_jobs (id,print_order_id,operation_key,status,attempt_count,max_attempts,lease_token,lease_expires_at)
SELECT ('73270000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('73260000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'fixture-'||n,'processing',CASE WHEN n=11 THEN 1 ELSE 0 END,2,('73280000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,clock_timestamp()+interval '10 minutes'
FROM generate_series(1,12) n;
-- A distinct operation on the same order must not defeat the per-order marker.
INSERT INTO public.print_fulfillment_jobs (id,print_order_id,operation_key,status,attempt_count,max_attempts,lease_token,lease_expires_at)
VALUES ('73270000-0000-4000-8000-000000000013','73260000-0000-4000-8000-000000000012','fixture-concurrent','processing',0,2,
 '73280000-0000-4000-8000-000000000013',clock_timestamp()+interval '10 minutes');
COMMIT;
