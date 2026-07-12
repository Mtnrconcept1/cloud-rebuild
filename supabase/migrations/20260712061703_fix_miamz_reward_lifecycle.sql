-- MIAMZ rewards become real only after a delivered order or an honoured
-- reservation. Every premature historical credit is compensated below and
-- restored exactly once if the order or reservation later becomes eligible.

do $$
begin
  if exists (
    select order_id
    from public.loyalty_transactions
    where order_id is not null
      and transaction_type in ('order_earned', 'donation')
    group by order_id
    having count(*) > 1
  ) then
    raise exception 'MIAMZ lifecycle migration aborted: duplicate primary order reward';
  end if;
end;
$$;

do $$
begin
  if exists (
    select reservation_id
    from public.loyalty_transactions
    where reservation_id is not null
      and transaction_type = 'reservation_earned'
    group by reservation_id
    having count(*) > 1
  ) then
    raise exception 'MIAMZ lifecycle migration aborted: duplicate primary reservation reward';
  end if;
end;
$$;

create unique index if not exists loyalty_order_primary_reward_once
  on public.loyalty_transactions (order_id)
  where order_id is not null
    and transaction_type in ('order_earned', 'donation');

create unique index if not exists loyalty_reservation_primary_reward_once
  on public.loyalty_transactions (reservation_id)
  where reservation_id is not null
    and transaction_type = 'reservation_earned';

create unique index if not exists loyalty_reward_reversal_once
  on public.loyalty_transactions ((metadata ->> 'reverses_transaction_id'))
  where transaction_type in (
    'order_reward_reversal',
    'reservation_reward_reversal',
    'donation_reversal'
  ) and metadata ? 'reverses_transaction_id';

create unique index if not exists loyalty_reward_reinstatement_once
  on public.loyalty_transactions ((metadata ->> 'reinstates_transaction_id'))
  where transaction_type in (
    'order_reward_reinstated',
    'reservation_reward_reinstated',
    'donation_reinstated'
  ) and metadata ? 'reinstates_transaction_id';

create or replace function public.credit_order_loyalty_points()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text := lower(coalesce(new.status, ''));
  v_payment_status text := lower(coalesce(new.payment_status, ''));
  v_refund_status text := lower(coalesce(new.refund_status, ''));
  v_order_type text := lower(coalesce(nullif(new.type, ''), new.metadata ->> 'type', ''));
  v_eligible boolean;
  v_disqualifying boolean;
  v_primary_reward public.loyalty_transactions%rowtype;
  v_active_reward public.loyalty_transactions%rowtype;
  v_has_primary_reward boolean := false;
  v_has_active_reward boolean := false;
  v_transaction_id uuid;
  v_restaurant_multiplier numeric := 1;
  v_miamz_multiplier numeric := 1;
  v_effective_multiplier numeric := 1;
  v_multiplier_text text;
  v_miamz_state jsonb := '{}'::jsonb;
  v_has_welcome_miamz boolean := false;
  v_donate boolean := false;
  v_earned integer;
