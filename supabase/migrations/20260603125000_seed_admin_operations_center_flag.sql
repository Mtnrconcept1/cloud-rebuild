INSERT INTO public.feature_flags (name, label, description, is_active)
VALUES (
  'admin-operations-center',
  'Admin: Operations Center',
  'Expose la supervision admin des commandes, reservations, remboursements et dispatch.',
  true
)
ON CONFLICT (name) DO UPDATE
SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  updated_at = now();
