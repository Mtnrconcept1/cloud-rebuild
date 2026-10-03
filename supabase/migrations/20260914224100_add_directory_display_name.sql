-- A separate display column: the legal name stays in `name` (it is what the
-- registry, the dedupe keys and the claim flow match on), while the client
-- renders `directory_display_name`. Keeping them apart means a bad cleanup can
-- be recomputed without ever having destroyed the source value.
alter table public.restaurants
  add column if not exists directory_display_name text;

comment on column public.restaurants.directory_display_name is
  'Public-facing name for directory listings: legal suffix stripped, SEO tail removed, ALL-CAPS title-cased. Falls back to name when null.';;