begin
  if new.user_id is null then return new; end if;

  v_eligible := (
    v_status in ('delivered', 'completed')
    or (
      v_status = 'picked_up'
      and v_order_type in ('pickup', 'takeaway', 'emporter', 'click_and_collect')
    )
  ) and v_payment_status in ('paid', 'captured')
    and coalesce(new.total_amount, 0) > 0
    and v_refund_status not in ('refunded', 'fully_refunded', 'full_refund');

  v_disqualifying := v_status in ('cancelled', 'refunded', 'payment_failed', 'refused')
    or v_payment_status in ('failed', 'refunded')
    or v_refund_status in ('refunded', 'fully_refunded', 'full_refund');

  select * into v_primary_reward
  from public.loyalty_transactions
  where order_id = new.id
    and transaction_type in ('order_earned', 'donation')
  order by created_at, id
  limit 1;
  v_has_primary_reward := found;

  select * into v_active_reward
  from public.loyalty_transactions candidate
  where candidate.order_id = new.id
    and candidate.transaction_type in (
      'order_earned', 'donation', 'order_reward_reinstated', 'donation_reinstated'
    )
    and candidate.amount > 0
    and not exists (
      select 1 from public.loyalty_transactions reversal
      where reversal.metadata ->> 'reverses_transaction_id' = candidate.id::text
    )
  order by candidate.created_at desc, candidate.id desc
  limit 1;
  v_has_active_reward := found;

  if v_disqualifying and v_has_active_reward then
    v_transaction_id := null;
    insert into public.loyalty_transactions (
      user_id, order_id, amount, transaction_type, description, metadata
    ) values (
      v_active_reward.user_id,
      new.id,
      -abs(v_active_reward.amount),
      case when v_active_reward.transaction_type in ('donation', 'donation_reinstated')
        then 'donation_reversal' else 'order_reward_reversal' end,
      case when v_active_reward.transaction_type in ('donation', 'donation_reinstated')
        then 'Annulation du don Miamz lié à la commande'
        else 'Annulation des points Miamz liés à la commande' end,
      jsonb_build_object(
        'reverses_transaction_id', v_active_reward.id,
        'reason', 'order_disqualified',
        'status', new.status,
        'payment_status', new.payment_status,
        'refund_status', new.refund_status,
        'evaluated_at', now()
      )
    ) on conflict do nothing
    returning id into v_transaction_id;

    if v_transaction_id is not null then
      if v_active_reward.transaction_type in ('donation', 'donation_reinstated') then
        insert into public.solidarity_donations (user_id, points_amount, meals_count)
        values (
          v_active_reward.user_id,
          -abs(v_active_reward.amount),
          -floor(abs(v_active_reward.amount)::numeric / 1000)::integer
        );
      else
        update public.profiles
        set loyalty_points = coalesce(loyalty_points, 0) - abs(v_active_reward.amount)
        where user_id = v_active_reward.user_id;
      end if;
    end if;
    return new;
  end if;

  if not v_eligible or v_has_active_reward then return new; end if;

  -- A legacy/premature reward compensated below is restored exactly once
  -- when the order finally becomes eligible. No multiplier is recalculated.
  if v_has_primary_reward then
    v_transaction_id := null;
    insert into public.loyalty_transactions (
      user_id, order_id, amount, transaction_type, description, metadata
    ) values (
      v_primary_reward.user_id,
      new.id,
      abs(v_primary_reward.amount),
      case when v_primary_reward.transaction_type = 'donation'
        then 'donation_reinstated' else 'order_reward_reinstated' end,
      case when v_primary_reward.transaction_type = 'donation'
        then 'Don Miamz rétabli après livraison'
        else 'Points Miamz rétablis après livraison' end,
      jsonb_build_object(
        'reinstates_transaction_id', v_primary_reward.id,
        'eligibility_status', new.status,
        'payment_status', new.payment_status,
        'evaluated_at', now()
      )
    ) on conflict do nothing
    returning id into v_transaction_id;
    if v_transaction_id is not null then
      if v_primary_reward.transaction_type = 'donation' then
        insert into public.solidarity_donations (user_id, points_amount, meals_count)
        values (
          v_primary_reward.user_id,
          abs(v_primary_reward.amount),
          floor(abs(v_primary_reward.amount)::numeric / 1000)::integer
        );
      else
        update public.profiles
        set loyalty_points = coalesce(loyalty_points, 0) + abs(v_primary_reward.amount)
        where user_id = v_primary_reward.user_id;
      end if;
    end if;
    return new;
  end if;

  if coalesce(new.metadata, '{}'::jsonb) ? 'miamz_benefits_applied' then
    v_has_welcome_miamz := coalesce(new.metadata -> 'miamz_benefits_applied', '[]'::jsonb) ? 'welcome_miamz';
    v_miamz_state := coalesce(new.metadata -> 'miamz', '{}'::jsonb);
  else
    v_miamz_state := public.resolve_miamz_benefit_state(new.user_id);
    v_has_welcome_miamz := coalesce(v_miamz_state -> 'active_benefit_ids', '[]'::jsonb) ? 'welcome_miamz';
  end if;
  if not v_has_welcome_miamz then return new; end if;

  select coalesce(points_multiplier, 1) into v_restaurant_multiplier
  from public.restaurants where id = new.restaurant_id;
  v_restaurant_multiplier := least(5, greatest(1, coalesce(v_restaurant_multiplier, 1)));
  v_multiplier_text := coalesce(
    new.metadata ->> 'miamz_points_multiplier',
    new.metadata #>> '{miamz,effects,points_multiplier}',
    v_miamz_state #>> '{effects,points_multiplier}',
    '1'
  );
  if v_multiplier_text ~ '^[0-9]+([.][0-9]+)?$' then
    v_miamz_multiplier := least(5, greatest(1, v_multiplier_text::numeric));
  end if;
  v_effective_multiplier := least(5, v_restaurant_multiplier * v_miamz_multiplier);
  v_earned := greatest(1, floor(new.total_amount * 10 * v_effective_multiplier))::integer;
  v_donate := coalesce(new.donate_earned_xp, false)
    or lower(coalesce(new.metadata ->> 'donate_earned_xp', 'false')) in ('1', 'true', 'yes', 'oui');

  v_transaction_id := null;
  insert into public.loyalty_transactions (
    user_id, order_id, amount, transaction_type, description, metadata
  ) values (
    new.user_id,
    new.id,
    v_earned,
    case when v_donate then 'donation' else 'order_earned' end,
    case when v_donate
      then 'Don solidaire Miamz après commande livrée'
      else 'Points Miamz crédités après commande livrée' end,
    jsonb_build_object(
      'eligibility_status', new.status,
      'payment_status', new.payment_status,
      'evaluated_at', now(),
      'restaurant_multiplier', v_restaurant_multiplier,
      'miamz_points_multiplier', v_miamz_multiplier,
      'effective_multiplier', v_effective_multiplier,
      'miamz_state', v_miamz_state
    )
  ) on conflict do nothing
  returning id into v_transaction_id;

  if v_transaction_id is not null then
    if v_donate then
      insert into public.solidarity_donations (user_id, points_amount, meals_count)
      values (new.user_id, v_earned, floor(v_earned::numeric / 1000)::integer);
    else
      insert into public.profiles (user_id, loyalty_points)
      values (new.user_id, v_earned)
      on conflict (user_id) do update
      set loyalty_points = coalesce(profiles.loyalty_points, 0) + excluded.loyalty_points;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.credit_reservation_loyalty_points()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text := lower(coalesce(new.status, ''));
  v_refund_status text := lower(coalesce(new.refund_status, ''));
  v_eligible boolean;
  v_disqualifying boolean;
  v_primary_reward public.loyalty_transactions%rowtype;
  v_active_reward public.loyalty_transactions%rowtype;
  v_has_primary_reward boolean := false;
  v_has_active_reward boolean := false;
  v_transaction_id uuid;
  v_restaurant_multiplier numeric := 1;
  v_miamz_multiplier numeric := 1;
  v_effective_multiplier numeric := 1;
  v_multiplier_text text;
  v_miamz_state jsonb := '{}'::jsonb;
  v_has_welcome_miamz boolean := false;
  v_donate boolean := false;
  v_earned integer;
