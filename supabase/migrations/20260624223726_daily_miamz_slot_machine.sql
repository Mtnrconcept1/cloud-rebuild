-- Daily client slot machine for Miamz rewards.
-- The browser never decides the result: the Edge Function generates the symbols
-- and this RPC records the spin plus loyalty credit in one database transaction.

ALTER TABLE public.loyalty_transactions
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.daily_slot_spins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  spin_date date NOT NULL,
  symbols text[] NOT NULL,
  reward_points integer NOT NULL,
  reward_label text NOT NULL,
  rng_nonce text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT daily_slot_spins_once_per_user_day UNIQUE (user_id, spin_date),
  CONSTRAINT daily_slot_spins_three_symbols CHECK (cardinality(symbols) = 3),
  CONSTRAINT daily_slot_spins_symbols_allowed CHECK (
    symbols <@ ARRAY['tok_suisse', 'fork', 'chef', 'courier', 'logo', 'miamz']::text[]
  ),
  CONSTRAINT daily_slot_spins_reward_points_allowed CHECK (
    reward_points IN (3, 4, 6, 8, 10, 12, 16, 18, 20, 24, 25, 30, 40, 45, 60, 100)
  )
);

CREATE INDEX IF NOT EXISTS idx_daily_slot_spins_user_created
  ON public.daily_slot_spins (user_id, created_at DESC);

ALTER TABLE public.daily_slot_spins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clients can read own daily slot spins" ON public.daily_slot_spins;
CREATE POLICY "Clients can read own daily slot spins"
  ON public.daily_slot_spins
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

REVOKE ALL ON TABLE public.daily_slot_spins FROM anon, authenticated;
GRANT SELECT ON TABLE public.daily_slot_spins TO authenticated;
GRANT ALL ON TABLE public.daily_slot_spins TO service_role;

CREATE OR REPLACE FUNCTION public.record_daily_slot_spin(
  p_user_id uuid,
  p_spin_date date,
  p_symbols text[],
  p_reward_points integer,
  p_reward_label text,
  p_rng_nonce text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_spin public.daily_slot_spins%ROWTYPE;
  v_transaction_id uuid;
  v_total_points integer;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id_required';
  END IF;

  IF p_spin_date IS NULL THEN
    RAISE EXCEPTION 'spin_date_required';
  END IF;

  IF cardinality(p_symbols) <> 3 THEN
    RAISE EXCEPTION 'three_symbols_required';
  END IF;

  IF NOT (p_symbols <@ ARRAY['tok_suisse', 'fork', 'chef', 'courier', 'logo', 'miamz']::text[]) THEN
    RAISE EXCEPTION 'invalid_slot_symbol';
  END IF;

  IF p_reward_points NOT IN (3, 4, 6, 8, 10, 12, 16, 18, 20, 24, 25, 30, 40, 45, 60, 100) THEN
    RAISE EXCEPTION 'invalid_reward_points';
  END IF;

  IF NULLIF(trim(COALESCE(p_reward_label, '')), '') IS NULL THEN
    RAISE EXCEPTION 'reward_label_required';
  END IF;

  IF NULLIF(trim(COALESCE(p_rng_nonce, '')), '') IS NULL THEN
    RAISE EXCEPTION 'rng_nonce_required';
  END IF;

  INSERT INTO public.daily_slot_spins (
    user_id,
    spin_date,
    symbols,
    reward_points,
    reward_label,
    rng_nonce,
    metadata
  )
  VALUES (
    p_user_id,
    p_spin_date,
    p_symbols,
    p_reward_points,
    trim(p_reward_label),
    trim(p_rng_nonce),
    COALESCE(p_metadata, '{}'::jsonb)
  )
  ON CONFLICT (user_id, spin_date) DO NOTHING
  RETURNING * INTO v_spin;

  IF v_spin.id IS NULL THEN
    SELECT *
    INTO v_spin
    FROM public.daily_slot_spins
    WHERE user_id = p_user_id
      AND spin_date = p_spin_date
    LIMIT 1;

    SELECT COALESCE(loyalty_points, 0)
    INTO v_total_points
    FROM public.profiles
    WHERE user_id = p_user_id;

    RETURN jsonb_build_object(
      'ok', true,
      'already_claimed', true,
      'spin', jsonb_build_object(
        'id', v_spin.id,
        'spin_date', v_spin.spin_date,
        'symbols', v_spin.symbols,
        'reward_points', v_spin.reward_points,
        'reward_label', v_spin.reward_label,
        'created_at', v_spin.created_at
      ),
      'total_loyalty_points', COALESCE(v_total_points, 0)
    );
  END IF;

  INSERT INTO public.loyalty_transactions (
    user_id,
    amount,
    transaction_type,
    description,
    metadata
  )
  VALUES (
    p_user_id,
    p_reward_points,
    'daily_slot_spin',
    'Gain machine a sous TOK',
    jsonb_build_object(
      'slot_spin_id', v_spin.id,
      'spin_date', p_spin_date,
      'symbols', p_symbols,
      'reward_label', trim(p_reward_label)
    ) || COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_transaction_id;

  INSERT INTO public.profiles (user_id, loyalty_points)
  VALUES (p_user_id, p_reward_points)
  ON CONFLICT (user_id)
  DO UPDATE SET
    loyalty_points = COALESCE(public.profiles.loyalty_points, 0) + EXCLUDED.loyalty_points,
    updated_at = now();

  SELECT COALESCE(loyalty_points, 0)
  INTO v_total_points
  FROM public.profiles
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'already_claimed', false,
    'transaction_id', v_transaction_id,
    'spin', jsonb_build_object(
      'id', v_spin.id,
      'spin_date', v_spin.spin_date,
      'symbols', v_spin.symbols,
      'reward_points', v_spin.reward_points,
      'reward_label', v_spin.reward_label,
      'created_at', v_spin.created_at
    ),
    'total_loyalty_points', COALESCE(v_total_points, 0)
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.record_daily_slot_spin(uuid, date, text[], integer, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_daily_slot_spin(uuid, date, text[], integer, text, text, jsonb)
  TO service_role;

NOTIFY pgrst, 'reload schema';
