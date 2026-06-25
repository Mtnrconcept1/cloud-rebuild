-- Allow up to three secure client slot-machine attempts per Swiss day.
-- The browser still never chooses symbols or credits points: the Edge Function
-- generates the outcome, then this RPC atomically assigns the next attempt.

ALTER TABLE public.daily_slot_spins
  ADD COLUMN IF NOT EXISTS attempt_number integer NOT NULL DEFAULT 1;

ALTER TABLE public.daily_slot_spins
  DROP CONSTRAINT IF EXISTS daily_slot_spins_once_per_user_day;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.daily_slot_spins'::regclass
      AND conname = 'daily_slot_spins_attempt_number_range'
  ) THEN
    ALTER TABLE public.daily_slot_spins
      ADD CONSTRAINT daily_slot_spins_attempt_number_range
      CHECK (attempt_number BETWEEN 1 AND 3);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.daily_slot_spins'::regclass
      AND conname = 'daily_slot_spins_once_per_user_day_attempt'
  ) THEN
    ALTER TABLE public.daily_slot_spins
      ADD CONSTRAINT daily_slot_spins_once_per_user_day_attempt
      UNIQUE (user_id, spin_date, attempt_number);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_daily_slot_spins_user_date_attempt
  ON public.daily_slot_spins (user_id, spin_date, attempt_number DESC);

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
  v_attempt_count integer;
  v_attempt_number integer;
  v_max_attempts integer := 3;
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

  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text), hashtext(p_spin_date::text));

  SELECT count(*)
  INTO v_attempt_count
  FROM public.daily_slot_spins
  WHERE user_id = p_user_id
    AND spin_date = p_spin_date;

  IF v_attempt_count >= v_max_attempts THEN
    SELECT *
    INTO v_spin
    FROM public.daily_slot_spins
    WHERE user_id = p_user_id
      AND spin_date = p_spin_date
    ORDER BY attempt_number DESC, created_at DESC
    LIMIT 1;

    SELECT COALESCE(loyalty_points, 0)
    INTO v_total_points
    FROM public.profiles
    WHERE user_id = p_user_id;

    RETURN jsonb_build_object(
      'ok', true,
      'already_claimed', true,
      'attempts_used', v_attempt_count,
      'attempts_remaining', 0,
      'max_attempts', v_max_attempts,
      'spin', jsonb_build_object(
        'id', v_spin.id,
        'spin_date', v_spin.spin_date,
        'attempt_number', v_spin.attempt_number,
        'symbols', v_spin.symbols,
        'reward_points', v_spin.reward_points,
        'reward_label', v_spin.reward_label,
        'created_at', v_spin.created_at
      ),
      'total_loyalty_points', COALESCE(v_total_points, 0)
    );
  END IF;

  v_attempt_number := v_attempt_count + 1;

  INSERT INTO public.daily_slot_spins (
    user_id,
    spin_date,
    attempt_number,
    symbols,
    reward_points,
    reward_label,
    rng_nonce,
    metadata
  )
  VALUES (
    p_user_id,
    p_spin_date,
    v_attempt_number,
    p_symbols,
    p_reward_points,
    trim(p_reward_label),
    trim(p_rng_nonce),
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'attempt_number', v_attempt_number,
      'max_attempts', v_max_attempts
    )
  )
  RETURNING * INTO v_spin;

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
      'attempt_number', v_attempt_number,
      'max_attempts', v_max_attempts,
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
    'attempts_used', v_attempt_number,
    'attempts_remaining', GREATEST(v_max_attempts - v_attempt_number, 0),
    'max_attempts', v_max_attempts,
    'spin', jsonb_build_object(
      'id', v_spin.id,
      'spin_date', v_spin.spin_date,
      'attempt_number', v_spin.attempt_number,
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