begin
  if new.user_id is null then return new; end if;
  v_eligible := v_status in ('arrived', 'seated', 'completed')
    and v_refund_status not in ('refunded', 'fully_refunded', 'full_refund');
  v_disqualifying := v_status in ('cancelled', 'no_show', 'refunded')
    or v_refund_status in ('refunded', 'fully_refunded', 'full_refund');

  select * into v_primary_reward
  from public.loyalty_transactions
  where reservation_id = new.id
    and transaction_type = 'reservation_earned'
  order by created_at, id
  limit 1;
  v_has_primary_reward := found;

  select * into v_active_reward
  from public.loyalty_transactions candidate
  where candidate.reservation_id = new.id
    and candidate.transaction_type in (
      'reservation_earned', 'reservation_reward_reinstated', 'donation_reinstated'
    )
    and candidate.amount > 0
    and not exists (
      select 1 from public.loyalty_transactions reversal
      where reversal.metadata ->> 'reverses_transaction_id' = candidate.id::text
    )
  order by candidate.created_at desc, candidate.id desc
  limit 1;
  v_has_active_reward := found;

  if v_disqualifying and v_has_active_reward then
    v_transaction_id := null;
    insert into public.loyalty_transactions (
      user_id, reservation_id, amount, transaction_type, description, metadata
    ) values (
      v_active_reward.user_id,
      new.id,
      -abs(v_active_reward.amount),
      case when v_active_reward.transaction_type = 'donation_reinstated'
          or lower(coalesce(v_active_reward.metadata ->> 'donated', 'false')) in ('1', 'true', 'yes', 'oui')
        then 'donation_reversal' else 'reservation_reward_reversal' end,
      case when v_active_reward.transaction_type = 'donation_reinstated'
          or lower(coalesce(v_active_reward.metadata ->> 'donated', 'false')) in ('1', 'true', 'yes', 'oui')
        then 'Annulation du don Miamz lié à la réservation'
        else 'Annulation des points Miamz liés à la réservation' end,
      jsonb_build_object(
        'reverses_transaction_id', v_active_reward.id,
        'reason', 'reservation_disqualified',
        'status', new.status,
        'refund_status', new.refund_status,
        'evaluated_at', now()
      )
    ) on conflict do nothing
    returning id into v_transaction_id;
    if v_transaction_id is not null then
      if v_active_reward.transaction_type = 'donation_reinstated'
          or lower(coalesce(v_active_reward.metadata ->> 'donated', 'false')) in ('1', 'true', 'yes', 'oui') then
        insert into public.solidarity_donations (user_id, points_amount, meals_count)
        values (
          v_active_reward.user_id,
          -abs(v_active_reward.amount),
          -floor(abs(v_active_reward.amount)::numeric / 1000)::integer
        );
      else
        update public.profiles
        set loyalty_points = coalesce(loyalty_points, 0) - abs(v_active_reward.amount)
        where user_id = v_active_reward.user_id;
      end if;
    end if;
    return new;
  end if;

  if not v_eligible or v_has_active_reward then return new; end if;

  if v_has_primary_reward then
    v_donate := lower(coalesce(v_primary_reward.metadata ->> 'donated', 'false')) in ('1', 'true', 'yes', 'oui');
    v_transaction_id := null;
    insert into public.loyalty_transactions (
      user_id, reservation_id, amount, transaction_type, description, metadata
    ) values (
      v_primary_reward.user_id,
      new.id,
      abs(v_primary_reward.amount),
      case when v_donate then 'donation_reinstated' else 'reservation_reward_reinstated' end,
      case when v_donate
        then 'Don Miamz rétabli après réservation honorée'
        else 'Points Miamz rétablis après réservation honorée' end,
      jsonb_build_object(
        'reinstates_transaction_id', v_primary_reward.id,
        'donated', v_donate,
        'eligibility_status', new.status,
        'evaluated_at', now()
      )
    ) on conflict do nothing
    returning id into v_transaction_id;
    if v_transaction_id is not null then
      if v_donate then
        insert into public.solidarity_donations (user_id, points_amount, meals_count)
        values (
          v_primary_reward.user_id,
          abs(v_primary_reward.amount),
          floor(abs(v_primary_reward.amount)::numeric / 1000)::integer
        );
      else
        update public.profiles
        set loyalty_points = coalesce(loyalty_points, 0) + abs(v_primary_reward.amount)
        where user_id = v_primary_reward.user_id;
      end if;
    end if;
    return new;
  end if;

  if coalesce(new.metadata, '{}'::jsonb) ? 'miamz_benefits_applied' then
    v_has_welcome_miamz := coalesce(new.metadata -> 'miamz_benefits_applied', '[]'::jsonb) ? 'welcome_miamz';
    v_miamz_state := coalesce(new.metadata -> 'miamz', '{}'::jsonb);
  else
    v_miamz_state := public.resolve_miamz_benefit_state(new.user_id);
    v_has_welcome_miamz := coalesce(v_miamz_state -> 'active_benefit_ids', '[]'::jsonb) ? 'welcome_miamz';
  end if;
  if not v_has_welcome_miamz then return new; end if;

  select coalesce(points_multiplier, 1) into v_restaurant_multiplier
  from public.restaurants where id = new.restaurant_id;
  v_restaurant_multiplier := least(5, greatest(1, coalesce(v_restaurant_multiplier, 1)));
  v_multiplier_text := coalesce(
    new.metadata #>> '{miamz,effects,points_multiplier}',
    v_miamz_state #>> '{effects,points_multiplier}',
    '1'
  );
  if v_multiplier_text ~ '^[0-9]+([.][0-9]+)?$' then
    v_miamz_multiplier := least(5, greatest(1, v_multiplier_text::numeric));
  end if;
  v_effective_multiplier := least(5, v_restaurant_multiplier * v_miamz_multiplier);
  v_earned := greatest(1, floor(100 * v_effective_multiplier))::integer;
  v_donate := lower(coalesce(new.metadata ->> 'donate_earned_xp', 'false')) in ('1', 'true', 'yes', 'oui');

  if v_donate then
    v_transaction_id := null;
    insert into public.loyalty_transactions (
      user_id, reservation_id, amount, transaction_type, description, metadata
    ) values (
      new.user_id,
      new.id,
      v_earned,
      'reservation_earned',
      'Don solidaire Miamz après réservation honorée',
      jsonb_build_object(
        'donated', true,
        'eligibility_status', new.status,
        'evaluated_at', now(),
        'restaurant_multiplier', v_restaurant_multiplier,
        'miamz_points_multiplier', v_miamz_multiplier
      )
    ) on conflict do nothing
    returning id into v_transaction_id;
    if v_transaction_id is not null then
      insert into public.solidarity_donations (user_id, points_amount, meals_count)
      values (new.user_id, v_earned, floor(v_earned::numeric / 1000)::integer);
    end if;
  else
    v_transaction_id := null;
    insert into public.loyalty_transactions (
      user_id, reservation_id, amount, transaction_type, description, metadata
    ) values (
      new.user_id,
      new.id,
      v_earned,
      'reservation_earned',
      'Points Miamz crédités après réservation honorée',
      jsonb_build_object(
        'eligibility_status', new.status,
        'evaluated_at', now(),
        'restaurant_multiplier', v_restaurant_multiplier,
        'miamz_points_multiplier', v_miamz_multiplier
      )
    ) on conflict do nothing
    returning id into v_transaction_id;
    if v_transaction_id is not null then
      insert into public.profiles (user_id, loyalty_points)
      values (new.user_id, v_earned)
      on conflict (user_id) do update
      set loyalty_points = coalesce(profiles.loyalty_points, 0) + excluded.loyalty_points;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_credit_order_loyalty on public.orders;
