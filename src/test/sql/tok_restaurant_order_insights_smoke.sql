\set ON_ERROR_STOP on
-- PostgreSQL 17 integration, after tok_workforce_postgres_smoke and tok_kitchen_workforce_smoke.
-- Disposable database only. No customer personal data.
RESET ROLE;

CREATE TABLE public.orders (
 id uuid primary key default gen_random_uuid(),
 restaurant_id uuid not null references public.restaurants(id),
 status text not null, payment_status text,
 created_at timestamptz not null default now(),
 branch_id uuid,
 total_amount numeric not null, source text,
 scheduled_for timestamptz, scheduled_at timestamptz,
 discount_amount numeric, tax_amount numeric, tip_amount numeric,
 accepted_at timestamptz, ready_at timestamptz,
 delivered_at timestamptz, actual_delivered_at timestamptz,
 cancelled_at timestamptz
);
CREATE TABLE public.order_items (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.orders(id),
 restaurant_id uuid,
 menu_item_id uuid references public.menu_items(id) on delete set null,
 anti_waste_offer_id uuid,
 quantity integer not null, unit_price numeric not null, total_price numeric not null,
 metadata jsonb
);
CREATE TABLE public.anti_waste_offers (
 id uuid primary key, restaurant_id uuid references public.restaurants(id), title text not null
);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.orders,public.order_items,public.menu_items,public.restaurant_branches TO authenticated;
CREATE POLICY insights_mock_owner_orders ON public.orders
 FOR SELECT TO authenticated USING (
 EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id=orders.restaurant_id AND r.owner_id=auth.uid()));
CREATE POLICY insights_mock_owner_items ON public.order_items
 FOR SELECT TO authenticated USING (
 EXISTS (SELECT 1 FROM public.orders o WHERE o.id=order_items.order_id));

\set owner '00000000-0000-4000-8000-000000000015'
\set waiter '00000000-0000-4000-8000-000000000016'
\set outsider '00000000-0000-4000-8000-000000000017'
\set restaurant '10000000-0000-4000-8000-000000000015'
\set other '10000000-0000-4000-8000-000000000017'
\set menu_item '40000000-0000-4000-8000-000000000015'
\set paid_id '70000000-0000-4000-8000-000000000015'
\set failed_id '70000000-0000-4000-8000-000000000016'
\set old_id '70000000-0000-4000-8000-000000000017'

-- Save a valid order before the migration to test historical backfill.
INSERT INTO public.orders(id,restaurant_id,status,payment_status,total_amount,source) VALUES
 (:'paid_id',:'restaurant','delivered','paid',60,'app'),
 (:'failed_id',:'restaurant','payment_failed','failed',80,'app');
INSERT INTO public.orders(id,restaurant_id,status,payment_status,total_amount,source,created_at) VALUES
 (:'old_id',:'restaurant','delivered','paid',25,'app','2025-03-02T10:00:00Z');
INSERT INTO public.order_items(order_id,restaurant_id,menu_item_id,quantity,unit_price,total_price)
VALUES (:'paid_id',:'restaurant',:'menu_item',3,19,57);

\i supabase/migrations/20261103140056_restaurant_order_insights.sql

