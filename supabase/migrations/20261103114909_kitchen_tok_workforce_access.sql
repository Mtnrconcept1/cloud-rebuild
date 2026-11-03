-- TOK Kitchen: give linked, active TOK Équipe employees the same dine-in
-- order submission entry point as restaurant owners, never owner dashboard rights.
-- This migration extends (and does not rewrite) the pending kitchen base migration.

-- This access function uses the existing, verified TOK Équipe account link.
-- Mere possession of a restaurant ID, an email or an invitation is insufficient.
create function public.kitchen_can_submit(p_restaurant_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select (select auth.uid()) is not null
    and not public.commercial_demo_current_user_is_restricted()
    and exists (
      select 1
      from public.restaurants r
      where r.id = p_restaurant_id
        and r.is_active is true
        and r.is_demo is false
        and lower(coalesce(r.status, '')) = 'active'
        and (
          r.owner_id = (select auth.uid())
          or exists (
            select 1
            from public.tok_workforce_employees e
            join public.tok_workforce_settings s
              on s.restaurant_id = e.restaurant_id
            where e.restaurant_id = r.id
              and e.user_id = (select auth.uid())
              and e.is_active is true
              and e.role in ('employee', 'manager')
              and s.enabled is true
              and (e.started_on is null or e.started_on <= (now() at time zone 'Europe/Zurich')::date)
              and (e.ended_on is null or e.ended_on >= (now() at time zone 'Europe/Zurich')::date)
          )
        )
    );
$$;

revoke all on function public.kitchen_can_submit(uuid) from public, anon;
grant execute on function public.kitchen_can_submit(uuid) to authenticated;

create index if not exists tok_workforce_kitchen_employee_access_idx
  on public.tok_workforce_employees (restaurant_id, user_id)
  where is_active is true and user_id is not null;

-- Employees see only tickets THEY submitted. The restaurateur's existing
-- owner policy still exposes all the restaurant's active kitchen tickets.
create policy kitchen_tickets_workforce_own_read
  on public.kitchen_tickets
  for select to authenticated
  using (
    submitted_by = (select auth.uid())
    and public.kitchen_can_submit(restaurant_id)
  );

-- A single authorized catalogue RPC avoids exposing all restaurant branches,
-- table layouts or private menu items through new global SELECT policies.
create function public.kitchen_get_setup(p_restaurant_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.kitchen_can_submit(p_restaurant_id) then
    raise exception 'Accès gestion de salle refusé' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'branches', (
      select coalesce(
        jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name) order by b.name, b.id),
        '[]'::jsonb
      )
      from (
        select id, name
        from public.restaurant_branches
        where restaurant_id = p_restaurant_id and is_active is true
        order by name, id
        limit 30
      ) b
    ),
    'tables', (
      select coalesce(
        jsonb_agg(jsonb_build_object(
          'id', t.id, 'branch_id', t.branch_id,
          'table_number', t.table_number, 'capacity', t.capacity
        ) order by t.table_number, t.id),
        '[]'::jsonb
      )
      from (
        select t.id, t.branch_id, t.table_number, t.capacity
        from public.reservation_tables t
        join public.restaurant_branches b on b.id = t.branch_id
        where b.restaurant_id = p_restaurant_id
          and b.is_active is true and t.is_active is true
        order by t.table_number, t.id
        limit 200
      ) t
    ),
    'menu', (
      select coalesce(
        jsonb_agg(jsonb_build_object(
          'id', m.id, 'name', m.name, 'category', m.category,
          'price', m.price
        ) order by m.name, m.id),
        '[]'::jsonb
      )
      from (
        select id, name, category, price
        from public.menu_items
        where restaurant_id = p_restaurant_id
          and is_available is true and available_on_card is true
        order by name, id
        limit 500
      ) m
    )
  );
end;
$$;

revoke all on function public.kitchen_get_setup(uuid) from public, anon;
grant execute on function public.kitchen_get_setup(uuid) to authenticated;

-- Extend the existing kitchen insertion RPC: preserve atomic creation, immutable
-- server-side menu snapshots and idempotency. Auth is now TOK Équipe OR owner.
create or replace function public.kitchen_create_ticket(
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
  if v_actor is null or not public.kitchen_can_submit(p_restaurant_id) then
    raise exception 'Accès gestion de salle refusé' using errcode = '42501';
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

-- CREATE OR REPLACE preserves privileges on an existing function, but keep
-- the public API grants explicit and non-anonymous for reproducible installs.
revoke all on function public.kitchen_create_ticket(uuid, uuid, jsonb, text, uuid) from public, anon;
grant execute on function public.kitchen_create_ticket(uuid, uuid, jsonb, text, uuid) to authenticated;
notify pgrst, 'reload schema';
