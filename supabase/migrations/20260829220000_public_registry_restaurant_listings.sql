-- Public REG/SITG restaurant listings.
-- Keeps source-indexed businesses outside the operational restaurants table until a claim is approved.

create table if not exists public.public_restaurant_listings (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_url text not null,
  source_ref text not null,
  source_collected_on date,
  name text not null,
  category text not null,
  activity_detail text,
  address text not null,
  postal_code text,
  city text not null,
  municipality text,
  phone text,
  website_url text,
  latitude double precision,
  longitude double precision,
  slug text not null,
  claim_status text not null default 'unclaimed',
  claim_application_id uuid references public.signup_applications(id) on delete set null,
  claimed_restaurant_id uuid references public.restaurants(id) on delete set null,
  claim_requested_at timestamptz,
  claimed_at timestamptz,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint public_restaurant_listings_source_ref_key unique (source, source_ref),
  constraint public_restaurant_listings_slug_key unique (slug),
  constraint public_restaurant_listings_claim_status_check
    check (claim_status in ('unclaimed', 'claim_pending', 'claimed')),
  constraint public_restaurant_listings_claim_state_check
    check (
      (claim_status = 'unclaimed' and claimed_restaurant_id is null)
      or (claim_status = 'claim_pending' and claim_application_id is not null and claimed_restaurant_id is null)
      or (claim_status = 'claimed' and claim_application_id is not null and claimed_restaurant_id is not null)
    )
);

create index if not exists idx_public_restaurant_listings_city
  on public.public_restaurant_listings (lower(city), name);
create index if not exists idx_public_restaurant_listings_claim_status
  on public.public_restaurant_listings (claim_status, is_published);
create index if not exists idx_public_restaurant_listings_name_trgm
  on public.public_restaurant_listings using gin (lower(name) gin_trgm_ops);
create index if not exists idx_public_restaurant_listings_city_trgm
  on public.public_restaurant_listings using gin (lower(city) gin_trgm_ops);

alter table public.public_restaurant_listings enable row level security;

drop policy if exists public_restaurant_listings_admin_all on public.public_restaurant_listings;
create policy public_restaurant_listings_admin_all
on public.public_restaurant_listings
for all
to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role))
with check (public.has_role(auth.uid(), 'admin'::public.app_role));

revoke all on table public.public_restaurant_listings from anon;
grant select, insert, update, delete on table public.public_restaurant_listings to authenticated;
grant all on table public.public_restaurant_listings to service_role;

drop trigger if exists set_updated_at_public_restaurant_listings on public.public_restaurant_listings;
create trigger set_updated_at_public_restaurant_listings
before update on public.public_restaurant_listings
for each row execute function public.update_updated_at_column();

create or replace function public.get_public_restaurant_listing(p_slug text)
returns table(
  id uuid,
  name text,
  category text,
  activity_detail text,
  address text,
  postal_code text,
  city text,
  municipality text,
  phone text,
  website_url text,
  latitude double precision,
  longitude double precision,
  slug text,
  source text,
  source_url text,
  source_collected_on date,
  claim_status text,
  claimed_restaurant_id uuid
)
language sql
stable
security definer
set search_path = public
as $function$
  select
    listing.id,
    listing.name,
    listing.category,
    listing.activity_detail,
    listing.address,
    listing.postal_code,
    listing.city,
    listing.municipality,
    listing.phone,
    listing.website_url,
    listing.latitude,
    listing.longitude,
    listing.slug,
    listing.source,
    listing.source_url,
    listing.source_collected_on,
    listing.claim_status,
    listing.claimed_restaurant_id
  from public.public_restaurant_listings as listing
  where listing.slug = left(lower(trim(coalesce(p_slug, ''))), 160)
    and listing.is_published is true
  limit 1;
$function$;

revoke all on function public.get_public_restaurant_listing(text) from public;
grant execute on function public.get_public_restaurant_listing(text) to anon, authenticated, service_role;

