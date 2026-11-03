-- TOK restaurant order intelligence.
-- Source of truth remains orders/order_items and kitchen_tickets/kitchen_ticket_items.
-- No duplicated customer data, no names, addresses, notes or customer identifiers.
-- Historical tickets are never deleted or rewritten by these read-only RPCs.

-- Preserve non-personal product labels as ordered, even when the menu changes.
-- The existing order and payment workflow is unchanged: both columns are optional.
alter table public.order_items
  add column if not exists product_name_snapshot text,
  add column if not exists product_category_snapshot text;

create function public.restaurant_order_item_capture_label()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_restaurant_id uuid;
  v_name text;
  v_category text;
begin
  -- Use the trusted parent order, not the caller-supplied item restaurant_id.
  select o.restaurant_id into v_restaurant_id
  from public.orders o where o.id=new.order_id;

  if new.menu_item_id is not null then
    select m.name,m.category into v_name,v_category
    from public.menu_items m
    where m.id=new.menu_item_id and m.restaurant_id=v_restaurant_id;
  end if;

  if v_name is null and new.anti_waste_offer_id is not null then
    select a.title into v_name
    from public.anti_waste_offers a
    where a.id=new.anti_waste_offer_id and a.restaurant_id=v_restaurant_id;
  end if;

  new.product_name_snapshot := left(coalesce(
    nullif(btrim(v_name),''),
    nullif(btrim(new.metadata->>'name'),''),
    nullif(btrim(new.metadata->>'product_name'),''),
    nullif(btrim(new.metadata->>'item_name'),'')
  ),200);
  new.product_category_snapshot := left(coalesce(
    nullif(btrim(v_category),''),
    nullif(btrim(new.metadata->>'category'),'')
  ),100);
  return new;
end;
$$;

revoke all on function public.restaurant_order_item_capture_label()
  from public,anon,authenticated;
create trigger restaurant_order_item_capture_label
  before insert on public.order_items
  for each row execute function public.restaurant_order_item_capture_label();

-- Best-effort historical backfill. Never overwrite any already persisted snapshot.
update public.order_items i set
  product_name_snapshot = coalesce(i.product_name_snapshot,
    (select left(m.name,200) from public.menu_items m
      where m.id=i.menu_item_id and m.restaurant_id=(select o.restaurant_id from public.orders o where o.id=i.order_id)),
    (select left(a.title,200) from public.anti_waste_offers a
      where a.id=i.anti_waste_offer_id and a.restaurant_id=(select o.restaurant_id from public.orders o where o.id=i.order_id)),
    left(i.metadata->>'name',200),left(i.metadata->>'product_name',200),
    left(i.metadata->>'item_name',200)),
  product_category_snapshot = coalesce(i.product_category_snapshot,
    (select left(m.category,100) from public.menu_items m
      where m.id=i.menu_item_id and m.restaurant_id=(select o.restaurant_id from public.orders o where o.id=i.order_id)),
    left(i.metadata->>'category',100))
where i.product_name_snapshot is null or i.product_category_snapshot is null;

create index if not exists idx_orders_restaurant_created_insights
  on public.orders (restaurant_id, created_at desc, id);
create index if not exists idx_kitchen_tickets_restaurant_created_insights
  on public.kitchen_tickets (restaurant_id, created_at desc, id);

create function public.restaurant_order_insights(
  p_restaurant_id uuid,
  p_days integer default 30,
  p_end_date date default null,
  p_branch_id uuid default null,
  p_channel text default 'all'
) returns jsonb
language plpgsql stable security invoker set search_path = ''
as $$
declare
  v_end_date date := coalesce(p_end_date, (now() at time zone 'Europe/Zurich')::date);
  v_start_date date;
  v_start_at timestamptz;
  v_end_at timestamptz;
  v_result jsonb;
