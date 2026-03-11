-- Seed default feature flags (idempotent via ON CONFLICT)
INSERT INTO public.feature_flags (name, label, description, is_active) VALUES
  ('creneaux-garantis', 'Créneaux garantis', 'Livraison ponctuelle ou remboursé', true),
  ('flex-prix-bas', 'Offres', 'Fenêtre flexible, prix réduit', true),
  ('match-groupes', 'Match groupes', 'Commandez ensemble, payez moins', true),
  ('multi-stop', 'Multi-stop', 'Un trajet, plusieurs adresses', true),
  ('multi-restaurant', 'Multi-restos', 'Plats de différents restos', true),
  ('chefs-table', 'Chef''s Table', 'Plats off-menu exclusifs', true),
  ('zero-attente', 'Zéro attente', 'Précommande synchronisée', true),
  ('garantie-qualite', 'Garantie qualité', 'Chaud garanti ou remboursé', true),
  ('budget-auto', 'Budget auto', 'Menus optimisés par objectifs', true),
  ('abonnement', 'Abonnement', 'Repas récurrents planifiés', true)
ON CONFLICT (name) DO NOTHING;
