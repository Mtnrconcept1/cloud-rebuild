-- Global, audited kill switches for the two client game surfaces.
-- Existing admin feature-flag RPCs own writes and audit every state change.
INSERT INTO public.feature_flags (name, label, description, is_active)
VALUES
  (
    'plinko-welcome',
    'Plinko de bienvenue',
    'Active le Plinko gratuit proposé aux visiteurs et la réclamation des gains.',
    true
  ),
  (
    'daily-slot-machine',
    'Machine à sous quotidienne',
    'Active la machine à sous Miamz et ses trois essais quotidiens pour les clients éligibles.',
    true
  )
ON CONFLICT (name) DO UPDATE
SET
  label = EXCLUDED.label,
  description = EXCLUDED.description;

NOTIFY pgrst, 'reload schema';
