-- Add configurable customer-bookable slots to chef_table_drops.
-- Stored as a JSONB array of ISO 8601 datetime strings, e.g.:
--   ["2026-04-26T19:00:00+00:00", "2026-04-26T20:00:00+00:00"]
-- When empty, the legacy single drop_time is used as the only available slot
-- (backward compatible with drops created before this column existed).

ALTER TABLE public.chef_table_drops
  ADD COLUMN IF NOT EXISTS available_slots JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.chef_table_drops.available_slots IS
  'Array of ISO 8601 datetime strings representing the slots a customer can book. Empty array falls back to drop_time.';

-- Defensive: ensure we only ever store JSON arrays here.
ALTER TABLE public.chef_table_drops
  DROP CONSTRAINT IF EXISTS chef_table_drops_available_slots_is_array;
ALTER TABLE public.chef_table_drops
  ADD CONSTRAINT chef_table_drops_available_slots_is_array
  CHECK (jsonb_typeof(available_slots) = 'array');