create or replace function public.search_restaurant_discovery_catalog(
  p_query text default null,
  p_city text default null,
  p_cuisine text default null,
  p_price_range integer default null,
  p_delivery_only boolean default false,
  p_min_rating numeric default 0,
  p_sort_by text default 'pertinence',
  p_sort_direction text default null,
  p_limit integer default 60,
  p_offset integer default 0
)
returns table(
  id uuid,
  name text,
  description text,
  cuisine_type text,
  rating numeric,
  review_count integer,
  price_range integer,
  delivery_fee numeric,
  image_url text,
  address text,
  city text,
  delivery_available boolean,
  created_at timestamptz,
  category_names text[],
  category_slugs text[],
  matched_via_menu boolean,
  monthly_reservations integer,
  monthly_orders integer,
  promotion_score numeric,
  relevance_score numeric,
  slug text,
  opening_hours jsonb,
  supports_reservation boolean,
  listing_kind text,
  listing_source text,
  listing_source_url text,
  listing_source_collected_on date,
  listing_claim_status text,
  website_url text,
  phone text,
  latitude double precision,
  longitude double precision
)
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_query text := public.normalize_search_text(p_query);
  v_city text := public.normalize_search_text(p_city);
  v_cuisine text := public.normalize_search_text(p_cuisine);
  v_sort_by text := case
    when public.normalize_search_text(p_sort_by) in (
      'pertinence', 'note', 'promotion', 'prix',
      'popularite', 'nouveaux', 'mieux_notes_mois', 'plus_reserves_mois'
    ) then public.normalize_search_text(p_sort_by)
    else 'pertinence'
  end;
  v_sort_direction text := case
    when lower(coalesce(p_sort_direction, '')) in ('asc', 'desc') then lower(p_sort_direction)
    when public.normalize_search_text(p_sort_by) = 'prix' then 'asc'
    else 'desc'
  end;
  v_limit integer := least(greatest(coalesce(p_limit, 60), 1), 100);
  v_offset integer := least(greatest(coalesce(p_offset, 0), 0), 10000);
