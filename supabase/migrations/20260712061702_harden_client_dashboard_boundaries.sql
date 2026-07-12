-- Client dashboard hardening: hide unfinished promises and move every
-- sensitive write behind an authenticated, transactional server boundary.

update public.feature_flags
set is_active = false,
    updated_at = now()
where name in (
  'abonnement',
  'creneaux-garantis',
  'flex-prix-bas',
  'garantie-qualite',
  'match-groupes',
  'multi-stop',
  'points-cadeau'
);

-- These legacy policies exposed inactive/archived offers. The current active
-- offer policies remain in place.
drop policy if exists "Public read for anti_waste_offers" on public.anti_waste_offers;
drop policy if exists "Public read for flash_sales" on public.flash_sales;

create index if not exists idx_notifications_user_created_at
  on public.notifications (user_id, created_at desc);

create index if not exists idx_loyalty_transactions_user_created_at
  on public.loyalty_transactions (user_id, created_at desc);

-- Profiles: RLS protects rows, while column privileges protect the
-- server-owned MIAMZ balance/tier inside each row.
revoke insert, update, delete, truncate on public.profiles from public, anon, authenticated;
drop policy if exists "profiles_self_all" on public.profiles;

grant insert (user_id, full_name, avatar_url, phone, address, city, date_of_birth, gender)
  on public.profiles to authenticated;
grant update (full_name, avatar_url, phone, address, city, date_of_birth, gender)
  on public.profiles to authenticated;