create trigger trg_credit_order_loyalty
after insert or update of status, payment_status, refund_status, refunded_amount_chf
on public.orders for each row
execute function public.credit_order_loyalty_points();

drop trigger if exists trg_credit_reservation_loyalty on public.reservations;
create trigger trg_credit_reservation_loyalty
after insert or update of status, refund_status, refunded_amount_chf
on public.reservations for each row
execute function public.credit_reservation_loyalty_points();

-- Remove every legacy reward that is not yet earned. Pending/confirmed rewards
-- are restored exactly once by the functions above when they reach the final
-- eligible state. Missing legacy profiles stay in the ledger for manual review.
-- Keep the balance preflight and the compensating updates atomic with respect
-- to gifts, donations and any other concurrent profile balance change.
lock table public.profiles in share row exclusive mode;

do $$
begin
  if exists (
    with invalid_rewards as (
      select lt.user_id, sum(lt.amount)::integer as amount
      from public.loyalty_transactions lt
      join public.orders o on o.id = lt.order_id
      where lt.transaction_type = 'order_earned'
        and not (
          (
            lower(coalesce(o.status, '')) in ('delivered', 'completed')
            or (
              lower(coalesce(o.status, '')) = 'picked_up'
              and lower(coalesce(nullif(o.type, ''), o.metadata ->> 'type', ''))
                in ('pickup', 'takeaway', 'emporter', 'click_and_collect')
            )
          )
          and lower(coalesce(o.payment_status, '')) in ('paid', 'captured')
          and coalesce(o.total_amount, 0) > 0
          and lower(coalesce(o.refund_status, '')) not in ('refunded', 'fully_refunded', 'full_refund')
        )
        and not exists (
          select 1 from public.loyalty_transactions reversal
          where reversal.metadata ->> 'reverses_transaction_id' = lt.id::text
        )
      group by lt.user_id
      union all
      select lt.user_id, sum(lt.amount)::integer
      from public.loyalty_transactions lt
      join public.reservations r on r.id = lt.reservation_id
      where lt.transaction_type = 'reservation_earned'
        and lower(coalesce(lt.metadata ->> 'donated', 'false')) not in ('1', 'true', 'yes', 'oui')
        and not (
          lower(coalesce(r.status, '')) in ('arrived', 'seated', 'completed')
          and lower(coalesce(r.refund_status, '')) not in ('refunded', 'fully_refunded', 'full_refund')
        )
        and not exists (
          select 1 from public.loyalty_transactions reversal
          where reversal.metadata ->> 'reverses_transaction_id' = lt.id::text
        )
      group by lt.user_id
    ), totals as (
      select user_id, sum(amount)::integer as amount
      from invalid_rewards group by user_id
    )
    select 1
    from totals
    join public.profiles using (user_id)
    where coalesce(profiles.loyalty_points, 0) < totals.amount
  ) then
    raise exception 'MIAMZ compensation aborted: an existing profile would become negative';
  end if;
