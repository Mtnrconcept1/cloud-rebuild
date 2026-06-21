-- Restaurant partner contract signatures.
-- Non destructive: stores digitally accepted contract versions per restaurant.

CREATE TABLE IF NOT EXISTS public.restaurant_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  contract_version text NOT NULL,
  contract_title text NOT NULL DEFAULT 'Contrat de partenariat restaurateur TOK',
  signer_name text NOT NULL CHECK (char_length(btrim(signer_name)) >= 3),
  signed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  signed_at timestamptz NOT NULL DEFAULT now(),
  accepted_authority boolean NOT NULL DEFAULT false CHECK (accepted_authority IS TRUE),
  accepted_contract boolean NOT NULL DEFAULT false CHECK (accepted_contract IS TRUE),
  signature_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'signed' CHECK (status IN ('signed', 'superseded', 'voided')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT restaurant_contracts_one_signed_version UNIQUE (restaurant_id, contract_version, status)
);

ALTER TABLE public.restaurant_contracts ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_restaurant_contracts_restaurant_signed_at
  ON public.restaurant_contracts (restaurant_id, signed_at DESC);

CREATE INDEX IF NOT EXISTS idx_restaurant_contracts_signed_by
  ON public.restaurant_contracts (signed_by)
  WHERE signed_by IS NOT NULL;

CREATE OR REPLACE FUNCTION public.touch_restaurant_contracts_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_restaurant_contracts_updated_at ON public.restaurant_contracts;
CREATE TRIGGER touch_restaurant_contracts_updated_at
BEFORE UPDATE ON public.restaurant_contracts
FOR EACH ROW
EXECUTE FUNCTION public.touch_restaurant_contracts_updated_at();

DROP POLICY IF EXISTS "restaurant_contracts_admin_all" ON public.restaurant_contracts;
CREATE POLICY "restaurant_contracts_admin_all"
  ON public.restaurant_contracts
  FOR ALL
  TO authenticated
  USING (public.auth_is_admin())
  WITH CHECK (public.auth_is_admin());

DROP POLICY IF EXISTS "restaurant_contracts_owner_read" ON public.restaurant_contracts;
CREATE POLICY "restaurant_contracts_owner_read"
  ON public.restaurant_contracts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.restaurants r
      WHERE r.id = restaurant_contracts.restaurant_id
        AND r.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "restaurant_contracts_owner_insert_signature" ON public.restaurant_contracts;
CREATE POLICY "restaurant_contracts_owner_insert_signature"
  ON public.restaurant_contracts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    signed_by = auth.uid()
    AND accepted_authority IS TRUE
    AND accepted_contract IS TRUE
    AND status = 'signed'
    AND EXISTS (
      SELECT 1
      FROM public.restaurants r
      WHERE r.id = restaurant_contracts.restaurant_id
        AND r.owner_id = auth.uid()
    )
  );

REVOKE ALL ON public.restaurant_contracts FROM PUBLIC;
REVOKE ALL ON public.restaurant_contracts FROM anon;
GRANT SELECT, INSERT ON public.restaurant_contracts TO authenticated;
GRANT ALL ON public.restaurant_contracts TO service_role;

COMMENT ON TABLE public.restaurant_contracts IS 'Digitally signed restaurateur partnership contracts, visible in admin and restaurant dashboards.';
COMMENT ON COLUMN public.restaurant_contracts.signature_metadata IS 'Non-sensitive proof metadata such as user agent and signing surface; never store secrets here.';
