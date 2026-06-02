INSERT INTO public.feature_flags (name, label, description, is_active)
VALUES
  ('dashboard-ai', 'Dashboard: Agent IA TOK', 'Expose le nouvel agent IA restaurateur unifie pour ventes, menus, photos, campagnes et avis.', true),
  ('admin-ai-operations', 'Admin: Operations IA', 'Expose le centre admin de supervision IA securite, performance, couts et incidents.', true)
ON CONFLICT (name) DO UPDATE
SET label = EXCLUDED.label,
    description = EXCLUDED.description,
    is_active = EXCLUDED.is_active,
    updated_at = now();

NOTIFY pgrst, 'reload schema';
