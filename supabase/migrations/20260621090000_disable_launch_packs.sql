-- Stop commercializing legacy restaurant launch packs.
-- Historical tables/records remain intact for audit, support and already-paid purchases.
UPDATE public.launch_packs
SET is_active = false,
    updated_at = now()
WHERE is_active = true;
