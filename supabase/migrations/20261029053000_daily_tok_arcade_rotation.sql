-- Une seule attribution du mini-jeu par client et par jour Europe/Zurich.
-- Les récompenses sont attribuées côté serveur, jamais par le navigateur.
CREATE TABLE public.daily_arcade_days (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  play_date date NOT NULL,
  game text NOT NULL CHECK (game IN ('slot','plinko','claw')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, play_date)
);
CREATE TABLE public.daily_arcade_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  play_date date NOT NULL,
  game text NOT NULL CHECK (game IN ('plinko','claw')),
  attempt_number integer NOT NULL CHECK (attempt_number BETWEEN 1 AND 3),
  request_id uuid NOT NULL,
  toy_type text,
  reward_points integer NOT NULL CHECK (reward_points BETWEEN 0 AND 10),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (user_id, play_date) REFERENCES public.daily_arcade_days(user_id, play_date) ON DELETE CASCADE,
  UNIQUE (user_id, play_date, attempt_number),
  UNIQUE (user_id, request_id),
  CONSTRAINT daily_arcade_reward_type CHECK (
    (game = 'plinko' AND toy_type IS NULL AND reward_points > 0)
    OR (game = 'claw' AND (
       (toy_type IS NULL AND reward_points = 0)
       OR (toy_type IN ('classic','basil','spicy','thefork','miamz','tokball') AND reward_points > 0)
    ))
  )
);
CREATE INDEX daily_arcade_attempts_user_date_idx ON public.daily_arcade_attempts(user_id, play_date, attempt_number DESC);
ALTER TABLE public.daily_arcade_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_arcade_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.daily_arcade_days, public.daily_arcade_attempts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.daily_arcade_days, public.daily_arcade_attempts TO authenticated;
GRANT ALL ON TABLE public.daily_arcade_days, public.daily_arcade_attempts TO service_role;
CREATE POLICY "Client reads own arcade day" ON public.daily_arcade_days
 FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "Client reads own arcade attempts" ON public.daily_arcade_attempts
 FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

-- L'ancienne machine à sous garde les 3 essais déjà comptabilisés lors de la migration.
CREATE OR REPLACE FUNCTION public.get_or_assign_daily_arcade_game(p_user_id uuid, p_play_date date)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_game text;
BEGIN
 IF COALESCE((SELECT auth.jwt()->>'role'), '') <> 'service_role' THEN
   RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
 END IF;
 IF p_user_id IS NULL OR p_play_date IS NULL THEN
   RAISE EXCEPTION 'invalid_arcade_identity' USING ERRCODE = '22023';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_play_date::text, 0));
 SELECT game INTO v_game FROM public.daily_arcade_days
 WHERE user_id = p_user_id AND play_date = p_play_date;
 IF FOUND THEN RETURN v_game; END IF;
 IF EXISTS (SELECT 1 FROM public.daily_slot_spins WHERE user_id = p_user_id AND spin_date = p_play_date) THEN
   v_game := 'slot';
 ELSE
   v_game := (ARRAY['slot','plinko','claw']::text[])[1 + (get_byte(decode(substr(md5(gen_random_uuid()::text),1,2),'hex'),0) % 3)];
 END IF;
 INSERT INTO public.daily_arcade_days(user_id,play_date,game) VALUES(p_user_id,p_play_date,v_game);
 RETURN v_game;
