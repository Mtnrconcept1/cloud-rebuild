-- ONLY for a disposable local PostgreSQL database. Never run on an application database.
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE ROLE authenticator NOLOGIN;
CREATE SCHEMA auth; CREATE SCHEMA storage;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT nullif(current_setting('request.jwt.claims',true)::jsonb->>'sub','')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
 SELECT current_setting('request.jwt.claims',true)::jsonb->>'role' $$;
GRANT USAGE ON SCHEMA public,auth,storage TO anon,authenticated,service_role;
CREATE TYPE public.app_role AS ENUM('client','restaurateur','courier','commercial','admin');
CREATE TABLE public.user_roles(user_id uuid,role public.app_role);
CREATE FUNCTION public.has_role(p_uid uuid,p_role public.app_role) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_uid AND role=p_role) $$;
CREATE TABLE public.feature_flags(name text PRIMARY KEY,label text,description text,is_active boolean,updated_at timestamptz DEFAULT now());
CREATE TABLE public.profiles(id uuid PRIMARY KEY,full_name text);
CREATE TABLE public.restaurants(id uuid PRIMARY KEY,owner_id uuid,name text);
CREATE TABLE public.menu_items(id uuid PRIMARY KEY,restaurant_id uuid REFERENCES public.restaurants(id),name text);
CREATE TABLE public.orders(id uuid PRIMARY KEY,user_id uuid);
CREATE TABLE storage.objects(id uuid PRIMARY KEY,bucket_id text,owner_id uuid);
CREATE FUNCTION public.admin_toggle_feature_flag(p_flag_name text,p_is_active boolean,p_reason text,p_preset_name text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 UPDATE public.feature_flags SET is_active=p_is_active WHERE name=p_flag_name;
END $$;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE POLICY role_read ON public.user_roles FOR SELECT USING(user_id=auth.uid());
CREATE POLICY flags_read ON public.feature_flags FOR SELECT USING(true);
CREATE POLICY profile_own ON public.profiles FOR ALL USING(id=auth.uid()) WITH CHECK(id=auth.uid());
CREATE POLICY restaurant_own ON public.restaurants FOR ALL USING(owner_id=auth.uid()) WITH CHECK(owner_id=auth.uid());
CREATE POLICY menu_own ON public.menu_items FOR ALL USING(EXISTS(SELECT 1 FROM public.restaurants WHERE id=restaurant_id AND owner_id=auth.uid())) WITH CHECK(EXISTS(SELECT 1 FROM public.restaurants WHERE id=restaurant_id AND owner_id=auth.uid()));
CREATE POLICY orders_own ON public.orders FOR ALL USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
CREATE POLICY storage_own ON storage.objects FOR ALL USING(owner_id=auth.uid()) WITH CHECK(owner_id=auth.uid());
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public,storage TO anon,authenticated,service_role;
INSERT INTO public.user_roles VALUES
 ('00000000-0000-0000-0000-000000000001','admin'),
 ('00000000-0000-0000-0000-000000000002','client'),
 ('00000000-0000-0000-0000-000000000003','restaurateur');
INSERT INTO public.orders VALUES('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002');
INSERT INTO public.restaurants VALUES
 ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','Own'),
 ('20000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000004','Other');
INSERT INTO public.menu_items VALUES('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Before');
INSERT INTO storage.objects VALUES
 ('40000000-0000-0000-0000-000000000001','private-client','00000000-0000-0000-0000-000000000002'),
 ('40000000-0000-0000-0000-000000000002','verification-documents','00000000-0000-0000-0000-000000000002');
