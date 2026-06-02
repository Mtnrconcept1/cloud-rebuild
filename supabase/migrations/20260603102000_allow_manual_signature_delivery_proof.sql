DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'proof_of_delivery_verification_method_check'
  ) THEN
    ALTER TABLE public.proof_of_delivery
      DROP CONSTRAINT proof_of_delivery_verification_method_check;
  END IF;

  ALTER TABLE public.proof_of_delivery
    ADD CONSTRAINT proof_of_delivery_verification_method_check
    CHECK (verification_method IN ('qr', 'manual_code', 'manual_signature'));
END $$;

NOTIFY pgrst, 'reload schema';