begin
  if auth.uid() is null
     or public.commercial_demo_current_user_is_restricted()
     or not exists (
       select 1 from public.restaurants r
       where r.id = p_restaurant_id and r.owner_id = auth.uid()
     )
  then
    raise exception 'Accès aux statistiques refusé' using errcode = '42501';
  end if;

  if p_days is null or p_days not between 1 and 366 or p_channel is null
     or p_channel not in ('all','salle','en_ligne')
     or v_end_date > (now() at time zone 'Europe/Zurich')::date
     or v_end_date < date '2020-01-01'
  then
    raise exception 'Période ou filtre invalide' using errcode = '22023';
  end if;

  if p_branch_id is not null and not exists (
    select 1 from public.restaurant_branches b
    where b.id = p_branch_id and b.restaurant_id = p_restaurant_id
  ) then
    raise exception 'Succursale inaccessible' using errcode = '42501';
  end if;

  v_start_date := v_end_date - (p_days - 1);
  -- Use local civil days, not fixed UTC 24-hour windows; DST is respected.
  v_start_at := v_start_date::timestamp at time zone 'Europe/Zurich';
  v_end_at := (v_end_date + 1)::timestamp at time zone 'Europe/Zurich';

  with activity as materialized (
    select t.id, 'salle'::text as channel, t.branch_id, t.created_at,
           t.status, t.status <> 'cancelled' as eligible,
           t.status = 'served' as finished,
           coalesce((select sum(i.quantity * i.unit_price)
                     from public.kitchen_ticket_items i where i.ticket_id = t.id),0) as amount,
           case when t.started_at is not null and t.ready_at >= t.started_at
             then extract(epoch from (t.ready_at - t.started_at)) / 60
             else null end as prep_minutes
    from public.kitchen_tickets t
    where p_channel in ('all','salle')
      and t.restaurant_id = p_restaurant_id
      and t.created_at >= v_start_at and t.created_at < v_end_at
      and (p_branch_id is null or t.branch_id = p_branch_id)

    union all

    select o.id, 'en_ligne'::text, o.branch_id, o.created_at,
           o.status,
           (
             lower(coalesce(o.status,'')) not in
               ('cancelled','canceled','rejected','failed','payment_failed','refunded')
             and lower(coalesce(o.payment_status,'')) not in
               ('failed','cancelled','canceled','refunded')
             and (
               lower(coalesce(o.status,'')) in
                 ('confirmed','paid','accepted','preparing','ready',
                  'ready_for_pickup','delivering','delivered','completed','picked_up')
               or lower(coalesce(o.payment_status,'')) in
                 ('paid','succeeded','captured','completed')
             )
           ) as eligible,
           (
             lower(coalesce(o.status,'')) in
               ('delivered','completed','picked_up')
             and lower(coalesce(o.payment_status,'')) not in
               ('failed','cancelled','canceled','refunded')
           ) as finished,
           coalesce(o.total_amount,0) as amount,
           null::numeric as prep_minutes
    from public.orders o
    where p_channel in ('all','en_ligne')
      and o.restaurant_id = p_restaurant_id
      and o.created_at >= v_start_at and o.created_at < v_end_at
      and (p_branch_id is null or o.branch_id = p_branch_id)
  ),
  products as materialized (
    select a.id as order_id, a.channel, i.menu_item_id::text as item_key,
           left(i.name,200) as name,
           coalesce(m.category,'Autres') as category,
           i.quantity::integer as quantity, (i.quantity * i.unit_price) as amount,
           a.eligible, a.finished
    from activity a
    join public.kitchen_ticket_items i on i.ticket_id = a.id and a.channel = 'salle'
    left join public.menu_items m
      on m.id = i.menu_item_id and m.restaurant_id = p_restaurant_id

    union all

    select a.id, a.channel,
           coalesce(i.menu_item_id::text, i.anti_waste_offer_id::text,
                    'libelle:' || coalesce(nullif(btrim(i.metadata->>'name'),''),'inconnu')),
           left(coalesce(nullif(btrim(i.product_name_snapshot),''),
                  nullif(btrim(m.name),''),
                  nullif(btrim(i.metadata->>'name'),''),
                  nullif(btrim(i.metadata->>'product_name'),''),
                  nullif(btrim(i.metadata->>'item_name'),''),
                  'Article sans libellé conservé'),200) as name,
           coalesce(i.product_category_snapshot,m.category,'Autres'),
           i.quantity::integer, i.total_price,
           a.eligible, a.finished
    from activity a
    join public.order_items i on i.order_id = a.id and a.channel = 'en_ligne'
    left join public.menu_items m
      on m.id = i.menu_item_id and m.restaurant_id = p_restaurant_id
  ),
  product_units as materialized (
    select order_id,channel,sum(quantity) as units
    from products where eligible group by order_id,channel
  )
  select jsonb_build_object(
    'from_day', v_start_date::text,
    'to_day', v_end_date::text,
    'timezone', 'Europe/Zurich',
    'summary', (
      select jsonb_build_object(
        'recorded_orders', count(*),
        'confirmed_orders', count(*) filter (where eligible),
        'completed_orders', count(*) filter (where finished),
        'excluded_orders', count(*) filter (where not eligible),
        'confirmed_units', (select coalesce(sum(quantity),0) from products where eligible),
        'estimated_value_chf', coalesce(sum(amount) filter (where eligible),0),
        'room_value_chf', coalesce(sum(amount) filter (where eligible and channel='salle'),0),
        'online_value_chf', coalesce(sum(amount) filter (where eligible and channel='en_ligne'),0),
        'average_prep_minutes', coalesce(round(avg(prep_minutes) filter
          (where prep_minutes is not null and eligible),1),0)
      ) from activity
    ),
    'top_products', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'item_key', p.item_key, 'name', p.name, 'category', p.category,
        'channel', p.channel, 'order_count', p.order_count,
        'units_recorded', p.units_recorded, 'units_confirmed', p.units_confirmed,
        'units_completed', p.units_completed,
        'estimated_value_chf', p.value_chf
      ) order by p.units_confirmed desc, p.order_count desc, p.name), '[]'::jsonb)
      from (
        select item_key, name, category, channel,
               count(distinct order_id) filter (where eligible) as order_count,
               coalesce(sum(quantity),0) as units_recorded,
               coalesce(sum(quantity) filter (where eligible),0) as units_confirmed,
               coalesce(sum(quantity) filter (where finished),0) as units_completed,
               coalesce(sum(amount) filter (where eligible),0) as value_chf
        from products
        group by item_key,name,category,channel
        having coalesce(sum(quantity) filter (where eligible),0) > 0
        order by units_confirmed desc, order_count desc, name
        limit 30
      ) p
    ),
    'hours', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'hour', h.hour, 'orders', coalesce(v.n,0)
      ) order by h.hour),'[]'::jsonb)
      from generate_series(0,23) as h(hour)
      left join (
        select extract(hour from created_at at time zone 'Europe/Zurich')::integer as hour,
               count(*) as n
        from activity where eligible group by 1
      ) v on v.hour=h.hour
    ),
    'weekdays', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'day', d.day, 'orders', coalesce(v.n,0)
      ) order by d.day),'[]'::jsonb)
      from generate_series(1,7) as d(day)
      left join (
        select extract(isodow from created_at at time zone 'Europe/Zurich')::integer as day,
               count(*) as n
        from activity where eligible group by 1
      ) v on v.day=d.day
    ),
    'days', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'day', d.day::date::text, 'orders', coalesce(v.n,0),
        'units', coalesce(v.units,0)
      ) order by d.day),'[]'::jsonb)
      from generate_series(v_start_date,v_end_date,interval '1 day') as d(day)
      left join (
        select (a.created_at at time zone 'Europe/Zurich')::date as day,
               count(*) as n,
               coalesce(sum(u.units),0) as units
        from activity a
        left join product_units u
          on u.order_id=a.id and u.channel=a.channel
        where a.eligible
        group by (a.created_at at time zone 'Europe/Zurich')::date
      ) v on v.day=d.day::date
    ),
    'channels', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'channel',v.channel, 'orders',v.n,
        'confirmed',v.confirmed
      ) order by v.channel),'[]'::jsonb)
      from (
        select channel,count(*) as n,count(*) filter (where eligible) as confirmed
        from activity group by channel
      ) v
    ),
    'statuses', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'channel',s.channel,'status',s.status,'orders',s.n
      ) order by s.channel,s.status),'[]'::jsonb)
      from (
        select channel,status,count(*) as n
        from activity group by channel,status
      ) s
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.restaurant_order_insights(uuid,integer,date,uuid,text)
  from public,anon;