CREATE FUNCTION pg_temp.insight_assert(p_ok boolean,p_label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
 IF p_ok IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Insights assertion failed: %',p_label; END IF;
END $$;

CREATE FUNCTION pg_temp.insight_denied(p_sql text,p_state text DEFAULT '42501') RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_failed boolean:=false;
BEGIN
 BEGIN EXECUTE p_sql;
 EXCEPTION WHEN OTHERS THEN
   IF SQLSTATE <> p_state THEN
     RAISE EXCEPTION 'Unexpected SQLSTATE %, expected %: %',SQLSTATE,p_state,SQLERRM;
   END IF;
   v_failed:=true;
 END;
 IF NOT v_failed THEN RAISE EXCEPTION 'Unauthorized analytics query succeeded: %',p_sql; END IF;
END $$;

SELECT pg_temp.insight_assert(
 (SELECT product_name_snapshot='Pizza margherita' FROM public.order_items WHERE order_id=:'paid_id'),
 'Pre-existing order item got its historical product name');

UPDATE public.menu_items SET name='Pizza renommée' WHERE id=:'menu_item';
INSERT INTO public.order_items(order_id,restaurant_id,menu_item_id,quantity,unit_price,total_price)
VALUES
 (:'failed_id',:'restaurant',:'menu_item',9,19,171),
 (:'old_id',:'restaurant',:'menu_item',1,19,19);

SELECT pg_temp.insight_assert(
 (SELECT product_name_snapshot='Pizza margherita' FROM public.order_items WHERE order_id=:'paid_id'),
 'Updating the menu does not change captured history');
SELECT pg_temp.insight_assert(
 (SELECT product_name_snapshot='Pizza renommée' FROM public.order_items WHERE order_id=:'failed_id'),
 'New orders capture the updated menu name');

SELECT pg_temp.insight_assert(
 (SELECT count(*)=2 FROM pg_indexes WHERE schemaname='public'
  AND indexname IN ('idx_orders_restaurant_created_insights','idx_kitchen_tickets_restaurant_created_insights')),
 'Period lookups are indexed');
SELECT pg_temp.insight_assert(
 (SELECT has_function_privilege('anon',
   'public.restaurant_order_insights(uuid,integer,date,uuid,text)','EXECUTE'))=false,
 'Anonymous role cannot execute analytics');
SELECT pg_temp.insight_assert(
 (SELECT has_function_privilege('anon',
   'public.restaurant_order_history(uuid,integer,date,uuid,text,integer)','EXECUTE'))=false,
 'Anonymous role cannot execute history');

SET ROLE authenticated;
SET "request.jwt.claim.sub"=:'owner';
SET "test.is_admin"='no';
SET "test.owner"=:'restaurant';

SELECT pg_temp.insight_assert(
 (SELECT (v->'summary'->>'recorded_orders')::integer=3
  FROM (SELECT public.restaurant_order_insights(:'restaurant') AS v) r),
 'All current-period orders across channels are recorded');
SELECT pg_temp.insight_assert(
 (SELECT (v->'summary'->>'confirmed_orders')::integer=2
  FROM (SELECT public.restaurant_order_insights(:'restaurant') AS v) r),
 'Payment failure is excluded from confirmed order counts');
SELECT pg_temp.insight_assert(
 (SELECT (v->'summary'->>'confirmed_units')::integer=5
  FROM (SELECT public.restaurant_order_insights(:'restaurant') AS v) r),
 'Two kitchen portions plus three paid online portions, never nine failed portions');
SELECT pg_temp.insight_assert(
 (SELECT (v->'summary'->>'excluded_orders')::integer=1
  FROM (SELECT public.restaurant_order_insights(:'restaurant') AS v) r),
 'Rejected or failed payments remain recorded separately');
SELECT pg_temp.insight_assert(
 (SELECT (v->'summary'->>'estimated_value_chf')::numeric=98
  FROM (SELECT public.restaurant_order_insights(:'restaurant') AS v) r),
 'Indicative combined value is computed from 38 room + 60 online');
SELECT pg_temp.insight_assert(
 (SELECT (v->'summary'->>'room_value_chf')::numeric=38
  FROM (SELECT public.restaurant_order_insights(:'restaurant') AS v) r),
 'No double-counted room ticket amounts');
SELECT pg_temp.insight_assert(
 (SELECT (v->'summary'->>'online_value_chf')::numeric=60
  FROM (SELECT public.restaurant_order_insights(:'restaurant') AS v) r),
 'No failed payments in online estimated value');
SELECT pg_temp.insight_assert(
 (SELECT jsonb_array_length(v->'hours')=24
   AND jsonb_array_length(v->'weekdays')=7
   AND jsonb_array_length(v->'days')=30
   AND (SELECT sum((h->>'orders')::integer) FROM jsonb_array_elements(v->'hours') h)=2
   AND (SELECT sum((d->>'orders')::integer) FROM jsonb_array_elements(v->'days') d)=2
   FROM (SELECT public.restaurant_order_insights(:'restaurant') AS v) r),
 'Hour/weekday/day buckets have correct lengths and no duplicate days');
SELECT pg_temp.insight_assert(
 (SELECT (v->'top_products'->0->>'units_confirmed')::integer=5
   AND (v->'top_products'->0->>'room_units')::integer=2
   AND (v->'top_products'->0->>'online_units')::integer=3
   AND (v->'top_products'->0->>'channel')='mixte'
   AND (v->'top_products'->0->>'name')='Pizza margherita'
   FROM (SELECT public.restaurant_order_insights(:'restaurant') AS v) r),
 'Product ranking uses captured historical name and confirmed quantities');

SELECT pg_temp.insight_assert(
 (SELECT (v->>'total')::integer=3 AND jsonb_array_length(v->'orders')=3
  FROM (SELECT public.restaurant_order_history(:'restaurant') AS v) r),
 'Historique paginé includes kitchen, paid and failed online orders');
SELECT pg_temp.insight_assert(
 (SELECT (v->>'total')::integer=1
   FROM (SELECT public.restaurant_order_history(
     :'restaurant',7,date '2025-03-02') AS v) r),
 'Older orders can be browsed by moving the date window');
SELECT pg_temp.insight_assert(
 (SELECT (v->'summary'->>'recorded_orders')::integer=1
   FROM (SELECT public.restaurant_order_insights(
     :'restaurant',7,date '2025-03-02') AS v) r),
 'Older periods are included when explicitly selected');
SELECT pg_temp.insight_assert(
 (SELECT (v->'summary'->>'recorded_orders')::integer=1
   FROM (SELECT public.restaurant_order_insights(
     :'restaurant',30,null,null,'salle') AS v) r),
 'Channel filter isolates kitchen tickets');
SELECT pg_temp.insight_assert(
 (SELECT (v->'summary'->>'recorded_orders')::integer=2
   FROM (SELECT public.restaurant_order_insights(
     :'restaurant',30,null,null,'en_ligne') AS v) r),
 'Channel filter isolates online orders');

SELECT pg_temp.insight_denied(format(
 'SELECT public.restaurant_order_insights(%L,367)',:'restaurant'),'22023');
SELECT pg_temp.insight_denied(format(
 'SELECT public.restaurant_order_history(%L,30,NULL,NULL,%L,1001)',
 :'restaurant','all'),'22023');
SELECT pg_temp.insight_denied(format(
 'SELECT public.restaurant_order_insights(%L)',:'other'),'42501');

SET "request.jwt.claim.sub"=:'waiter';
SET "test.owner"='';
SELECT pg_temp.insight_denied(format(
 'SELECT public.restaurant_order_insights(%L)',:'restaurant'),'42501');
SELECT pg_temp.insight_denied(format(
 'SELECT public.restaurant_order_history(%L)',:'restaurant'),'42501');

SET "request.jwt.claim.sub"=:'outsider';
SELECT pg_temp.insight_denied(format(
 'SELECT public.restaurant_order_history(%L)',:'restaurant'),'42501');

RESET ROLE;
SELECT 'TOK RESTAURANT ORDER INSIGHTS POSTGRES SMOKE PASSED' AS result;
