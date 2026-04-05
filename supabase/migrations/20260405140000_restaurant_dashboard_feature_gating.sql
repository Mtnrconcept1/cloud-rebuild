-- Per-restaurant dashboard feature gating.
-- Stores which dashboard features are disabled for a specific restaurant.
-- Admin can override; pack purchase auto-configures defaults.

ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS disabled_dashboard_features text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.restaurants.disabled_dashboard_features
  IS 'Dashboard feature keys that are disabled for this restaurant (e.g. dashboard-photos, dashboard-campagnes). Admin-managed, auto-set on pack purchase.';
