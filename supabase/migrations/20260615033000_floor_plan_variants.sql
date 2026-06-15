-- Saved floor-plan variants per restaurant branch.
-- Variants let a restaurateur preserve the current room layout, import an AI
-- layout from an image as a separate draft, and switch between saved plans
-- without overwriting the active reservation_tables template until they save.

CREATE TABLE IF NOT EXISTS public.floor_plan_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.restaurant_branches(id) ON DELETE CASCADE,
  name text NOT NULL,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'ai-image', 'ai-generated')),
  snapshot jsonb NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_floor_plan_variants_branch_updated
  ON public.floor_plan_variants(branch_id, updated_at DESC);

CREATE OR REPLACE FUNCTION public.auth_can_manage_floor_plan_variant(p_branch_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1
      FROM public.restaurant_branches rb
      JOIN public.restaurants r ON r.id = rb.restaurant_id
      WHERE rb.id = p_branch_id
        AND r.owner_id = auth.uid()
    ),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.set_floor_plan_variants_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_floor_plan_variants_updated_at ON public.floor_plan_variants;
CREATE TRIGGER set_floor_plan_variants_updated_at
BEFORE UPDATE ON public.floor_plan_variants
FOR EACH ROW
EXECUTE FUNCTION public.set_floor_plan_variants_updated_at();

ALTER TABLE public.floor_plan_variants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "floor_plan_variants_owner_admin_select" ON public.floor_plan_variants;
DROP POLICY IF EXISTS "floor_plan_variants_owner_admin_insert" ON public.floor_plan_variants;
DROP POLICY IF EXISTS "floor_plan_variants_owner_admin_update" ON public.floor_plan_variants;
DROP POLICY IF EXISTS "floor_plan_variants_owner_admin_delete" ON public.floor_plan_variants;

CREATE POLICY "floor_plan_variants_owner_admin_select"
  ON public.floor_plan_variants
  FOR SELECT
  TO authenticated
  USING (public.auth_can_manage_floor_plan_variant(branch_id));

CREATE POLICY "floor_plan_variants_owner_admin_insert"
  ON public.floor_plan_variants
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.auth_can_manage_floor_plan_variant(branch_id)
    AND EXISTS (
      SELECT 1
      FROM public.restaurant_branches rb
      WHERE rb.id = branch_id
        AND rb.restaurant_id = floor_plan_variants.restaurant_id
    )
  );

CREATE POLICY "floor_plan_variants_owner_admin_update"
  ON public.floor_plan_variants
  FOR UPDATE
  TO authenticated
  USING (public.auth_can_manage_floor_plan_variant(branch_id))
  WITH CHECK (
    public.auth_can_manage_floor_plan_variant(branch_id)
    AND EXISTS (
      SELECT 1
      FROM public.restaurant_branches rb
      WHERE rb.id = branch_id
        AND rb.restaurant_id = floor_plan_variants.restaurant_id
    )
  );

CREATE POLICY "floor_plan_variants_owner_admin_delete"
  ON public.floor_plan_variants
  FOR DELETE
  TO authenticated
  USING (public.auth_can_manage_floor_plan_variant(branch_id));

REVOKE ALL ON public.floor_plan_variants FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.floor_plan_variants TO authenticated;

REVOKE ALL ON FUNCTION public.auth_can_manage_floor_plan_variant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_can_manage_floor_plan_variant(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