grant execute on function public.restaurant_order_insights(uuid,integer,date,uuid,text)
  to authenticated;

create function public.restaurant_order_history(
  p_restaurant_id uuid,
  p_days integer default 30,
  p_end_date date default null,
  p_branch_id uuid default null,
  p_channel text default 'all',
  p_page integer default 0
) returns jsonb
language plpgsql stable security invoker set search_path = ''
as $$
declare
  v_end date := coalesce(p_end_date, (now() at time zone 'Europe/Zurich')::date);
  v_start date;
  v_from timestamptz;
  v_to timestamptz;
  v_total bigint;
  v_orders jsonb;
begin
  if auth.uid() is null or public.commercial_demo_current_user_is_restricted()
    or not exists (
      select 1 from public.restaurants r
      where r.id = p_restaurant_id and r.owner_id = auth.uid()
    )
  then raise exception 'Historique inaccessible' using errcode = '42501';
  end if;

  if p_days is null or p_days not between 1 and 366
    or v_end > (now() at time zone 'Europe/Zurich')::date
    or v_end < date '2020-01-01'
    or p_page is null or p_page not between 0 and 1000
    or p_channel is null or p_channel not in ('all','salle','en_ligne')
  then raise exception 'Filtres de recherche invalides' using errcode = '22023';
  end if;

  if p_branch_id is not null and not exists (
    select 1 from public.restaurant_branches b
    where b.id = p_branch_id and b.restaurant_id = p_restaurant_id
  ) then raise exception 'Succursale inaccessible' using errcode = '42501';
  end if;

  v_start := v_end-(p_days-1);
  v_from := v_start::timestamp at time zone 'Europe/Zurich';
  v_to := (v_end+1)::timestamp at time zone 'Europe/Zurich';

  with scoped as (
    select k.id,k.created_at,'salle'::text as channel,k.branch_id,
      k.table_number,k.status,
      null::text as payment_status,null::text as source,
      null::timestamptz as scheduled_for,
      0::numeric as discount_chf,0::numeric as tax_chf,0::numeric as tip_chf,
      k.started_at,k.ready_at,k.served_at,k.cancelled_at,
      coalesce((select sum(i.quantity*i.unit_price)
                from public.kitchen_ticket_items i where i.ticket_id=k.id),0) as amount
    from public.kitchen_tickets k
    where p_channel in ('all','salle') and k.restaurant_id=p_restaurant_id
      and k.created_at>=v_from and k.created_at<v_to
      and (p_branch_id is null or k.branch_id=p_branch_id)

    union all

    select o.id,o.created_at,'en_ligne',o.branch_id,
      null::text,o.status,o.payment_status,o.source,
      coalesce(o.scheduled_for,o.scheduled_at),
      coalesce(o.discount_amount,0),coalesce(o.tax_amount,0),coalesce(o.tip_amount,0),
      o.accepted_at,o.ready_at,coalesce(o.delivered_at,o.actual_delivered_at),
      o.cancelled_at,coalesce(o.total_amount,0)
    from public.orders o
    where p_channel in ('all','en_ligne') and o.restaurant_id=p_restaurant_id
      and o.created_at>=v_from and o.created_at<v_to
      and (p_branch_id is null or o.branch_id=p_branch_id)
  )
  select count(*) into v_total from scoped;

  with page as (
    select k.id,k.created_at,'salle'::text as channel,k.branch_id,
      k.table_number,k.status,
      null::text as payment_status,null::text as source,
      null::timestamptz as scheduled_for,
      0::numeric as discount_chf,0::numeric as tax_chf,0::numeric as tip_chf,
      k.started_at,k.ready_at,k.served_at,k.cancelled_at,
      coalesce((select sum(i.quantity*i.unit_price)
                from public.kitchen_ticket_items i where i.ticket_id=k.id),0) as amount
    from public.kitchen_tickets k
    where p_channel in ('all','salle') and k.restaurant_id=p_restaurant_id
      and k.created_at>=v_from and k.created_at<v_to
      and (p_branch_id is null or k.branch_id=p_branch_id)
    union all
    select o.id,o.created_at,'en_ligne',o.branch_id,
      null::text,o.status,o.payment_status,o.source,
      coalesce(o.scheduled_for,o.scheduled_at),
      coalesce(o.discount_amount,0),coalesce(o.tax_amount,0),coalesce(o.tip_amount,0),
      o.accepted_at,o.ready_at,coalesce(o.delivered_at,o.actual_delivered_at),
      o.cancelled_at,coalesce(o.total_amount,0)
    from public.orders o
    where p_channel in ('all','en_ligne') and o.restaurant_id=p_restaurant_id
      and o.created_at>=v_from and o.created_at<v_to
      and (p_branch_id is null or o.branch_id=p_branch_id)
    order by created_at desc,id desc
    limit 30 offset p_page*30
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'channel',p.channel,'branch_id',p.branch_id,
    'table_number',p.table_number,'status',p.status,
    'created_at',p.created_at,'started_at',p.started_at,
    'ready_at',p.ready_at,'finished_at',p.served_at,
    'cancelled_at',p.cancelled_at,
    'payment_status',p.payment_status,'source',p.source,
    'scheduled_for',p.scheduled_for,
    'amount_chf',p.amount,'discount_chf',p.discount_chf,
    'tax_chf',p.tax_chf,'tip_chf',p.tip_chf,
    'items',case when p.channel='salle' then
      (select coalesce(jsonb_agg(jsonb_build_object(
        'name',left(i.name,200),'quantity',i.quantity,
        'unit_price',i.unit_price,'menu_item_id',i.menu_item_id
      ) order by i.position),'[]'::jsonb)
       from public.kitchen_ticket_items i where i.ticket_id=p.id)
    else
      (select coalesce(jsonb_agg(jsonb_build_object(
        'name',left(coalesce(nullif(btrim(i.product_name_snapshot),''),
             nullif(btrim(m.name),''),
             nullif(btrim(i.metadata->>'name'),''),
             nullif(btrim(i.metadata->>'product_name'),''),
             nullif(btrim(i.metadata->>'item_name'),''),
             'Article sans libellé conservé'),200),
        'quantity',i.quantity,'unit_price',i.unit_price,
        'menu_item_id',i.menu_item_id
      ) order by i.id),'[]'::jsonb)
       from public.order_items i
       left join public.menu_items m
         on m.id=i.menu_item_id and m.restaurant_id=p_restaurant_id
       where i.order_id=p.id)
    end
  ) order by p.created_at desc,p.id desc),'[]'::jsonb)
  into v_orders
  from page p;

  return jsonb_build_object(
    'total',v_total,'page',p_page,
    'page_size',30,'orders',v_orders
  );
end;
$$;

revoke all on function public.restaurant_order_history(uuid,integer,date,uuid,text,integer)
  from public,anon;
grant execute on function public.restaurant_order_history(uuid,integer,date,uuid,text,integer)
  to authenticated;

notify pgrst,'reload schema';
