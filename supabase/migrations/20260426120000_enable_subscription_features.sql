-- Ensure subscription experiences are available in all environments
INSERT INTO public.feature_flags (name, label, description, is_active)
VALUES
  ('abonnement', 'Abonnement', 'Active la page d''abonnement repas recurrents.', true),
  ('tok-one', 'Tok One', 'Active la page d''abonnement premium Tok One.', true)
ON CONFLICT (name)
DO UPDATE SET
  is_active = true,
  updated_at = now();
