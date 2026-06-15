INSERT INTO public.feature_flags (name, label, description, is_active)
VALUES (
  'admin_dashboard_ai_chat',
  'IA chat dashboard admin',
  'Active le chat IA admin privilegie avec analyse des donnees et logs du back-office.',
  true
)
ON CONFLICT (name) DO UPDATE
SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  updated_at = now();
