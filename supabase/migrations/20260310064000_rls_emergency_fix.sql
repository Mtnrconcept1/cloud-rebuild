-- EMERGENCY FIX: Restore RLS Transparency for core navigation and catalog
-- This migration ensures that role checks and public catalog viewing are unblocked.

--------------------------------------------------------------------------------
-- 1. AUTH & ROLES (Unblock Dashboard)
--------------------------------------------------------------------------------
-- user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own role" ON public.user_roles;
DROP POLICY IF EXISTS "public_read_user_roles" ON public.user_roles;
CREATE POLICY "user_roles_self_select" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "user_roles_admin_all" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- profiles & user_profiles (Universal access for self)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own profile" ON public.profiles;
CREATE POLICY "profiles_self_all" ON public.profiles FOR ALL TO authenticated USING (auth.uid() = user_id);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own user_profiles" ON public.user_profiles;
CREATE POLICY "user_profiles_self_all" ON public.user_profiles FOR ALL TO authenticated USING (auth.uid() = user_id);

--------------------------------------------------------------------------------
-- 2. RESTAURANTS & STAFF (Unblock Dashboard + Discovery)
--------------------------------------------------------------------------------
-- restaurants
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read for restaurants" ON public.restaurants;
DROP POLICY IF EXISTS "Anyone can view active restaurants" ON public.restaurants;
-- Public select
CREATE POLICY "restaurants_public_select" ON public.restaurants FOR SELECT USING (true);
-- Owner management
DROP POLICY IF EXISTS "owners_manage_restaurants" ON public.restaurants;
CREATE POLICY "restaurants_owner_all" ON public.restaurants FOR ALL TO authenticated USING (auth.uid() = owner_id);

-- restaurant_staff
ALTER TABLE public.restaurant_staff ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can see their own entry" ON public.restaurant_staff;
DROP POLICY IF EXISTS "restaurant_staff_manage" ON public.restaurant_staff;
CREATE POLICY "restaurant_staff_all" ON public.restaurant_staff FOR ALL TO authenticated USING (
    auth.uid() = user_id OR 
    EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = restaurant_id AND r.owner_id = auth.uid())
);

--------------------------------------------------------------------------------
-- 3. ADDITIONAL DISCOVERY (Ensure Discovery is clear)
--------------------------------------------------------------------------------
-- categories
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read for categories" ON public.categories;
CREATE POLICY "categories_public_select" ON public.categories FOR SELECT USING (true);

-- cuisines
ALTER TABLE public.cuisines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read for cuisines" ON public.cuisines;
CREATE POLICY "cuisines_public_select" ON public.cuisines FOR SELECT USING (true);

--------------------------------------------------------------------------------
-- 4. REALTIME & CACHE
--------------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
