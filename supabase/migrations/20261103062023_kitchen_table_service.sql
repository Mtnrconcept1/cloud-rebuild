-- TOK Kitchen: independent dine-in tickets. Never feed checkout, delivery or billing.
create table public.kitchen_tickets (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  branch_id uuid references public.restaurant_branches(id) on delete set null,
  table_id uuid references public.reservation_tables(id) on delete set null,
  table_number text not null check (char_length(table_number) between 1 and 40),
  submitted_by uuid not null references auth.users(id),
  request_key uuid not null,
  note text check (char_length(coalesce(note, '')) <= 500),
  status text not null default 'queued' check (status in ('queued', 'preparing', 'ready', 'served', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  ready_at timestamptz,
  served_at timestamptz,
  cancelled_at timestamptz,
  unique (restaurant_id, submitted_by, request_key)
);
create index kitchen_tickets_queue_idx on public.kitchen_tickets (restaurant_id, status, created_at, id);
create index kitchen_tickets_table_idx on public.kitchen_tickets (table_id, created_at desc);

create table public.kitchen_ticket_items (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.kitchen_tickets(id) on delete cascade,
  menu_item_id uuid references public.menu_items(id) on delete set null,
  name text not null check (char_length(name) between 1 and 200),
  quantity smallint not null check (quantity between 1 and 30),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  position smallint not null check (position between 1 and 40),
  unique (ticket_id, position),
  unique (ticket_id, menu_item_id)
);
create index kitchen_ticket_items_ticket_idx on public.kitchen_ticket_items (ticket_id, position);

create table public.kitchen_ticket_events (
  id bigint generated always as identity primary key,
  ticket_id uuid not null references public.kitchen_tickets(id) on delete cascade,
  changed_by uuid not null references auth.users(id),
  from_status text,
  to_status text not null,
  created_at timestamptz not null default now()
);
create index kitchen_ticket_events_ticket_idx on public.kitchen_ticket_events (ticket_id, created_at);

-- Data API: read-only RLS. All writes go through validated, atomic RPCs.
revoke all on public.kitchen_tickets, public.kitchen_ticket_items, public.kitchen_ticket_events from anon, authenticated;
grant select on public.kitchen_tickets, public.kitchen_ticket_items, public.kitchen_ticket_events to authenticated;
alter table public.kitchen_tickets enable row level security;
alter table public.kitchen_ticket_items enable row level security;
alter table public.kitchen_ticket_events enable row level security;

create policy kitchen_tickets_owner_read on public.kitchen_tickets
  for select to authenticated using (
    exists (select 1 from public.restaurants r
      where r.id = kitchen_tickets.restaurant_id and r.owner_id = (select auth.uid()))
    and not (select public.commercial_demo_current_user_is_restricted())
  );
create policy kitchen_ticket_items_owner_read on public.kitchen_ticket_items
  for select to authenticated using (
    exists (select 1 from public.kitchen_tickets k where k.id = kitchen_ticket_items.ticket_id)
  );
create policy kitchen_ticket_events_owner_read on public.kitchen_ticket_events
  for select to authenticated using (
    exists (select 1 from public.kitchen_tickets k where k.id = kitchen_ticket_events.ticket_id)
  );

-- The restaurant owner is the initial authenticated operator. This avoids
-- trusting unverified/self-registered staff membership records.
create function public.kitchen_create_ticket(
  p_restaurant_id uuid,
  p_table_id uuid,
  p_lines jsonb,
  p_note text,
  p_request_key uuid
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_ticket_id uuid;
  v_branch_id uuid;
  v_table_number text;
  v_line jsonb;
  v_menu_item_id uuid;
  v_name text;
  v_price numeric;
  v_quantity integer;
  v_position integer := 0;
  v_total_quantity integer := 0;
begin
  if v_actor is null or public.commercial_demo_current_user_is_restricted()
    or not exists (
      select 1 from public.restaurants r
      where r.id = p_restaurant_id and r.owner_id = v_actor
        and r.is_active is true and r.is_demo is false
        and lower(coalesce(r.status, '')) = 'active'
    )
  then
    raise exception 'Accès cuisine refusé' using errcode = '42501';
  end if;

  if p_request_key is null or p_lines is null or jsonb_typeof(p_lines) <> 'array'
    or jsonb_array_length(p_lines) not between 1 and 40
    or char_length(coalesce(p_note, '')) > 500
  then
    raise exception 'Commande invalide' using errcode = '22023';
  end if;

  select t.table_number, b.id into v_table_number, v_branch_id
  from public.reservation_tables t
  join public.restaurant_branches b on b.id = t.branch_id
  where t.id = p_table_id and b.restaurant_id = p_restaurant_id
    and t.is_active is true and b.is_active is true;

  if v_branch_id is null then
    raise exception 'Table indisponible dans cet établissement' using errcode = '22023';
  end if;

  -- Idempotency: a network retry cannot create a second kitchen ticket.
  insert into public.kitchen_tickets
    (restaurant_id, branch_id, table_id, table_number, submitted_by, request_key, note)
  values
    (p_restaurant_id, v_branch_id, p_table_id, v_table_number, v_actor, p_request_key, nullif(btrim(p_note), ''))
  on conflict (restaurant_id, submitted_by, request_key) do nothing
  returning id into v_ticket_id;

  if v_ticket_id is null then
    select id into v_ticket_id from public.kitchen_tickets
    where restaurant_id = p_restaurant_id and submitted_by = v_actor and request_key = p_request_key;
    return v_ticket_id;
  end if;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    if jsonb_typeof(v_line) <> 'object' then
      raise exception 'Ligne de commande invalide' using errcode = '22023';
    end if;

    v_menu_item_id := (v_line ->> 'menu_item_id')::uuid;
    v_quantity := (v_line ->> 'quantity')::integer;
    if v_menu_item_id is null or v_quantity is null or v_quantity not between 1 and 30 then
      raise exception 'Quantité incorrecte' using errcode = '22023';
    end if;

    v_total_quantity := v_total_quantity + v_quantity;
    if v_total_quantity > 120 then
      raise exception 'Trop de plats dans cette commande' using errcode = '22023';
    end if;

    select mi.name, mi.price into v_name, v_price
    from public.menu_items mi
    where mi.id = v_menu_item_id and mi.restaurant_id = p_restaurant_id
      and mi.is_available is true and mi.available_on_card is true;

    if not found then
      raise exception 'Un plat est indisponible ou appartient à un autre restaurant'
        using errcode = '22023';
    end if;

    v_position := v_position + 1;
    insert into public.kitchen_ticket_items
      (ticket_id, menu_item_id, name, quantity, unit_price, position)
    values (v_ticket_id, v_menu_item_id, v_name, v_quantity, v_price, v_position);
  end loop;

  insert into public.kitchen_ticket_events (ticket_id, changed_by, from_status, to_status)
  values (v_ticket_id, v_actor, null, 'queued');

  return v_ticket_id;
end;
$$;

create function public.kitchen_advance_ticket(
  p_ticket_id uuid,
  p_expected_status text,
  p_next_status text
) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_ticket public.kitchen_tickets%rowtype;
begin
  if v_actor is null or public.commercial_demo_current_user_is_restricted() then
    raise exception 'Accès cuisine refusé' using errcode = '42501';
  end if;

  select * into v_ticket from public.kitchen_tickets
  where id = p_ticket_id for update;

  if not found or not exists (
    select 1 from public.restaurants r
    where r.id = v_ticket.restaurant_id and r.owner_id = v_actor
  ) then
    raise exception 'Ticket inaccessible' using errcode = '42501';
  end if;

  if v_ticket.status is distinct from p_expected_status then
    raise exception 'Ce ticket a déjà changé de statut. Actualisez la cuisine.'
      using errcode = '40001';
  end if;

  if not (
    (v_ticket.status = 'queued' and p_next_status in ('preparing', 'cancelled'))
    or (v_ticket.status = 'preparing' and p_next_status = 'ready')
    or (v_ticket.status = 'ready' and p_next_status = 'served')
  ) then
    raise exception 'Transition de commande interdite' using errcode = '22023';
  end if;

  update public.kitchen_tickets
  set status = p_next_status,
      updated_at = now(),
      started_at = case when p_next_status = 'preparing' then now() else started_at end,
      ready_at = case when p_next_status = 'ready' then now() else ready_at end,
      served_at = case when p_next_status = 'served' then now() else served_at end,
      cancelled_at = case when p_next_status = 'cancelled' then now() else cancelled_at end
  where id = p_ticket_id;

  insert into public.kitchen_ticket_events (ticket_id, changed_by, from_status, to_status)
  values (p_ticket_id, v_actor, v_ticket.status, p_next_status);
  return true;
end;
$$;

-- Invoker runs under RLS, so even the read RPC cannot cross restaurants.
create function public.kitchen_list_tickets(p_restaurant_id uuid)
returns jsonb
language sql stable security invoker set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', t.id,
        'restaurant_id', t.restaurant_id,
        'branch_id', t.branch_id,
        'table_number', t.table_number,
        'note', t.note,
        'status', t.status,
        'created_at', t.created_at,
        'started_at', t.started_at,
        'ready_at', t.ready_at,
        'items', (
          select coalesce(
            jsonb_agg(jsonb_build_object(
              'id', i.id, 'name', i.name, 'quantity', i.quantity, 'unit_price', i.unit_price
            ) order by i.position),
            '[]'::jsonb
          )
          from public.kitchen_ticket_items i where i.ticket_id = t.id
        )
      ) order by t.created_at, t.id
    ),
    '[]'::jsonb
  )
  from (
    select id, restaurant_id, branch_id, table_number, note, status, created_at, started_at, ready_at
    from public.kitchen_tickets
    where restaurant_id = p_restaurant_id
      and status in ('queued', 'preparing', 'ready')
    order by created_at, id limit 120
  ) t;
$$;

revoke all on function public.kitchen_create_ticket(uuid, uuid, jsonb, text, uuid) from public, anon;
revoke all on function public.kitchen_advance_ticket(uuid, text, text) from public, anon;
revoke all on function public.kitchen_list_tickets(uuid) from public, anon;
grant execute on function public.kitchen_create_ticket(uuid, uuid, jsonb, text, uuid) to authenticated;
grant execute on function public.kitchen_advance_ticket(uuid, text, text) to authenticated;
grant execute on function public.kitchen_list_tickets(uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'kitchen_tickets'
    )
  then
    alter publication supabase_realtime add table public.kitchen_tickets;
  end if;
end;
$$;