end;
$$;

with candidates as (
  select lt.id as source_transaction_id, lt.user_id, lt.order_id, lt.amount,
         o.status, o.payment_status, o.refund_status
  from public.loyalty_transactions lt
  join public.orders o on o.id = lt.order_id
  join public.profiles p on p.user_id = lt.user_id
  where lt.transaction_type = 'order_earned'
    and not (
      (
        lower(coalesce(o.status, '')) in ('delivered', 'completed')
        or (
          lower(coalesce(o.status, '')) = 'picked_up'
          and lower(coalesce(nullif(o.type, ''), o.metadata ->> 'type', ''))
            in ('pickup', 'takeaway', 'emporter', 'click_and_collect')
        )
      )
      and lower(coalesce(o.payment_status, '')) in ('paid', 'captured')
      and coalesce(o.total_amount, 0) > 0
      and lower(coalesce(o.refund_status, '')) not in ('refunded', 'fully_refunded', 'full_refund')
    )
), inserted as (
  insert into public.loyalty_transactions (
    user_id, order_id, amount, transaction_type, description, metadata
  )
  select user_id, order_id, -abs(amount), 'order_reward_reversal',
         'Compensation du crédit prématuré Miamz (migration)',
         jsonb_build_object(
           'reverses_transaction_id', source_transaction_id,
           'reason', 'migration_reward_not_yet_eligible',
           'status', status,
           'payment_status', payment_status,
           'refund_status', refund_status,
           'evaluated_at', now()
         )
  from candidates
  on conflict do nothing
  returning user_id, amount
), deltas as (
  select user_id, sum(amount)::integer as delta from inserted group by user_id
)
update public.profiles p
set loyalty_points = coalesce(p.loyalty_points, 0) + deltas.delta
from deltas where p.user_id = deltas.user_id;