create or replace function public.update_client_profile(
  p_full_name text,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_address text,
  p_city text,
  p_avatar_url text,
  p_date_of_birth date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_date_of_birth is not null and p_date_of_birth > current_date then
    raise exception 'Birth date cannot be in the future';
  end if;

  if char_length(coalesce(p_full_name, '')) > 160
     or char_length(coalesce(p_first_name, '')) > 80
     or char_length(coalesce(p_last_name, '')) > 120
     or char_length(coalesce(p_phone, '')) > 40
     or char_length(coalesce(p_address, '')) > 500
     or char_length(coalesce(p_city, '')) > 120
     or char_length(coalesce(p_avatar_url, '')) > 2048 then
    raise exception 'Profile field is too long';
  end if;

  insert into public.profiles (
    user_id, full_name, phone, address, city, avatar_url, date_of_birth
  ) values (
    v_user_id,
    nullif(btrim(p_full_name), ''),
    nullif(btrim(p_phone), ''),
    nullif(btrim(p_address), ''),
    nullif(btrim(p_city), ''),
    nullif(btrim(p_avatar_url), ''),
    p_date_of_birth
  )
  on conflict (user_id) do update
  set full_name = excluded.full_name,
      phone = excluded.phone,
      address = excluded.address,
      city = excluded.city,
      avatar_url = excluded.avatar_url,
      date_of_birth = excluded.date_of_birth,
      updated_at = now();

  insert into public.user_profiles (
    user_id, first_name, last_name, phone_number, avatar_url, date_of_birth
  ) values (
    v_user_id,
    nullif(btrim(p_first_name), ''),
    nullif(btrim(p_last_name), ''),
    nullif(btrim(p_phone), ''),
    nullif(btrim(p_avatar_url), ''),
    p_date_of_birth
  )
  on conflict (user_id) do update
  set first_name = excluded.first_name,
      last_name = excluded.last_name,
      phone_number = excluded.phone_number,
      avatar_url = excluded.avatar_url,
      date_of_birth = excluded.date_of_birth,
      updated_at = timezone('utc', now());
end;
$$;

revoke all on function public.update_client_profile(text, text, text, text, text, text, text, date)
  from public, anon;
grant execute on function public.update_client_profile(text, text, text, text, text, text, text, date)
  to authenticated, service_role;

-- The same atomic RPC owns the mirrored account profile. Prevent a client from
-- deleting this parent row (and cascading into addresses/payment data) or
-- performing a second, partial write through PostgREST.
drop policy if exists "user_profiles_self_all" on public.user_profiles;
drop policy if exists "user_profiles_owner_delete" on public.user_profiles;
drop policy if exists "user_profiles_owner_insert" on public.user_profiles;
drop policy if exists "user_profiles_owner_update" on public.user_profiles;
drop policy if exists "user_profiles_owner_select" on public.user_profiles;
drop policy if exists "Require auth for user_profiles" on public.user_profiles;
drop policy if exists "user_profiles_self_select" on public.user_profiles;
revoke insert, update, delete, truncate on public.user_profiles from public, anon, authenticated;

create policy "user_profiles_self_select"
  on public.user_profiles
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Orders/reservations must enter through the canonical Edge workflows. A
-- browser insert bypasses pricing, capacity, idempotency and payment checks.
drop policy if exists "Users can create orders" on public.orders;
drop policy if exists "Users manage own orders" on public.orders;
drop policy if exists "Users can create order items" on public.order_items;
drop policy if exists "Users can create reservations" on public.reservations;
drop policy if exists "Users can cancel their reservations" on public.reservations;
drop policy if exists "Users manage own reservations" on public.reservations;
revoke insert, delete, truncate, references, trigger on public.orders from public, anon, authenticated;
revoke insert, delete, truncate, references, trigger on public.order_items from public, anon, authenticated;
revoke insert, delete, truncate, references, trigger on public.reservations from public, anon, authenticated;

revoke execute on function public.validate_and_create_reservation_safe(
  uuid, date, time without time zone, integer, text, jsonb, text
) from public, anon, authenticated;

revoke execute on function public.validate_and_create_reservation_safe(
  uuid, date, time without time zone, integer, text, jsonb, text, uuid
) from public, anon, authenticated;

grant execute on function public.validate_and_create_reservation_safe(
  uuid, date, time without time zone, integer, text, jsonb, text
) to service_role;

grant execute on function public.validate_and_create_reservation_safe(
  uuid, date, time without time zone, integer, text, jsonb, text, uuid
) to service_role;

-- Subscription state is Stripe/server owned. Clients retain SELECT and use
-- the existing management Edge function for changes.
drop policy if exists "tok_one_subscriptions_own_update" on public.tok_one_subscriptions;
revoke insert, update, delete, truncate on public.tok_one_subscriptions from public, anon, authenticated;

-- Ledger, solidarity totals and gift rows are append-only through the RPCs
-- below. Direct REST writes would otherwise mint or erase MIAMZ.
drop policy if exists "Authenticated users can send gifts" on public.gift_points;
revoke insert, update, delete, truncate on public.gift_points from public, anon, authenticated;
revoke insert, update, delete, truncate on public.loyalty_transactions from public, anon, authenticated;
revoke insert, update, delete, truncate on public.solidarity_donations from public, anon, authenticated;
drop policy if exists "Anyone can view solidarity donations" on public.solidarity_donations;
drop policy if exists "Authenticated users can create donations" on public.solidarity_donations;
revoke select on public.solidarity_donations from public, anon, authenticated;

do $$
begin
  if exists (select 1 from public.gift_points where claim_code is null or btrim(claim_code) = '') then
    raise exception 'Gift hardening aborted: missing claim code';
  end if;
  if exists (
    select lower(claim_code)
    from public.gift_points
    group by lower(claim_code)
    having count(*) > 1
  ) then
    raise exception 'Gift hardening aborted: duplicate claim code';
  end if;
end;
$$;

alter table public.gift_points alter column claim_code set not null;
create unique index if not exists gift_points_claim_code_lower_unique
  on public.gift_points (lower(claim_code));

create unique index if not exists loyalty_gift_sent_once
  on public.loyalty_transactions ((metadata ->> 'gift_id'))
  where transaction_type = 'gift_sent' and metadata ? 'gift_id';

create unique index if not exists loyalty_gift_received_once
  on public.loyalty_transactions ((metadata ->> 'gift_id'))
  where transaction_type = 'gift_received' and metadata ? 'gift_id';

-- Legacy UUID contract is preserved for older clients. The v2 wrapper returns
-- the actual claim_code. Transfers conserve mass: -N for sender, +N claimant.
create or replace function public.send_gift_points(
  recipient_email_param text,
  points_param integer,
  message_param text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gift_id uuid;
  v_current_points integer;
  v_user_id uuid := auth.uid();
  v_sender_email text;
  v_recipient_email text := lower(btrim(coalesce(recipient_email_param, '')));
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select lower(email) into v_sender_email from auth.users where id = v_user_id;
  if v_recipient_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
    raise exception 'A valid recipient email is required';
  end if;
  if v_recipient_email = v_sender_email then
    raise exception 'You cannot send a gift to yourself';
  end if;
  if points_param is null or points_param < 100 then
    raise exception 'Minimum gift amount is 100 Miamz';
  end if;
  if points_param > 1000000 then
    raise exception 'Gift amount is too high';
  end if;

  select loyalty_points into v_current_points
  from public.profiles
  where user_id = v_user_id
  for update;

  if v_current_points is null or v_current_points < points_param then
    raise exception 'Insufficient points';
  end if;

  insert into public.gift_points (
    sender_id, recipient_email, points_amount, message, metadata
  ) values (
    v_user_id,
    v_recipient_email,
    points_param,
    nullif(btrim(message_param), ''),
    jsonb_build_object('base_points', points_param, 'miamz_bonus_points', 0)
  ) returning id into v_gift_id;

  update public.profiles
  set loyalty_points = loyalty_points - points_param
  where user_id = v_user_id;

  insert into public.loyalty_transactions (
    user_id, amount, transaction_type, description, metadata
  ) values (
    v_user_id,
    -points_param,
    'gift_sent',
    'Cadeau Miamz envoyé à ' || v_recipient_email,
    jsonb_build_object(
      'gift_id', v_gift_id,
      'recipient_email', v_recipient_email,
      'base_points', points_param,
      'recipient_points', points_param,
      'miamz_bonus_points', 0
    )
  );

  return v_gift_id;
end;
$$;

create or replace function public.send_gift_points_v2(
  recipient_email_param text,
  points_param integer,
  message_param text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gift_id uuid;
  v_gift public.gift_points%rowtype;
begin
  v_gift_id := public.send_gift_points(recipient_email_param, points_param, message_param);
  select * into strict v_gift
  from public.gift_points
  where id = v_gift_id and sender_id = auth.uid();

  return jsonb_build_object(
    'ok', true,
    'gift_id', v_gift.id,
    'status', v_gift.status,
    'claim_code', v_gift.claim_code,
    'debited_points', points_param,
    'recipient_points', v_gift.points_amount,
    'expires_at', v_gift.expires_at
  );
end;
$$;

create or replace function public.claim_gift_points(claim_code_param text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gift public.gift_points%rowtype;
  v_user_id uuid := auth.uid();
  v_claimant_email text;
  v_transaction_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select lower(email) into v_claimant_email from auth.users where id = v_user_id;

  select * into v_gift
  from public.gift_points
  where lower(claim_code) = lower(btrim(coalesce(claim_code_param, '')))
    and status = 'pending'
    and expires_at > now()
    and sender_id <> v_user_id
    and lower(recipient_email) = v_claimant_email
  for update;

  if not found then
    return 0;
  end if;

  update public.gift_points
  set status = 'claimed', claimed_at = now(), recipient_id = v_user_id
  where id = v_gift.id;

  insert into public.loyalty_transactions (
    user_id, amount, transaction_type, description, metadata
  ) values (
    v_user_id,
    v_gift.points_amount,
    'gift_received',
    'Cadeau Miamz réclamé',
    jsonb_build_object(
      'gift_id', v_gift.id,
      'sender_id', v_gift.sender_id,
      'base_points', v_gift.points_amount,
      'miamz_bonus_points', 0
    )
  ) on conflict do nothing
  returning id into v_transaction_id;

  if v_transaction_id is null then
    raise exception 'Gift was already credited';
  end if;

  insert into public.profiles (user_id, loyalty_points)
  values (v_user_id, v_gift.points_amount)
  on conflict (user_id) do update
  set loyalty_points = coalesce(profiles.loyalty_points, 0) + excluded.loyalty_points;

  return v_gift.points_amount;
end;
$$;

create or replace function public.claim_gift_points_v2(claim_code_param text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_points integer;
begin
  v_points := public.claim_gift_points(claim_code_param);
  if v_points <= 0 then
    return jsonb_build_object(
      'ok', false,
      'claimed_points', 0,
      'reason', 'Code invalide, expiré ou destiné à une autre adresse.'
    );
  end if;
  return jsonb_build_object('ok', true, 'claimed_points', v_points);
end;
$$;

revoke all on function public.send_gift_points(text, integer, text) from public, anon;
revoke all on function public.send_gift_points_v2(text, integer, text) from public, anon;
revoke all on function public.claim_gift_points(text) from public, anon;
revoke all on function public.claim_gift_points_v2(text) from public, anon;
grant execute on function public.send_gift_points(text, integer, text) to authenticated, service_role;
grant execute on function public.send_gift_points_v2(text, integer, text) to authenticated, service_role;
grant execute on function public.claim_gift_points(text) to authenticated, service_role;
grant execute on function public.claim_gift_points_v2(text) to authenticated, service_role;

-- Preserve the public donation RPC while serializing balance changes.
create or replace function public.donate_points_for_meal(
  points_param integer,
  description_param text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_current_points integer;
begin
  if v_user_id is null or points_param is null or points_param <= 0 then
    return false;
  end if;

  select loyalty_points into v_current_points
  from public.profiles
  where user_id = v_user_id
  for update;

  if v_current_points is null or v_current_points < points_param then
    return false;
  end if;

  update public.profiles
  set loyalty_points = loyalty_points - points_param
  where user_id = v_user_id;

  insert into public.loyalty_transactions (user_id, amount, transaction_type, description)
  values (v_user_id, -points_param, 'donation', nullif(btrim(description_param), ''));

  insert into public.solidarity_donations (user_id, points_amount, meals_count)
  values (v_user_id, points_param, floor(points_param::numeric / 1000)::integer);

  return true;
end;
$$;

revoke all on function public.donate_points_for_meal(integer, text) from public, anon;
grant execute on function public.donate_points_for_meal(integer, text) to authenticated, service_role;

-- Use the canonical reservation timestamp when available, otherwise interpret
-- the date/time in the restaurant's launch timezone (Europe/Zurich), not UTC.
create or replace function public.cancel_reservation_by_customer(p_reservation_id uuid)
returns table(ok boolean, error_code text, error_message text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_res public.reservations%rowtype;
  v_effective_dt timestamptz;
  v_refundable_amount numeric := 0;
begin
  select * into v_res
  from public.reservations
  where id = p_reservation_id
  for update;

  if not found then
    ok := false; error_code := 'not_found'; error_message := 'Reservation introuvable.';
    return next; return;
  end if;
  if auth.uid() is null or auth.uid() <> v_res.user_id then
    ok := false; error_code := 'forbidden'; error_message := 'Acces refuse.';
    return next; return;
  end if;
  if lower(coalesce(v_res.status, '')) = 'cancelled' then
    ok := false; error_code := 'cancelled_locked'; error_message := 'Cette reservation a deja ete annulee.';
    return next; return;
  end if;
  if lower(coalesce(v_res.status, '')) in ('no_show', 'arrived', 'seated', 'completed') then
    ok := false; error_code := 'invalid_state'; error_message := 'Reservation deja terminee.';
    return next; return;
  end if;

  v_effective_dt := coalesce(
    v_res.reservation_time,
    (v_res.date::timestamp + v_res.time::time) at time zone 'Europe/Zurich'
  );
  if v_effective_dt - now() < interval '2 hours' then
    ok := false; error_code := 'too_late'; error_message := 'Annulation impossible moins de 2h avant la reservation.';
    return next; return;
  end if;

  v_refundable_amount := greatest(
    coalesce(v_res.total_amount, 0)::numeric - coalesce(v_res.refunded_amount_chf, 0)::numeric,
    0
  );

  update public.reservations
  set status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = 'customer',
      cancellation_reason_code = null,
      cancellation_reason_details = null,
      refund_status = case when v_refundable_amount > 0 then 'pending' else refund_status end,
      refund_reason = case when v_refundable_amount > 0
        then coalesce(nullif(trim(coalesce(refund_reason, '')), ''), 'customer_cancelled')
        else refund_reason end,
      refund_initiated_by = case when v_refundable_amount > 0 then 'customer' else refund_initiated_by end,
      updated_at = now()
  where id = p_reservation_id;

  ok := true; error_code := null; error_message := null;
  return next; return;
end;
$$;

-- One review per customer/restaurant is already the RPC contract; enforce it
-- under races as well.
do $$
begin
  if exists (
    select user_id, restaurant_id
    from public.reviews
    where user_id is not null
    group by user_id, restaurant_id
    having count(*) > 1
  ) then
    raise exception 'Review hardening aborted: duplicate customer/restaurant review';
  end if;
end;
$$;

create unique index if not exists reviews_user_restaurant_unique
  on public.reviews (user_id, restaurant_id)
  where user_id is not null;

notify pgrst, 'reload schema';
