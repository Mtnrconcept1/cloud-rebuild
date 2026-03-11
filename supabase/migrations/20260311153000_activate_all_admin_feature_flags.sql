-- Ensure all known admin-controlled feature flags exist and are active.

INSERT INTO public.feature_flags (name, label, description, is_active)
VALUES
  ('creneaux-garantis', 'Creneaux garantis', 'Livraison ponctuelle ou remboursee', true),
  ('flex-prix-bas', 'Offres', 'Fenetre flexible, prix reduit', true),
  ('match-groupes', 'Match groupes', 'Commandez ensemble, payez moins', true),
  ('multi-stop', 'Multi-stop', 'Un trajet, plusieurs adresses', true),
  ('multi-restaurant', 'Multi-restos', 'Plats de differents restos', true),
  ('chefs-table', 'Chef''s Table', 'Plats off-menu exclusifs', true),
  ('zero-attente', 'Zero attente', 'Precommande synchronisee', true),
  ('garantie-qualite', 'Garantie qualite', 'Chaud garanti ou rembourse', true),
  ('budget-auto', 'Budget auto', 'Menus optimises par objectifs', true),
  ('abonnement', 'Abonnement', 'Repas recurrents planifies', true)
ON CONFLICT (name) DO UPDATE
SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  is_active = true;