begin
  if public.commercial_demo_current_user_is_restricted() then
    raise exception 'COMMERCIAL_DEMO_PRODUCTION_RPC_BLOCKED: use commercial_demo_* RPCs'
      using errcode = '42501';
  end if;

  return query
  with core as (
    select
      core_result.id,
      core_result.name,
      core_result.description,
      core_result.cuisine_type,
      core_result.rating,
      core_result.review_count,
      core_result.price_range,
      core_result.delivery_fee,
      core_result.image_url,
      core_result.address,
      core_result.city,
      core_result.delivery_available,
      core_result.created_at,
      core_result.category_names,
      core_result.category_slugs,
      core_result.matched_via_menu,
      core_result.monthly_reservations,
      core_result.monthly_orders,
      core_result.promotion_score,
      core_result.relevance_score,
      restaurant.slug,
      restaurant.opening_hours,
      restaurant.supports_reservation,
      'restaurant'::text as listing_kind,
      null::text as listing_source,
      null::text as listing_source_url,
      null::date as listing_source_collected_on,
      'claimed'::text as listing_claim_status,
      null::text as website_url,
      restaurant.phone,
      restaurant.latitude,
      restaurant.longitude
    from public.search_restaurants_catalog(
      p_query,
      p_city,
      p_cuisine,
      p_price_range,
      p_delivery_only,
      p_min_rating,
      p_sort_by,
      p_sort_direction,
      100,
      0
    ) as core_result
    join public.restaurants as restaurant on restaurant.id = core_result.id
  ),
  registry as (
    select
      listing.id,
      listing.name,
      case
        when nullif(trim(listing.activity_detail), '') is not null
          then 'Établissement professionnel indexé depuis le REG/SITG. Activité déclarée : ' || trim(listing.activity_detail) || '.'
        else 'Établissement professionnel indexé depuis le REG/SITG.'
      end as description,
      coalesce(nullif(trim(listing.activity_detail), ''), case when listing.category = 'Bar' then 'Bar' else 'Restaurant / café' end) as cuisine_type,
      0::numeric as rating,
      0::integer as review_count,
      null::integer as price_range,
      0::numeric as delivery_fee,
      null::text as image_url,
      listing.address,
      listing.city,
      false as delivery_available,
      listing.created_at,
      array[case when listing.category = 'Bar' then 'Bar' else 'Restaurant / café' end]::text[] as category_names,
      array[case when listing.category = 'Bar' then 'bar' else 'restaurant' end]::text[] as category_slugs,
      false as matched_via_menu,
      0::integer as monthly_reservations,
      0::integer as monthly_orders,
      0::numeric as promotion_score,
      (
        case
          when v_query = '' then 0
          when public.normalize_search_text(listing.name) = v_query then 210
          when public.normalize_search_text(listing.name) like v_query || '%' then 160
          when public.normalize_search_text(listing.name) like '%' || v_query || '%' then 115
          else 0
        end
        + case when v_query <> '' and public.normalize_search_text(listing.activity_detail) like '%' || v_query || '%' then 60 else 0 end
        + case when v_query <> '' and public.normalize_search_text(listing.address) like '%' || v_query || '%' then 45 else 0 end
        + case when v_query <> '' and public.normalize_search_text(listing.city) like '%' || v_query || '%' then 40 else 0 end
      )::numeric as relevance_score,
      listing.slug,
      null::jsonb as opening_hours,
      false as supports_reservation,
      'public_registry'::text as listing_kind,
      listing.source as listing_source,
      listing.source_url as listing_source_url,
      listing.source_collected_on as listing_source_collected_on,
      listing.claim_status as listing_claim_status,
      listing.website_url,
      listing.phone,
      listing.latitude,
      listing.longitude
    from public.public_restaurant_listings as listing
    where listing.is_published is true
      and listing.claim_status <> 'claimed'
      and (v_city = '' or public.normalize_search_text(listing.city) like '%' || v_city || '%'
        or public.normalize_search_text(listing.municipality) like '%' || v_city || '%')
      and (v_cuisine = '' or public.normalize_search_text(listing.category) like '%' || v_cuisine || '%'
        or public.normalize_search_text(listing.activity_detail) like '%' || v_cuisine || '%')
      and coalesce(p_price_range, 0) <= 0
      and coalesce(p_delivery_only, false) is false
      and coalesce(p_min_rating, 0) <= 0
      and (
        v_query = ''
        or public.normalize_search_text(listing.name) like '%' || v_query || '%'
        or public.normalize_search_text(listing.activity_detail) like '%' || v_query || '%'
        or public.normalize_search_text(listing.address) like '%' || v_query || '%'
        or public.normalize_search_text(listing.city) like '%' || v_query || '%'
        or public.normalize_search_text(listing.municipality) like '%' || v_query || '%'
      )
  ),
  combined as (
    select * from core
    union all
    select * from registry
  )
  select combined.*
  from combined
  order by
    case when v_sort_by = 'note' and v_sort_direction = 'desc' then combined.rating end desc nulls last,
    case when v_sort_by = 'note' and v_sort_direction = 'asc' then combined.rating end asc nulls last,
    case when v_sort_by = 'promotion' and v_sort_direction = 'desc' then combined.promotion_score end desc nulls last,
    case when v_sort_by = 'promotion' and v_sort_direction = 'asc' then combined.promotion_score end asc nulls last,
    case when v_sort_by = 'prix' and v_sort_direction = 'asc' then combined.price_range end asc nulls last,
    case when v_sort_by = 'prix' and v_sort_direction = 'desc' then combined.price_range end desc nulls last,
    case when v_sort_by = 'popularite' and v_sort_direction = 'desc'
      then (combined.review_count + combined.monthly_reservations * 4 + combined.monthly_orders * 3) end desc,
    case when v_sort_by = 'popularite' and v_sort_direction = 'asc'
      then (combined.review_count + combined.monthly_reservations * 4 + combined.monthly_orders * 3) end asc,
    case when v_sort_by = 'nouveaux' and v_sort_direction = 'desc' then combined.created_at end desc,
    case when v_sort_by = 'nouveaux' and v_sort_direction = 'asc' then combined.created_at end asc,
    case when v_sort_by = 'plus_reserves_mois' and v_sort_direction = 'desc' then combined.monthly_reservations end desc,
    case when v_sort_by = 'plus_reserves_mois' and v_sort_direction = 'asc' then combined.monthly_reservations end asc,
    case when v_sort_by = 'mieux_notes_mois' and v_sort_direction = 'desc' then combined.rating end desc,
    case when v_sort_by = 'mieux_notes_mois' and v_sort_direction = 'asc' then combined.rating end asc,
    case when v_sort_by = 'pertinence' and v_sort_direction = 'desc' then combined.relevance_score end desc,
    case when v_sort_by = 'pertinence' and v_sort_direction = 'asc' then combined.relevance_score end asc,
    case when combined.listing_kind = 'restaurant' then 0 else 1 end asc,
    combined.rating desc nulls last,
    combined.review_count desc,
    combined.name asc
  limit v_limit
  offset v_offset;
end;
$function$;

revoke all on function public.search_restaurant_discovery_catalog(
  text, text, text, integer, boolean, numeric, text, text, integer, integer
) from public;
grant execute on function public.search_restaurant_discovery_catalog(
  text, text, text, integer, boolean, numeric, text, text, integer, integer
) to anon, authenticated, service_role;

create or replace function public.sync_public_restaurant_listing_claim_state()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_listing_id uuid;
  v_restaurant_id uuid;
  v_affected integer := 0;
