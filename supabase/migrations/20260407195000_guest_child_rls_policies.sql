-- Follow-up to 20260407193000: add owner policies on guest_* child tables
-- and stripe_webhook_events. The earlier migration enabled RLS but the
-- column-name guess (guest_id) didn't match every schema, so policies
-- were skipped. This version probes multiple plausible FK columns.

DO $$
DECLARE
    t text;
    fk_col text;
    candidate text;
    candidates text[] := ARRAY['guest_id', 'guest_profile_id', 'profile_id'];
    guest_child_tables text[] := ARRAY[
        'guest_tags',
        'guest_notes',
        'guest_preferences',
        'guest_incidents'
    ];
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'guest_profiles'
    ) THEN
        RETURN;
    END IF;

    FOREACH t IN ARRAY guest_child_tables LOOP
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = t
        ) THEN
            CONTINUE;
        END IF;

        fk_col := NULL;
        FOREACH candidate IN ARRAY candidates LOOP
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = t AND column_name = candidate
            ) THEN
                fk_col := candidate;
                EXIT;
            END IF;
        END LOOP;

        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_owner_all', t);

        IF fk_col IS NOT NULL THEN
            EXECUTE format(
                'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (
                    EXISTS (
                        SELECT 1 FROM public.guest_profiles gp
                        JOIN public.restaurants r ON r.id = gp.restaurant_id
                        WHERE gp.id = %I.%I AND r.owner_id = auth.uid()
                    )
                ) WITH CHECK (
                    EXISTS (
                        SELECT 1 FROM public.guest_profiles gp
                        JOIN public.restaurants r ON r.id = gp.restaurant_id
                        WHERE gp.id = %I.%I AND r.owner_id = auth.uid()
                    )
                )',
                t || '_owner_all', t, t, fk_col, t, fk_col
            );
        ELSIF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = t AND column_name = 'restaurant_id'
        ) THEN
            -- Fallback: row carries restaurant_id directly.
            EXECUTE format(
                'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (
                    EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = %I.restaurant_id AND r.owner_id = auth.uid())
                ) WITH CHECK (
                    EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = %I.restaurant_id AND r.owner_id = auth.uid())
                )',
                t || '_owner_all', t, t, t
            );
        ELSE
            -- Last resort: deny-all to everyone except service_role.
            EXECUTE format(
                'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (false) WITH CHECK (false)',
                t || '_deny_all', t
            );
        END IF;
    END LOOP;
END $$;

-- stripe_webhook_events: only the webhook (service_role) should ever touch it.
-- Add an explicit deny-all policy for client roles so the linter is happy
-- while keeping the table writeable by service_role (which bypasses RLS).
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'stripe_webhook_events'
    ) THEN
        EXECUTE 'ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY';
        EXECUTE 'DROP POLICY IF EXISTS stripe_webhook_events_deny_all ON public.stripe_webhook_events';
        EXECUTE 'CREATE POLICY stripe_webhook_events_deny_all ON public.stripe_webhook_events FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)';
    END IF;
END $$;