with candidates as (
  select lt.id as source_transaction_id, lt.user_id, lt.reservation_id, lt.amount,
         r.status, r.refund_status
  from public.loyalty_transactions lt
  join public.reservations r on r.id = lt.reservation_id
  join public.profiles p on p.user_id = lt.user_id
  where lt.transaction_type = 'reservation_earned'
    and lower(coalesce(lt.metadata ->> 'donated', 'false')) not in ('1', 'true', 'yes', 'oui')
    and not (
      lower(coalesce(r.status, '')) in ('arrived', 'seated', 'completed')
      and lower(coalesce(r.refund_status, '')) not in ('refunded', 'fully_refunded', 'full_refund')
    )
), inserted as (
  insert into public.loyalty_transactions (
    user_id, reservation_id, amount, transaction_type, description, metadata
  )
  select user_id, reservation_id, -abs(amount), 'reservation_reward_reversal',
         'Compensation du crédit prématuré Miamz (migration)',
         jsonb_build_object(
           'reverses_transaction_id', source_transaction_id,
           'reason', 'migration_reward_not_yet_eligible',
           'status', status,
           'refund_status', refund_status,
           'evaluated_at', now()
         )
  from candidates
  on conflict do nothing
  returning user_id, amount
), deltas as (
  select user_id, sum(amount)::integer as delta from inserted group by user_id
)
update public.profiles p
set loyalty_points = coalesce(p.loyalty_points, 0) + deltas.delta
from deltas where p.user_id = deltas.user_id;

