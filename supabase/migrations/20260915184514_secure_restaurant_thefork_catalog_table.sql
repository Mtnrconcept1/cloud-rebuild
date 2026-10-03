ALTER TABLE public.restaurant_thefork_catalog ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.restaurant_thefork_catalog FROM PUBLIC, anon, authenticated;;
