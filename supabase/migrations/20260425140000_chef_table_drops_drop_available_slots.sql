-- Revert the previous available_slots column.
-- Customer-facing time slots are now derived from the restaurant's opening_hours
-- (same source as regular reservations), so the admin no longer needs to pre-define them.

ALTER TABLE public.chef_table_drops
  DROP CONSTRAINT IF EXISTS chef_table_drops_available_slots_is_array;

ALTER TABLE public.chef_table_drops
  DROP COLUMN IF EXISTS available_slots;
