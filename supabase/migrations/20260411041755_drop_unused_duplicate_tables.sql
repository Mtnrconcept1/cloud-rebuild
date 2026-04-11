-- Drop unused duplicate tables
-- See implementation_plan.md for context

-- Remove any views or functions depending on them using CASCADE
DROP TABLE IF EXISTS public.user_profiles CASCADE;
DROP TABLE IF EXISTS public.user_notification_settings CASCADE;
DROP TABLE IF EXISTS public.invoices CASCADE;