END;
$$;
REVOKE ALL ON FUNCTION public.get_or_assign_daily_arcade_game(uuid,date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_assign_daily_arcade_game(uuid,date) TO service_role;

-- Crédit et tentative dans la même transaction, sous verrou, y compris les retries.
CREATE OR REPLACE FUNCTION public.record_daily_arcade_attempt(
 p_user_id uuid, p_play_date date, p_game text, p_request_id uuid,
 p_toy_type text, p_reward_points integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
 v_day_game text;
 v_play public.daily_arcade_attempts%ROWTYPE;
 v_used integer;
 v_total integer;
 v_daily integer;
 v_replay boolean := false;
 v_already boolean := false;
BEGIN
 IF COALESCE((SELECT auth.jwt()->>'role'), '') <> 'service_role' THEN
   RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
 END IF;
 IF p_user_id IS NULL OR p_play_date IS NULL OR p_request_id IS NULL
    OR p_game NOT IN ('plinko','claw') OR p_reward_points NOT BETWEEN 0 AND 10 THEN
   RAISE EXCEPTION 'invalid_arcade_attempt' USING ERRCODE = '22023';
 END IF;
 IF NOT (
    (p_game = 'plinko' AND p_toy_type IS NULL AND p_reward_points > 0)
    OR (p_game = 'claw' AND (
      (p_toy_type IS NULL AND p_reward_points = 0)
      OR (p_toy_type IN ('classic','basil','spicy','thefork','miamz','tokball') AND p_reward_points > 0)
    ))
 ) THEN RAISE EXCEPTION 'invalid_arcade_reward' USING ERRCODE = '22023'; END IF;

 PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_play_date::text, 0));
 SELECT game INTO v_day_game FROM public.daily_arcade_days
 WHERE user_id = p_user_id AND play_date = p_play_date;
 IF v_day_game IS DISTINCT FROM p_game THEN
   RAISE EXCEPTION 'wrong_daily_game' USING ERRCODE = '42501';
 END IF;
 SELECT * INTO v_play FROM public.daily_arcade_attempts
 WHERE user_id = p_user_id AND request_id = p_request_id LIMIT 1;
 IF FOUND THEN v_replay := true; END IF;
 SELECT count(*) INTO v_used FROM public.daily_arcade_attempts
 WHERE user_id = p_user_id AND play_date = p_play_date;
 IF NOT v_replay AND v_used >= 3 THEN
   v_already := true;
   SELECT * INTO v_play FROM public.daily_arcade_attempts
   WHERE user_id = p_user_id AND play_date = p_play_date
   ORDER BY attempt_number DESC LIMIT 1;
 END IF;
 IF NOT v_replay AND NOT v_already THEN
   INSERT INTO public.daily_arcade_attempts(user_id,play_date,game,attempt_number,request_id,toy_type,reward_points)
   VALUES (p_user_id,p_play_date,p_game,v_used+1,p_request_id,p_toy_type,p_reward_points)
   RETURNING * INTO v_play;
   v_used := v_used + 1;
   IF p_reward_points > 0 THEN
     INSERT INTO public.loyalty_transactions(user_id,amount,transaction_type,description,metadata)
     VALUES(p_user_id,p_reward_points,'daily_arcade',
       'Gain mini-jeu TOK ' || p_game,
       jsonb_build_object('arcade_attempt_id',v_play.id,'play_date',p_play_date,
                         'game',p_game,'toy_type',p_toy_type,'request_id',p_request_id));
     INSERT INTO public.profiles(user_id,loyalty_points)
     VALUES(p_user_id,p_reward_points)
     ON CONFLICT(user_id) DO UPDATE SET
       loyalty_points = COALESCE(public.profiles.loyalty_points,0) + EXCLUDED.loyalty_points,
       updated_at = now();
   END IF;
 END IF;
 SELECT COALESCE(loyalty_points,0) INTO v_total FROM public.profiles WHERE user_id = p_user_id;
 SELECT COALESCE(sum(reward_points),0) INTO v_daily
 FROM public.daily_arcade_attempts WHERE user_id = p_user_id AND play_date = p_play_date;
 RETURN jsonb_build_object(
   'ok',true,'idempotent_replay',v_replay,'already_claimed',v_already,
   'attempts_used',v_used,'attempts_remaining',GREATEST(3-v_used,0),'max_attempts',3,
   'session_reward_points',v_daily,'total_loyalty_points',COALESCE(v_total,0),
   'play',jsonb_build_object('id',v_play.id,'request_id',v_play.request_id,
     'game',v_play.game,'attempt_number',v_play.attempt_number,
     'reward_points',v_play.reward_points,'toy_type',v_play.toy_type,
     'created_at',v_play.created_at)
 );
END;
$$;
REVOKE ALL ON FUNCTION public.record_daily_arcade_attempt(uuid,date,text,uuid,text,integer)
 FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_daily_arcade_attempt(uuid,date,text,uuid,text,integer)
 TO service_role;
NOTIFY pgrst, 'reload schema';
