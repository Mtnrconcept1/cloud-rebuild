-- Pin search_path = public on functions flagged by Supabase security advisor
-- (lint 0011_function_search_path_mutable). Mutable search_path lets an attacker
-- shadow built-in functions/tables via temp schemas; this hardening matters for
-- SECURITY DEFINER paths in particular.

ALTER FUNCTION public.tg_reservations_set_confirmed_at() SET search_path = public;
ALTER FUNCTION public.trigger_refresh_kpis() SET search_path = public;
ALTER FUNCTION public.is_truthy_text(text) SET search_path = public;
ALTER FUNCTION public.is_special_paid_reservation_locked(text, text, numeric, jsonb) SET search_path = public;
ALTER FUNCTION public.is_special_paid_order_locked(uuid, text, jsonb) SET search_path = public;
ALTER FUNCTION public.tg_guard_locked_reservation_status() SET search_path = public;
ALTER FUNCTION public.tg_guard_locked_order_status() SET search_path = public;
ALTER FUNCTION public.generate_restaurant_payout_invoice(uuid, date) SET search_path = public;
ALTER FUNCTION public.generate_restaurant_payout_invoice(uuid, text) SET search_path = public;
