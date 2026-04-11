-- Enable RLS on reservation/booking/guest tables flagged by Supabase linter.
-- Strategy:
--  * Tables with a restaurant_id column → restaurant owner has full access; public read where it makes sense.
--  * Guest tables (guest_*) → restaurant owner full access via guest_profiles.restaurant_id linkage.
--  * Always force RLS even if no policies match (deny-by-default) so the linter passes.

DO $$
DECLARE
    t text;
    restaurant_scoped text[] := ARRAY[
        'service_shifts',
        'table_zones',
        'table_combinations',
        'booking_policies',
        'booking_rules',
        'guest_profiles',
        'guest_segments',
        'reservation_holds',
        'waitlist_entries',
        'reservation_events'
    ];
    guest_child_tables text[] := ARRAY[
        'guest_tags',
        'guest_notes',
        'guest_preferences',
        'guest_incidents'
    ];
BEGIN
    -- Enable RLS on every flagged table (safe no-op if already enabled).
    FOREACH t IN ARRAY (restaurant_scoped || guest_child_tables) LOOP
        IF EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = t
        ) THEN
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        END IF;
    END LOOP;

    -- Restaurant-owner full access on tables that carry restaurant_id directly.
    FOREACH t IN ARRAY restaurant_scoped LOOP
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = t AND column_name = 'restaurant_id'
        ) THEN
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_owner_all', t);
            EXECUTE format(
                'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (
                    EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = %I.restaurant_id AND r.owner_id = auth.uid())
                ) WITH CHECK (
                    EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = %I.restaurant_id AND r.owner_id = auth.uid())
                )',
                t || '_owner_all', t, t, t
            );
        END IF;
    END LOOP;

    -- Guest child tables → access if you own the parent guest_profiles row's restaurant.
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'guest_profiles'
    ) THEN
        FOREACH t IN ARRAY guest_child_tables LOOP
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = t AND column_name = 'guest_id'
            ) THEN
                EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_owner_all', t);
                EXECUTE format(
                    'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (
                        EXISTS (
                            SELECT 1 FROM public.guest_profiles gp
                            JOIN public.restaurants r ON r.id = gp.restaurant_id
                            WHERE gp.id = %I.guest_id AND r.owner_id = auth.uid()
                        )
                    ) WITH CHECK (
                        EXISTS (
                            SELECT 1 FROM public.guest_profiles gp
                            JOIN public.restaurants r ON r.id = gp.restaurant_id
                            WHERE gp.id = %I.guest_id AND r.owner_id = auth.uid()
                        )
                    )',
                    t || '_owner_all', t, t, t
                );
            END IF;
        END LOOP;
    END IF;
END $$;
