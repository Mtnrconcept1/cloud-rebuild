-- Anonymous welcome campaign. Personal claims stay private; payment records
-- and existing authenticated daily-slot rewards are deliberately independent.
INSERT INTO public.feature_flags (name, label, description, is_active)
VALUES ('plinko-welcome', 'Plinko de bienvenue', 'Jeu gratuit pour visiteurs : un gain à réclamer par e-mail et par campagne.', true)
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.plinko_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  campaign_id text NOT NULL DEFAULT 'welcome-v1' CHECK (campaign_id = 'welcome-v1'),
  attempts_remaining integer NOT NULL DEFAULT 1 CHECK (attempts_remaining BETWEEN 0 AND 1),
  plays_used integer NOT NULL DEFAULT 0 CHECK (plays_used >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.plinko_plays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.plinko_sessions(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  play_number integer NOT NULL CHECK (play_number > 0),
  outcome text NOT NULL CHECK (outcome IN ('free_meal', 'half_price', 'tok_one_month', 'replay', 'lost')),
  rng_nonce uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, request_id),
  UNIQUE (session_id, play_number),
  UNIQUE (id, session_id)
);

CREATE TABLE IF NOT EXISTS public.plinko_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  play_id uuid NOT NULL UNIQUE,
  session_id uuid NOT NULL,
  campaign_id text NOT NULL DEFAULT 'welcome-v1' CHECK (campaign_id = 'welcome-v1'),
  outcome text NOT NULL CHECK (outcome IN ('free_meal', 'half_price', 'tok_one_month')),
  status text NOT NULL DEFAULT 'pending_email' CHECK (status IN ('pending_email', 'pending_fulfillment', 'fulfilled', 'cancelled')),
  label text NOT NULL,
  email text CHECK (email IS NULL OR (email = lower(btrim(email)) AND char_length(email) <= 254 AND email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' AND email !~ '[[:cntrl:]]')),
  marketing_consent boolean NOT NULL DEFAULT false,
  marketing_consent_at timestamptz,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  fulfilled_at timestamptz,
  FOREIGN KEY (play_id, session_id) REFERENCES public.plinko_plays(id, session_id) ON DELETE CASCADE,
  UNIQUE (campaign_id, email),
  CHECK ((status = 'pending_email') = (email IS NULL)),
  CHECK ((email IS NOT NULL) = (claimed_at IS NOT NULL)),
  CHECK (marketing_consent = (marketing_consent_at IS NOT NULL)),
  CHECK ((status = 'fulfilled') = (fulfilled_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS plinko_rewards_session_idx ON public.plinko_rewards (session_id);
CREATE INDEX IF NOT EXISTS plinko_rewards_pending_idx ON public.plinko_rewards (created_at) WHERE status = 'pending_fulfillment';
CREATE INDEX IF NOT EXISTS plinko_sessions_expires_idx ON public.plinko_sessions (expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS email_queue_plinko_claim_once
  ON public.email_queue ((metadata->>'plinko_reward_id'), (metadata->>'plinko_audience'))
  WHERE metadata->>'kind' = 'plinko_prize_claim';

ALTER TABLE public.plinko_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plinko_plays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plinko_rewards ENABLE ROW LEVEL SECURITY;
-- The visitor proves possession of a 256-bit token to the Edge Function. There
-- are no direct anon/authenticated table reads, including email addresses.
REVOKE ALL ON TABLE public.plinko_sessions, public.plinko_plays, public.plinko_rewards FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.plinko_sessions, public.plinko_plays, public.plinko_rewards TO service_role;
COMMENT ON TABLE public.plinko_rewards IS 'Private visitor prizes; pending_fulfillment claims are handled by TOK support after verifying the supplied email. This ledger never activates billing subscriptions or creates public promo codes.';

CREATE OR REPLACE FUNCTION public.get_plinko_status(p_token_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_session public.plinko_sessions%ROWTYPE;
  v_play public.plinko_plays%ROWTYPE;
  v_reward public.plinko_rewards%ROWTYPE;
  v_enabled boolean;
BEGIN
  IF COALESCE((SELECT auth.jwt()->>'role'), '') <> 'service_role' THEN RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501'; END IF;
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'invalid_plinko_session' USING ERRCODE = '42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('plinko:' || p_token_hash, 0));
  SELECT * INTO v_session FROM public.plinko_sessions WHERE token_hash = p_token_hash AND expires_at > now();
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_plinko_session' USING ERRCODE = '42501'; END IF;
  SELECT COALESCE((SELECT is_active FROM public.feature_flags WHERE name = 'plinko-welcome'), false) INTO v_enabled;
  SELECT * INTO v_play FROM public.plinko_plays WHERE session_id = v_session.id ORDER BY play_number DESC LIMIT 1;
  SELECT * INTO v_reward FROM public.plinko_rewards WHERE session_id = v_session.id ORDER BY created_at DESC LIMIT 1;
  RETURN jsonb_build_object(
    'ok', true, 'enabled', v_enabled,
    'available', v_enabled AND v_session.attempts_remaining > 0,
    'canPlay', v_enabled AND v_session.attempts_remaining > 0,
    'attemptsRemaining', v_session.attempts_remaining, 'playsUsed', v_session.plays_used,
    'ruleVersion', 'welcome-v1', 'expiresAt', v_session.expires_at,
    'play', CASE WHEN v_play.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_play.id, 'requestId', v_play.request_id, 'outcome', v_play.outcome,
      'createdAt', v_play.created_at, 'rewardId', v_reward.id) END,
    'reward', CASE WHEN v_reward.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_reward.id, 'outcome', v_reward.outcome, 'label', v_reward.label,
      'status', v_reward.status, 'claimPath', '/contact', 'createdAt', v_reward.created_at,
      'claimInstructions', CASE WHEN v_reward.status = 'pending_email' THEN
        'Indiquez votre e-mail pour demander la remise de votre gain.' ELSE
        'Votre demande est enregistrée. L’équipe TOK vous contactera par e-mail pour vérifier votre adresse et organiser la remise du gain. Aucun abonnement ni code de réduction n’est activé automatiquement.' END) END
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_plinko_session(p_token_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
BEGIN
  IF COALESCE((SELECT auth.jwt()->>'role'), '') <> 'service_role' THEN RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501'; END IF;
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'invalid_plinko_session' USING ERRCODE = '22023'; END IF;
  IF NOT COALESCE((SELECT is_active FROM public.feature_flags WHERE name = 'plinko-welcome'), false) THEN RAISE EXCEPTION 'plinko_disabled' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.plinko_sessions (token_hash) VALUES (p_token_hash);
  RETURN public.get_plinko_status(p_token_hash);
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_plinko_play(p_token_hash text, p_request_id uuid, p_outcome text, p_rng_nonce uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_session public.plinko_sessions%ROWTYPE;
  v_play public.plinko_plays%ROWTYPE;
  v_reward_id uuid;
  v_label text;
BEGIN
  IF COALESCE((SELECT auth.jwt()->>'role'), '') <> 'service_role' THEN RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501'; END IF;
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'invalid_plinko_session' USING ERRCODE = '42501'; END IF;
  IF p_request_id IS NULL OR p_rng_nonce IS NULL THEN RAISE EXCEPTION 'plinko_identifiers_required' USING ERRCODE = '22023'; END IF;
  IF p_outcome IS NULL OR p_outcome NOT IN ('free_meal', 'half_price', 'tok_one_month', 'replay', 'lost') THEN RAISE EXCEPTION 'invalid_plinko_outcome' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('plinko:' || p_token_hash, 0));
  SELECT * INTO v_session FROM public.plinko_sessions WHERE token_hash = p_token_hash AND expires_at > now() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_plinko_session' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_play FROM public.plinko_plays WHERE session_id = v_session.id AND request_id = p_request_id;
  IF FOUND THEN
    SELECT id INTO v_reward_id FROM public.plinko_rewards WHERE play_id = v_play.id;
    -- The immutable receipt identifies the requested draw. Keep current play
    -- and reward together so an old tab also recovers a later winning claim.
    RETURN public.get_plinko_status(p_token_hash) || jsonb_build_object('idempotentReplay', true, 'alreadyClaimed', false,
      'requestedPlay', jsonb_build_object('id', v_play.id, 'requestId', v_play.request_id,
        'outcome', v_play.outcome, 'createdAt', v_play.created_at, 'rewardId', v_reward_id));
  END IF;
  IF NOT COALESCE((SELECT is_active FROM public.feature_flags WHERE name = 'plinko-welcome'), false) THEN RAISE EXCEPTION 'plinko_disabled' USING ERRCODE = '42501'; END IF;
  IF v_session.attempts_remaining <= 0 THEN
    RETURN public.get_plinko_status(p_token_hash) || jsonb_build_object('alreadyClaimed', true, 'idempotentReplay', false);
  END IF;
  INSERT INTO public.plinko_plays (session_id, request_id, play_number, outcome, rng_nonce)
  VALUES (v_session.id, p_request_id, v_session.plays_used + 1, p_outcome, p_rng_nonce) RETURNING * INTO v_play;
  UPDATE public.plinko_sessions SET attempts_remaining = CASE WHEN p_outcome = 'replay' THEN 1 ELSE 0 END,
    plays_used = plays_used + 1, updated_at = now() WHERE id = v_session.id;
  IF p_outcome IN ('free_meal', 'half_price', 'tok_one_month') THEN
    v_label := CASE p_outcome WHEN 'free_meal' THEN 'Un repas gratuit' WHEN 'half_price' THEN '-50 % sur un repas' ELSE 'Un mois de TOK One offert' END;
    INSERT INTO public.plinko_rewards (play_id, session_id, outcome, label)
    VALUES (v_play.id, v_session.id, p_outcome, v_label);
  END IF;
  RETURN public.get_plinko_status(p_token_hash) || jsonb_build_object('idempotentReplay', false, 'alreadyClaimed', false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_plinko_reward(p_token_hash text, p_email text, p_marketing_consent boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_session public.plinko_sessions%ROWTYPE;
  v_reward public.plinko_rewards%ROWTYPE;
  v_email text := lower(btrim(p_email));
BEGIN
  IF COALESCE((SELECT auth.jwt()->>'role'), '') <> 'service_role' THEN RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501'; END IF;
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'invalid_plinko_session' USING ERRCODE = '42501'; END IF;
  IF v_email IS NULL OR char_length(v_email) > 254 OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' OR p_email ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'invalid_plinko_email' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('plinko:' || p_token_hash, 0));
  SELECT * INTO v_session FROM public.plinko_sessions WHERE token_hash = p_token_hash AND expires_at > now() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_plinko_session' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_reward FROM public.plinko_rewards WHERE session_id = v_session.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'plinko_no_prize' USING ERRCODE = '22023'; END IF;
  IF v_reward.email IS NOT NULL THEN
    IF v_reward.email <> v_email THEN RAISE EXCEPTION 'plinko_already_claimed' USING ERRCODE = '23505'; END IF;
    -- An uncertain response can be retried without changing consent or the email.
    RETURN public.get_plinko_status(p_token_hash) || jsonb_build_object('idempotentReplay', true);
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('plinko:email:welcome-v1:' || v_email, 0));
  IF EXISTS (SELECT 1 FROM public.plinko_rewards WHERE campaign_id = 'welcome-v1' AND email = v_email) THEN
    RAISE EXCEPTION 'plinko_email_already_used' USING ERRCODE = '23505';
  END IF;
  UPDATE public.plinko_rewards SET email = v_email, status = 'pending_fulfillment', claimed_at = now(),
    marketing_consent = COALESCE(p_marketing_consent, false),
    marketing_consent_at = CASE WHEN COALESCE(p_marketing_consent, false) THEN now() ELSE NULL END
  WHERE id = v_reward.id;
  -- Existing transactional dispatcher handles these queued messages. The claim,
  -- visitor receipt and support handoff commit together and are retry-safe.
  -- Body is plain text, so a submitted email cannot inject HTML content.
  INSERT INTO public.email_queue (to_email, subject, body_text, status, metadata)
  VALUES (v_email, 'Votre gain Plinko TOK est enregistré',
    'Votre demande de gain Plinko est enregistrée : ' || v_reward.label || E'\nRéférence : ' || v_reward.id::text ||
    E'\nL’équipe TOK vous contactera à cette adresse pour vérifier votre e-mail et organiser la remise du gain. Aucun abonnement ni réduction n’est activé automatiquement.' ||
    E'\nVous n’êtes pas à l’origine de cette demande ? Ignorez ce message ou contactez contact@thetok.ch.',
    'queued', jsonb_build_object('kind', 'plinko_prize_claim', 'plinko_reward_id', v_reward.id, 'plinko_audience', 'visitor')),
  ('contact@thetok.ch', '[TOK Plinko] Gain à remettre : ' || v_reward.label,
    'Demande de remise Plinko : ' || v_reward.label || E'\nRéférence : ' || v_reward.id::text ||
    E'\nE-mail communiqué (à vérifier avant remise) : ' || v_email ||
    E'\nVérifiez la propriété de cette adresse puis organisez la remise. Ne modifiez pas les abonnements payants existants.',
    'queued', jsonb_build_object('kind', 'plinko_prize_claim', 'plinko_reward_id', v_reward.id, 'plinko_audience', 'support'));
  RETURN public.get_plinko_status(p_token_hash) || jsonb_build_object('idempotentReplay', false);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_plinko_status(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_plinko_session(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_plinko_play(text, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_plinko_reward(text, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_plinko_status(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_plinko_session(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_plinko_play(text, uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_plinko_reward(text, text, boolean) TO service_role;