-- Donation rewards never touched the client balance. Their compensating entry
-- adjusts the append-only solidarity aggregate instead.
with candidates as (
  select lt.id as source_transaction_id, lt.user_id, lt.order_id, lt.amount,
         o.status, o.payment_status, o.refund_status
  from public.loyalty_transactions lt
  join public.orders o on o.id = lt.order_id
  where lt.transaction_type = 'donation'
    and not (
      (
        lower(coalesce(o.status, '')) in ('delivered', 'completed')
        or (
          lower(coalesce(o.status, '')) = 'picked_up'
          and lower(coalesce(nullif(o.type, ''), o.metadata ->> 'type', ''))
            in ('pickup', 'takeaway', 'emporter', 'click_and_collect')
        )
      )
      and lower(coalesce(o.payment_status, '')) in ('paid', 'captured')
      and coalesce(o.total_amount, 0) > 0
      and lower(coalesce(o.refund_status, '')) not in ('refunded', 'fully_refunded', 'full_refund')
    )
), inserted as (
  insert into public.loyalty_transactions (
    user_id, order_id, amount, transaction_type, description, metadata
  )
  select user_id, order_id, -abs(amount), 'donation_reversal',
         'Compensation du don prématuré Miamz (migration)',
         jsonb_build_object(
           'reverses_transaction_id', source_transaction_id,
           'reason', 'migration_donation_not_yet_eligible',
           'status', status,
           'payment_status', payment_status,
           'refund_status', refund_status,
           'evaluated_at', now()
         )
  from candidates
  on conflict do nothing
  returning user_id, amount
)
insert into public.solidarity_donations (user_id, points_amount, meals_count)
select user_id, amount, -floor(abs(amount)::numeric / 1000)::integer
from inserted;

with candidates as (
  select lt.id as source_transaction_id, lt.user_id, lt.reservation_id, lt.amount,
         r.status, r.refund_status
  from public.loyalty_transactions lt
  join public.reservations r on r.id = lt.reservation_id
  where lt.transaction_type = 'reservation_earned'
    and lower(coalesce(lt.metadata ->> 'donated', 'false')) in ('1', 'true', 'yes', 'oui')
    and not (
      lower(coalesce(r.status, '')) in ('arrived', 'seated', 'completed')
      and lower(coalesce(r.refund_status, '')) not in ('refunded', 'fully_refunded', 'full_refund')
    )
), inserted as (
  insert into public.loyalty_transactions (
    user_id, reservation_id, amount, transaction_type, description, metadata
  )
  select user_id, reservation_id, -abs(amount), 'donation_reversal',
         'Compensation du don prématuré Miamz (migration)',
         jsonb_build_object(
           'reverses_transaction_id', source_transaction_id,
           'reason', 'migration_donation_not_yet_eligible',
           'status', status,
           'refund_status', refund_status,
           'evaluated_at', now()
         )
  from candidates
  on conflict do nothing
  returning user_id, amount
)
insert into public.solidarity_donations (user_id, points_amount, meals_count)
select user_id, amount, -floor(abs(amount)::numeric / 1000)::integer
from inserted;

revoke execute on function public.credit_order_loyalty_points() from public, anon, authenticated;
revoke execute on function public.credit_reservation_loyalty_points() from public, anon, authenticated;
grant execute on function public.credit_order_loyalty_points() to service_role;
grant execute on function public.credit_reservation_loyalty_points() to service_role;

notify pgrst, 'reload schema';
