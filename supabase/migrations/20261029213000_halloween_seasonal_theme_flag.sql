-- Seasonal visual theme: public surfaces only. The flag is opt-in and defaults off.
INSERT INTO public.feature_flags (name, label, description, is_active)
VALUES (
  'seasonal-halloween-2026',
  'Thème saisonnier : Halloween',
  'Habille les surfaces publiques TOK pour Halloween sans modifier les parcours de commande, de réservation ou de paiement.',
  false
)
ON CONFLICT (name) DO UPDATE
SET
  label = EXCLUDED.label,
  description = EXCLUDED.description;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.feature_flags
    WHERE name = 'seasonal-halloween-2026'
  ) THEN
    RAISE EXCEPTION 'Halloween seasonal theme flag was not created';
  END IF;
END;
$$;