begin
  if new.requested_role <> 'restaurateur'::public.app_role then
    return new;
  end if;

  begin
    v_listing_id := nullif(new.metadata->>'public_listing_id', '')::uuid;
  exception when invalid_text_representation then
    raise exception 'public_listing_id_invalid' using errcode = '22023';
  end;

  if v_listing_id is null then
    return new;
  end if;

  if new.status in ('pending_review', 'needs_changes') then
    update public.public_restaurant_listings as listing
    set claim_status = 'claim_pending',
        claim_application_id = new.id,
        claim_requested_at = coalesce(listing.claim_requested_at, now()),
        updated_at = now()
    where listing.id = v_listing_id
      and listing.is_published is true
      and listing.claimed_restaurant_id is null
      and (
        listing.claim_status = 'unclaimed'
        or listing.claim_application_id = new.id
      );

    get diagnostics v_affected = row_count;
    if v_affected = 0 then
      raise exception 'public_listing_claim_unavailable' using errcode = '23505';
    end if;
  elsif new.status = 'approved' then
    begin
      v_restaurant_id := nullif(new.metadata->>'restaurant_id', '')::uuid;
    exception when invalid_text_representation then
      raise exception 'restaurant_id_invalid' using errcode = '22023';
    end;

    if v_restaurant_id is null then
      raise exception 'public_listing_claim_restaurant_missing' using errcode = '23514';
    end if;

    update public.public_restaurant_listings as listing
    set claim_status = 'claimed',
        claim_application_id = new.id,
        claimed_restaurant_id = v_restaurant_id,
        claimed_at = now(),
        updated_at = now()
    where listing.id = v_listing_id
      and listing.claim_application_id = new.id
      and listing.claimed_restaurant_id is null;

    get diagnostics v_affected = row_count;
    if v_affected = 0 then
      raise exception 'public_listing_claim_state_conflict' using errcode = '23505';
    end if;
  elsif new.status = 'rejected' then
    update public.public_restaurant_listings as listing
    set claim_status = 'unclaimed',
        claim_application_id = null,
        claim_requested_at = null,
        updated_at = now()
    where listing.id = v_listing_id
      and listing.claim_application_id = new.id
      and listing.claimed_restaurant_id is null;
  end if;

  return new;
end;
$function$;

drop trigger if exists sync_public_restaurant_listing_claim_state on public.signup_applications;
create trigger sync_public_restaurant_listing_claim_state
after insert or update of status, metadata on public.signup_applications
for each row execute function public.sync_public_restaurant_listing_claim_state();

-- Safe recovery draft: preserve only the public listing UUID in addition to the existing allow-list.
create or replace function public.capture_signup_application_draft()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_role text := lower(coalesce(new.raw_user_meta_data->>'signup_intent', ''));
  v_operation_id uuid;
  v_payload jsonb;
begin
  if v_role not in ('restaurateur', 'courier') then
    return new;
  end if;

  begin
    v_operation_id := (new.raw_user_meta_data->>'signup_operation_id')::uuid;
  exception when invalid_text_representation then
    raise exception using errcode = '22023', message = 'signup_operation_id_invalid';
  end;
  if v_operation_id is null then
    raise exception using errcode = '22023', message = 'signup_operation_id_required';
  end if;

  v_payload := jsonb_strip_nulls(jsonb_build_object(
    'full_name', new.raw_user_meta_data->>'full_name',
    'city', new.raw_user_meta_data->>'signup_city',
    'business_name', new.raw_user_meta_data->>'signup_business_name',
    'restaurant_name', new.raw_user_meta_data->>'signup_restaurant_name',
    'restaurant_description', new.raw_user_meta_data->>'signup_restaurant_description',
    'vehicle_type', new.raw_user_meta_data->>'signup_vehicle_type',
    'selected_subscription_plan_id', new.raw_user_meta_data->>'signup_subscription_plan_id',
    'selected_subscription_billing_period', new.raw_user_meta_data->>'signup_subscription_billing_period',
    'public_listing_id', new.raw_user_meta_data->>'signup_public_listing_id',
    'legal_acceptance_version', new.raw_user_meta_data->>'legal_acceptance_version',
    'legal_terms_accepted_at', new.raw_user_meta_data->>'legal_terms_accepted_at',
    'privacy_policy_accepted_at', new.raw_user_meta_data->>'privacy_policy_accepted_at'
  ));

  insert into public.signup_application_drafts (
    user_id, operation_id, requested_role, safe_payload, status, expires_at
  ) values (
    new.id, v_operation_id, v_role::public.app_role, v_payload,
    case when new.email_confirmed_at is null then 'awaiting_email' else 'ready' end,
    now() + interval '7 days'
  )
  on conflict (user_id, requested_role) do update
  set safe_payload = excluded.safe_payload,
      updated_at = now(),
      expires_at = greatest(public.signup_application_drafts.expires_at, excluded.expires_at)
  where public.signup_application_drafts.operation_id = excluded.operation_id
    and public.signup_application_drafts.status <> 'finalized';

  return new;
end;
$function$;
