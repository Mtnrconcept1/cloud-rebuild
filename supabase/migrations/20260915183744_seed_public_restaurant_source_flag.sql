INSERT INTO public.feature_flags (name, label, description, is_active)
VALUES ('public-restaurants-all-sources','Catalogue public : toutes les sources','Autorise toutes les sources restaurant éligibles. Désactivé, les lectures publiques sont limitées aux restaurants présents dans le catalogue TheFork vérifié.',true)
ON CONFLICT (name) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description, updated_at = now();;
