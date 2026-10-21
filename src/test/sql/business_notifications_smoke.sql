-- Isolated PostgreSQL fixture. Never run against a shared or production database.
\set ON_ERROR_STOP on
BEGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE SCHEMA cron;
CREATE TABLE auth.users(id uuid PRIMARY KEY, email text);
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
CREATE TABLE public.user_roles(user_id uuid REFERENCES auth.users,role text);
CREATE TABLE public.restaurants(id uuid PRIMARY KEY,owner_id uuid REFERENCES auth.users,name text,is_demo boolean DEFAULT false);
CREATE FUNCTION public.commercial_demo_user_is_restricted(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE TABLE public.notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES auth.users,title text,body text,type text,category text,data jsonb,created_at timestamptz DEFAULT now());
CREATE TABLE public.notification_preferences(user_id uuid PRIMARY KEY,channels jsonb,categories jsonb);
CREATE TABLE public.notification_deliveries(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),notification_id uuid REFERENCES public.notifications,channel text,status text,target text,scheduled_at timestamptz,sent_at timestamptz,next_attempt_at timestamptz);
CREATE TABLE public.email_queue(id uuid DEFAULT gen_random_uuid(),to_email text,metadata jsonb,created_at timestamptz DEFAULT now());
CREATE TABLE public.golden_tok_accreditations(restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants,applicant_id uuid REFERENCES auth.users,status text DEFAULT 'pending',subscription_status text DEFAULT 'not_subscribed',stripe_mode text,current_period_end timestamptz,cancel_at_period_end boolean DEFAULT false,application_note text,updated_at timestamptz DEFAULT now());
CREATE TABLE public.signup_applications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES auth.users,requested_role text,status text,metadata jsonb DEFAULT '{}');
CREATE TABLE public.restaurant_ai_subscriptions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),restaurant_id uuid REFERENCES public.restaurants,status text,stripe_mode text,cancel_at_period_end boolean DEFAULT false,scheduled_plan_change jsonb DEFAULT '{}',metadata jsonb DEFAULT '{}');
CREATE TABLE public.support_incidents(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES auth.users,restaurant_id uuid REFERENCES public.restaurants,status text DEFAULT 'open');
CREATE TABLE public.support_incident_messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),incident_id uuid REFERENCES public.support_incidents,author_id uuid REFERENCES auth.users,author_role text,visibility text,body text);
CREATE TABLE cron.job(jobid bigserial PRIMARY KEY,jobname text UNIQUE,schedule text,command text);
CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE sql AS $$ INSERT INTO cron.job(jobname,schedule,command) VALUES($1,$2,$3) ON CONFLICT(jobname) DO UPDATE SET schedule=excluded.schedule,command=excluded.command RETURNING jobid $$;
CREATE FUNCTION public.notification_test_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'NOTIFICATION ASSERTION: %',label; END IF; RAISE NOTICE 'PASS: %',label; END $$;
\ir _notification_queue_fixture.sql
\if :apply_notification_patch
\ir ../../../supabase/migrations/20261021110000_business_notification_event_wiring.sql
\endif
INSERT INTO auth.users VALUES ('00000000-0000-4000-8000-000000000001','admin@example.invalid'),('00000000-0000-4000-8000-000000000002','owner@example.invalid'),('00000000-0000-4000-8000-000000000003','client@example.invalid'),('00000000-0000-4000-8000-000000000004','other@example.invalid');
INSERT INTO public.user_roles VALUES ('00000000-0000-4000-8000-000000000001','admin');
INSERT INTO public.restaurants VALUES ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','Restaurant fixture',false),('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000004','Demo fixture',true);
INSERT INTO public.golden_tok_accreditations(restaurant_id,applicant_id,application_note) VALUES ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','A private application note not for email');
\if :apply_notification_patch
SELECT public.process_notification_business_events(100);
\endif
SELECT public.notification_test_assert((SELECT count(*)=1 FROM public.notifications WHERE user_id='00000000-0000-4000-8000-000000000001' AND type='golden_tok'),'Golden TOK application notifies the administrator exactly once');
\if :apply_notification_patch
SELECT public.notification_test_assert((SELECT count(*)=2 FROM public.notifications),'application receipt reaches the owner');
SELECT public.notification_test_assert((SELECT count(*)=6 FROM public.notification_deliveries),'application requests all three existing channels');
SELECT public.notification_test_assert(NOT EXISTS(SELECT 1 FROM public.notifications WHERE data::text LIKE '%private application%' OR body LIKE '%private application%'),'application note is not leaked');
SELECT public.process_notification_business_events(100);
SELECT public.notification_test_assert((SELECT count(*)=2 FROM public.notifications),'worker replay is idempotent');
UPDATE public.golden_tok_accreditations SET updated_at=now(),application_note='Changed note without a new application';
SELECT public.process_notification_business_events(100);
SELECT public.notification_test_assert((SELECT count(*)=2 FROM public.notifications),'metadata-only updates are silent');
UPDATE public.golden_tok_accreditations SET status='approved';
SELECT public.process_notification_business_events(100);
SELECT public.notification_test_assert((SELECT count(*)=1 FROM public.notifications WHERE data->>'event'='approved' AND user_id='00000000-0000-4000-8000-000000000002'),'approval notifies owner');
SELECT public.notification_test_assert(NOT EXISTS(SELECT 1 FROM public.notifications WHERE data->>'event'='subscription_active'),'approval is not a paid activation');
UPDATE public.golden_tok_accreditations SET stripe_mode='test',subscription_status='active',current_period_end=now()+interval '30 days';
SELECT public.process_notification_business_events(100);
SELECT public.notification_test_assert(NOT EXISTS(SELECT 1 FROM public.notifications WHERE data->>'event'='subscription_active'),'test billing creates no production alerts');
UPDATE public.golden_tok_accreditations SET stripe_mode='live';
SELECT public.process_notification_business_events(100);
SELECT public.notification_test_assert((SELECT count(*)=2 FROM public.notifications WHERE data->>'event'='subscription_active'),'live entitlement reaches owner and admin');
UPDATE public.golden_tok_accreditations SET cancel_at_period_end=true;
SELECT public.process_notification_business_events(100);
SELECT public.notification_test_assert((SELECT count(*)=2 FROM public.notifications WHERE data->>'event'='cancellation_scheduled'),'end-of-period cancellation is announced');
INSERT INTO public.golden_tok_accreditations(restaurant_id,applicant_id) VALUES ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000004');
SELECT public.process_notification_business_events(100);
SELECT public.notification_test_assert(NOT EXISTS(SELECT 1 FROM public.notifications WHERE data->>'restaurant_id'='10000000-0000-4000-8000-000000000002'),'demo restaurant is excluded');
INSERT INTO public.notification_preferences VALUES ('00000000-0000-4000-8000-000000000002','{"email":false,"push":true,"in_app":true}','{}');
UPDATE public.golden_tok_accreditations SET cancel_at_period_end=false WHERE restaurant_id='10000000-0000-4000-8000-000000000001';
SELECT public.process_notification_business_events(100);
SELECT public.notification_test_assert(NOT EXISTS(SELECT 1 FROM public.notification_deliveries d JOIN public.notifications n ON n.id=d.notification_id WHERE n.data->>'event'='cancellation_reversed' AND n.user_id='00000000-0000-4000-8000-000000000002' AND d.channel='email'),'email opt-out is respected');
-- Invalid preferences simulate a real enqueue failure after the business change.
UPDATE public.notification_preferences SET channels='{"email":"invalid-boolean"}' WHERE user_id='00000000-0000-4000-8000-000000000002';
UPDATE public.golden_tok_accreditations SET subscription_status='past_due' WHERE restaurant_id='10000000-0000-4000-8000-000000000001';
SELECT public.process_notification_business_events(100);
SELECT public.notification_test_assert((SELECT subscription_status='past_due' FROM public.golden_tok_accreditations WHERE restaurant_id='10000000-0000-4000-8000-000000000001'),'delivery failure never rolls back business state');
SELECT public.notification_test_assert(EXISTS(SELECT 1 FROM public.notification_business_events WHERE status='retrying' AND attempts=1 AND last_error IS NOT NULL),'failed enqueue remains retryable');
SELECT public.notification_test_assert(NOT EXISTS(SELECT 1 FROM public.notifications WHERE data->>'event'='subscription_past_due' AND user_id='00000000-0000-4000-8000-000000000002'),'failed delivery leaves no orphan notification');
UPDATE public.notification_preferences SET channels='{}';
UPDATE public.notification_business_events SET next_attempt_at=now() WHERE status='retrying';
SELECT public.process_notification_business_events(100);
SELECT public.notification_test_assert((SELECT count(*)=2 FROM public.notifications WHERE data->>'event'='subscription_past_due'),'retry succeeds once without repeating successful recipients');
-- Signup: confirmed-before-dossier is covered; legacy email is not duplicated.
INSERT INTO public.signup_applications(id,user_id,requested_role,status) VALUES ('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000003','courier','pending_review');
INSERT INTO public.email_queue(to_email,metadata) VALUES ('admin@example.invalid','{"application_id":"20000000-0000-4000-8000-000000000001","kind":"signup_admin_alert"}');
SELECT public.process_notification_business_events(100);
SELECT public.notification_test_assert((SELECT count(*)=1 FROM public.notifications WHERE type='signup_application' AND data->>'event'='pending_review'),'signup reaches admin in-app');
SELECT public.notification_test_assert(NOT EXISTS(SELECT 1 FROM public.notification_deliveries d JOIN public.notifications n ON n.id=d.notification_id WHERE n.type='signup_application' AND d.channel='email'),'legacy signup email is not duplicated');
UPDATE public.signup_applications SET status='needs_changes';
SELECT public.process_notification_business_events(100);
SELECT public.notification_test_assert(EXISTS(SELECT 1 FROM public.notifications WHERE type='signup_application' AND user_id='00000000-0000-4000-8000-000000000003' AND data->>'event'='needs_changes'),'review decision reaches applicant');
INSERT INTO public.restaurant_ai_subscriptions(id,restaurant_id,status,stripe_mode) VALUES ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','active','live');
UPDATE public.restaurant_ai_subscriptions SET cancel_at_period_end=true;
SELECT public.process_notification_business_events(100);
SELECT public.notification_test_assert((SELECT count(*)=2 FROM public.notifications WHERE type='restaurant_subscription' AND data->>'event'='cancellation_scheduled'),'restaurant cancellation reaches both parties');
INSERT INTO public.support_incidents(id,user_id,restaurant_id) VALUES ('40000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001');
INSERT INTO public.support_incident_messages(incident_id,author_id,author_role,visibility,body) VALUES ('40000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','admin','internal','private note');
SELECT public.process_notification_business_events(100);
SELECT public.notification_test_assert(NOT EXISTS(SELECT 1 FROM public.notifications WHERE type='support_reply'),'internal notes never alert a customer');
INSERT INTO public.support_incident_messages(incident_id,author_id,author_role,visibility,body) VALUES ('40000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','admin','public','public reply');
SELECT public.process_notification_business_events(100);
SELECT public.notification_test_assert((SELECT count(*)=1 FROM public.notifications WHERE type='support_reply' AND user_id='00000000-0000-4000-8000-000000000003'),'public reply reaches incident customer, not unrelated restaurant owner');
-- A delayed event must not leak to a demoted administrator or former owner.
UPDATE public.golden_tok_accreditations SET subscription_status='canceled' WHERE restaurant_id='10000000-0000-4000-8000-000000000001';
DELETE FROM public.user_roles WHERE role='admin';
UPDATE public.restaurants SET owner_id='00000000-0000-4000-8000-000000000004' WHERE id='10000000-0000-4000-8000-000000000001';
SELECT public.process_notification_business_events(100);
SELECT public.notification_test_assert(NOT EXISTS(SELECT 1 FROM public.notifications WHERE data->>'event'='subscription_canceled'),'recipient access is rechecked before processing');
SELECT public.notification_test_assert(NOT has_table_privilege('authenticated','public.notification_business_events','SELECT'),'outbox is private');
SELECT public.notification_test_assert(NOT has_function_privilege('authenticated','public.process_notification_business_events(integer)','EXECUTE'),'ordinary users cannot dispatch');
SELECT public.notification_test_assert(NOT has_function_privilege('anon','public.queue_business_notification(text,uuid,text,text,text,text,jsonb,text)','EXECUTE'),'anonymous callers cannot forge notifications');
SELECT public.notification_test_assert((SELECT count(*)=1 FROM cron.job WHERE jobname='tok-process-business-notifications'),'one bounded retry schedule is installed');
\endif
ROLLBACK;
