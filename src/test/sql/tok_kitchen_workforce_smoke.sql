\set ON_ERROR_STOP on
-- Runs only on the disposable PostgreSQL 17 service after TOK Workforce smoke.
-- Complete both kitchen migrations, then exercise real invoker-RLS and RPCs.
RESET ROLE;
ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS owner_id uuid;
ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';

CREATE TABLE public.restaurant_branches (
  id uuid PRIMARY KEY, restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
  name text NOT NULL, is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.reservation_tables (
  id uuid PRIMARY KEY, branch_id uuid NOT NULL REFERENCES public.restaurant_branches(id),
  table_number text NOT NULL, capacity integer NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.menu_items (
  id uuid PRIMARY KEY, restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
  name text NOT NULL, price numeric NOT NULL, category text,
  is_available boolean NOT NULL DEFAULT true,
  available_on_card boolean NOT NULL DEFAULT true
);
CREATE OR REPLACE FUNCTION public.commercial_demo_current_user_is_restricted()
RETURNS boolean LANGUAGE sql STABLE SET search_path = ''
AS $$ SELECT false $$;
GRANT SELECT ON public.restaurants TO authenticated;

\i supabase/migrations/20261103062023_kitchen_table_service.sql
\i supabase/migrations/20261103114909_kitchen_tok_workforce_access.sql

CREATE FUNCTION pg_temp.kitchen_assert(p_condition boolean, p_label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_condition IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Kitchen assertion failed: %', p_label;
  END IF;
END $$;
CREATE FUNCTION pg_temp.kitchen_denied(p_command text, p_state text DEFAULT '42501')
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_rejected boolean := false;
BEGIN
  BEGIN
    EXECUTE p_command;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> p_state THEN
      RAISE EXCEPTION 'Unexpected SQLSTATE %, expected %: %', SQLSTATE, p_state, SQLERRM;
    END IF;
    v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Unauthorized kitchen operation accepted: %', p_command; END IF;
END $$;

\set kitchen_owner '00000000-0000-4000-8000-000000000015'
\set kitchen_waiter '00000000-0000-4000-8000-000000000016'
\set kitchen_outsider '00000000-0000-4000-8000-000000000017'
\set kitchen_restaurant '10000000-0000-4000-8000-000000000015'
\set kitchen_other '10000000-0000-4000-8000-000000000017'
\set kitchen_table '30000000-0000-4000-8000-000000000015'
\set kitchen_other_table '30000000-0000-4000-8000-000000000017'
\set kitchen_dish '40000000-0000-4000-8000-000000000015'
\set kitchen_key '50000000-0000-4000-8000-000000000015'

INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 (:'kitchen_owner','kitchen-owner@example.test',now()),
 (:'kitchen_waiter','kitchen-waiter@example.test',now()),
 (:'kitchen_outsider','kitchen-outsider@example.test',now());
INSERT INTO public.restaurants(id,name,owner_id,is_active,is_demo,status) VALUES
 (:'kitchen_restaurant','Bistro cuisine',:'kitchen_owner',true,false,'active'),
 (:'kitchen_other','Autre cuisine',:'kitchen_outsider',true,false,'active');
INSERT INTO public.restaurant_branches(id,restaurant_id,name) VALUES
 ('60000000-0000-4000-8000-000000000015',:'kitchen_restaurant','Salle principale'),
 ('60000000-0000-4000-8000-000000000017',:'kitchen_other','Salle autre');
INSERT INTO public.reservation_tables(id,branch_id,table_number,capacity) VALUES
 (:'kitchen_table','60000000-0000-4000-8000-000000000015','12',4),
 (:'kitchen_other_table','60000000-0000-4000-8000-000000000017','99',6);
INSERT INTO public.menu_items(id,restaurant_id,name,price,category) VALUES
 (:'kitchen_dish',:'kitchen_restaurant','Pizza margherita',19.00,'Pizzas');
SET "request.jwt.claim.sub" = :'kitchen_owner';
SET "test.is_admin" = 'yes';
INSERT INTO public.tok_workforce_settings(restaurant_id,enabled,updated_by)
 VALUES (:'kitchen_restaurant',true,:'kitchen_owner');
INSERT INTO public.tok_workforce_employees
 (id,restaurant_id,user_id,first_name,last_name,email,role,is_active,started_on)
 VALUES ('20000000-0000-4000-8000-000000000016',:'kitchen_restaurant',:'kitchen_waiter',
         'Alice','Service','kitchen-waiter@example.test','employee',true,current_date);

SET ROLE authenticated;
SET "request.jwt.claim.sub" = :'kitchen_waiter';
SET "test.owner" = '';
SET "test.is_admin" = 'no';
SELECT pg_temp.kitchen_assert(
 public.kitchen_can_submit(:'kitchen_restaurant'),
 'Linked TOK Équipe employee can submit a kitchen ticket');
SELECT pg_temp.kitchen_assert(
 NOT public.kitchen_can_submit(:'kitchen_other'),
 'Waiter cannot submit in another restaurant');
SELECT pg_temp.kitchen_assert(
 (SELECT jsonb_array_length(public.kitchen_get_setup(:'kitchen_restaurant')->'menu')) = 1,
 'Authorized waiter sees the exact menu');
SELECT pg_temp.kitchen_denied(
 format('SELECT public.kitchen_get_setup(%L)', :'kitchen_other'));
SELECT pg_temp.kitchen_denied(
 format('SELECT public.kitchen_advance_ticket(%L,%L,%L)',
        :'kitchen_key', 'queued', 'preparing'));

CREATE TEMP TABLE kitchen_smoke_result(ticket_id uuid);
INSERT INTO kitchen_smoke_result(ticket_id) SELECT public.kitchen_create_ticket(
  :'kitchen_restaurant', :'kitchen_table',
  jsonb_build_array(jsonb_build_object('menu_item_id', :'kitchen_dish', 'quantity', 2)),
  'Sans gluten', :'kitchen_key');
SELECT pg_temp.kitchen_assert(
 (SELECT count(*)=1 FROM public.kitchen_tickets), 'Waiter created one visible ticket');
SELECT pg_temp.kitchen_assert(
 (SELECT count(*)=1 AND sum(quantity)=2 FROM public.kitchen_ticket_items),
 'Items are snapshotted with the server-verified quantities');
SELECT pg_temp.kitchen_assert(
 (SELECT id FROM public.kitchen_tickets LIMIT 1) =
 public.kitchen_create_ticket(
    :'kitchen_restaurant', :'kitchen_table',
    jsonb_build_array(jsonb_build_object('menu_item_id', :'kitchen_dish', 'quantity', 2)),
    'Sans gluten', :'kitchen_key'),
 'Retry with same request key is idempotent');
SELECT pg_temp.kitchen_assert(
 (SELECT count(*)=1 FROM public.kitchen_tickets), 'No duplicate kitchen tickets');
SELECT pg_temp.kitchen_assert(
 jsonb_array_length(public.kitchen_list_tickets(:'kitchen_restaurant'))=1,
 'Waiter list RPC returns the ticket he submitted');
SELECT pg_temp.kitchen_denied(format(
 'SELECT public.kitchen_advance_ticket(%L,%L,%L)',
 (SELECT ticket_id FROM kitchen_smoke_result LIMIT 1), 'queued', 'preparing'));
SELECT pg_temp.kitchen_denied(
 format('SELECT public.kitchen_create_ticket(%L,%L,%L::jsonb,%L,%L)',
        :'kitchen_other', :'kitchen_other_table', '[]', '', gen_random_uuid()));

-- Verify revoked, inactive or outside-contract employees immediately lose access.
RESET ROLE;
UPDATE public.tok_workforce_employees SET is_active=false
 WHERE user_id=:'kitchen_waiter' AND restaurant_id=:'kitchen_restaurant';
SET ROLE authenticated;
SELECT pg_temp.kitchen_assert(
 NOT public.kitchen_can_submit(:'kitchen_restaurant'), 'Revocation disables submission');
SELECT pg_temp.kitchen_assert(
 (SELECT count(*)=0 FROM public.kitchen_tickets), 'Revocation also revokes RLS read');
SELECT pg_temp.kitchen_denied(
 format('SELECT public.kitchen_get_setup(%L)', :'kitchen_restaurant'));
RESET ROLE;
UPDATE public.tok_workforce_employees SET is_active=true,started_on=date '2099-01-01'
 WHERE user_id=:'kitchen_waiter' AND restaurant_id=:'kitchen_restaurant';
SET ROLE authenticated;
SELECT pg_temp.kitchen_assert(
 NOT public.kitchen_can_submit(:'kitchen_restaurant'), 'Future employee cannot submit');
RESET ROLE;
UPDATE public.tok_workforce_employees SET started_on=date '2026-01-01',ended_on=date '2026-01-02'
 WHERE user_id=:'kitchen_waiter' AND restaurant_id=:'kitchen_restaurant';
SET ROLE authenticated;
SELECT pg_temp.kitchen_assert(
 NOT public.kitchen_can_submit(:'kitchen_restaurant'), 'Ended contract cannot submit');
RESET ROLE;
UPDATE public.tok_workforce_employees SET ended_on=NULL
 WHERE user_id=:'kitchen_waiter' AND restaurant_id=:'kitchen_restaurant';
SET "test.is_admin" = 'yes';
SET "request.jwt.claim.sub" = :'kitchen_owner';
UPDATE public.tok_workforce_settings SET enabled=false WHERE restaurant_id=:'kitchen_restaurant';
SET ROLE authenticated;
SET "test.is_admin" = 'no';
SET "request.jwt.claim.sub" = :'kitchen_waiter';
SELECT pg_temp.kitchen_assert(
 NOT public.kitchen_can_submit(:'kitchen_restaurant'), 'Disabled TOK Équipe blocks submission');
RESET ROLE;
SET "test.is_admin" = 'yes';
SET "request.jwt.claim.sub" = :'kitchen_owner';
UPDATE public.tok_workforce_settings SET enabled=true WHERE restaurant_id=:'kitchen_restaurant';

SET ROLE authenticated;
SET "test.is_admin" = 'no';
SET "request.jwt.claim.sub" = :'kitchen_outsider';
SELECT pg_temp.kitchen_assert(
 (SELECT count(*)=0 FROM public.kitchen_tickets), 'Unrelated owner cannot see other tickets');
SELECT pg_temp.kitchen_assert(
 jsonb_array_length(public.kitchen_list_tickets(:'kitchen_restaurant'))=0,
 'Cross-restaurant list RPC is empty');
SELECT pg_temp.kitchen_denied(
 format('SELECT public.kitchen_get_setup(%L)', :'kitchen_restaurant'));

SET "request.jwt.claim.sub" = :'kitchen_owner';
SELECT pg_temp.kitchen_assert(
 (SELECT count(*)=1 FROM public.kitchen_tickets),
 'Restaurant owner sees the staff-submitted ticket');
SELECT pg_temp.kitchen_assert(
 jsonb_array_length(public.kitchen_list_tickets(:'kitchen_restaurant'))=1,
 'Owner list RPC includes the staff ticket');
SELECT pg_temp.kitchen_assert(
 public.kitchen_advance_ticket((SELECT ticket_id FROM kitchen_smoke_result LIMIT 1),
                              'queued','preparing'),
 'Only owner advances the staff ticket');
SELECT pg_temp.kitchen_assert(
 (SELECT count(*)=1 FROM public.kitchen_tickets WHERE status='preparing'),
 'Owner status change is persisted');
RESET ROLE;
SELECT 'TOK KITCHEN WORKFORCE POSTGRES SMOKE PASSED' AS result;
