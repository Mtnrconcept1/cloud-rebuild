CREATE TABLE IF NOT EXISTS public.reservation_table_layout_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_table_id uuid NOT NULL REFERENCES public.reservation_tables(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.restaurant_branches(id) ON DELETE CASCADE,
  service_date date NOT NULL,
  layout jsonb NOT NULL,
  created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reservation_table_layout_overrides_unique
  ON public.reservation_table_layout_overrides(reservation_table_id, service_date);

CREATE INDEX IF NOT EXISTS idx_reservation_table_layout_overrides_branch_date
  ON public.reservation_table_layout_overrides(branch_id, service_date);

ALTER TABLE public.reservation_table_layout_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Require auth for reservation_table_layout_overrides" ON public.reservation_table_layout_overrides;
CREATE POLICY "Require auth for reservation_table_layout_overrides"
  ON public.reservation_table_layout_overrides
  FOR ALL
  USING (auth.role() = 'authenticated');

GRANT SELECT ON public.reservation_table_layout_overrides TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reservation_table_layout_overrides TO authenticated;
