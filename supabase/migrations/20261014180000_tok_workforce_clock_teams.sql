-- SwissTime -> TOK employee self-service, server-authoritative time clock.
-- A new migration: never rewrite the already-applied 20261014165500 migration.
CREATE TABLE public.tok_workforce_clock_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
 employee_id uuid NOT NULL,
 clock_in_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 clock_out_at timestamptz,
 pause_started_at timestamptz,
 break_seconds integer NOT NULL DEFAULT 0 CHECK (break_seconds >= 0),
 entry_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (restaurant_id,id),
 FOREIGN KEY (restaurant_id,employee_id) REFERENCES public.tok_workforce_employees(restaurant_id,id) ON DELETE CASCADE,
 FOREIGN KEY (restaurant_id,entry_id) REFERENCES public.tok_workforce_time_entries(restaurant_id,id) ON DELETE SET NULL (entry_id),
 CHECK (clock_out_at IS NULL OR (clock_out_at >= clock_in_at AND pause_started_at IS NULL)),
 CHECK (pause_started_at IS NULL OR (clock_out_at IS NULL AND pause_started_at >= clock_in_at))
);
CREATE UNIQUE INDEX tok_workforce_clock_one_active ON public.tok_workforce_clock_sessions(employee_id) WHERE clock_out_at IS NULL;
CREATE INDEX tok_workforce_clock_restaurant_recent ON public.tok_workforce_clock_sessions(restaurant_id,clock_in_at DESC);
CREATE INDEX tok_workforce_clock_employee_recent ON public.tok_workforce_clock_sessions(employee_id,clock_in_at DESC);

CREATE TABLE public.tok_workforce_clock_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
 employee_id uuid NOT NULL,
 session_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES auth.users(id),
 action text NOT NULL CHECK (action IN ('clock_in','break_start','break_end','clock_out')),
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY (restaurant_id,employee_id) REFERENCES public.tok_workforce_employees(restaurant_id,id) ON DELETE CASCADE,
 FOREIGN KEY (restaurant_id,session_id) REFERENCES public.tok_workforce_clock_sessions(restaurant_id,id) ON DELETE CASCADE
);
CREATE INDEX tok_workforce_clock_events_recent ON public.tok_workforce_clock_events(restaurant_id,occurred_at DESC);
CREATE INDEX tok_workforce_clock_events_session ON public.tok_workforce_clock_events(session_id,occurred_at);

ALTER TABLE public.tok_workforce_clock_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tok_workforce_clock_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY tok_workforce_clock_sessions_read ON public.tok_workforce_clock_sessions FOR SELECT TO authenticated
 USING (public.tok_workforce_can_manage(restaurant_id) OR (
    public.tok_workforce_enabled(restaurant_id)
    AND EXISTS (SELECT 1 FROM public.tok_workforce_employees e
      WHERE e.id=employee_id AND e.restaurant_id=tok_workforce_clock_sessions.restaurant_id
      AND e.user_id=(SELECT auth.uid()) AND e.is_active)
 ));
CREATE POLICY tok_workforce_clock_events_read ON public.tok_workforce_clock_events FOR SELECT TO authenticated
 USING (public.tok_workforce_can_manage(restaurant_id) OR (
    public.tok_workforce_enabled(restaurant_id)
    AND EXISTS (SELECT 1 FROM public.tok_workforce_employees e
      WHERE e.id=employee_id AND e.restaurant_id=tok_workforce_clock_events.restaurant_id
      AND e.user_id=(SELECT auth.uid()) AND e.is_active)
 ));
REVOKE ALL ON public.tok_workforce_clock_sessions,public.tok_workforce_clock_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.tok_workforce_clock_sessions,public.tok_workforce_clock_events TO authenticated;

-- An employee's session is visible by the same authenticated user account that owns it.
-- Invitations are matched only against an email verified by Supabase Auth.
CREATE FUNCTION public.tok_workforce_my_restaurants()
RETURNS TABLE(restaurant_id uuid,employee_id uuid,restaurant_name text,linked boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
 SELECT e.restaurant_id,e.id,r.name,(e.user_id=(SELECT auth.uid()))
 FROM public.tok_workforce_employees e
 JOIN public.restaurants r ON r.id=e.restaurant_id
 JOIN public.tok_workforce_settings s ON s.restaurant_id=e.restaurant_id AND s.enabled
 JOIN auth.users u ON u.id=(SELECT auth.uid())
 WHERE e.is_active AND (
   e.user_id=u.id OR (
     e.user_id IS NULL
     AND e.email IS NOT NULL AND u.email_confirmed_at IS NOT NULL
     AND lower(btrim(e.email))=lower(btrim(u.email))
   )
 )
 ORDER BY r.name,e.id
 LIMIT 50;
$$;

CREATE FUNCTION public.tok_workforce_claim_employee(p_restaurant_id uuid)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_actor uuid := auth.uid(); v_email text; v_employee uuid;
BEGIN
 IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 SELECT email INTO v_email FROM auth.users WHERE id=v_actor AND email_confirmed_at IS NOT NULL;
 IF v_email IS NULL THEN RAISE EXCEPTION 'Verified email required'; END IF;
 UPDATE public.tok_workforce_employees e SET user_id=v_actor,updated_at=now()
 WHERE e.restaurant_id=p_restaurant_id AND e.user_id IS NULL AND e.is_active
   AND lower(btrim(e.email))=lower(btrim(v_email))
   AND EXISTS (SELECT 1 FROM public.tok_workforce_settings s
     WHERE s.restaurant_id=e.restaurant_id AND s.enabled)
 RETURNING id INTO v_employee;
 IF v_employee IS NULL THEN RAISE EXCEPTION 'No verified pending invitation'; END IF;
 RETURN v_employee;
END $$;

-- Do not allow arbitrary self-reported entries: only owner/admin or verified server punch flow.
DROP POLICY IF EXISTS tok_workforce_entries_self_insert ON public.tok_workforce_time_entries;

CREATE FUNCTION public.tok_workforce_punch(p_restaurant_id uuid,p_action text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $$
DECLARE
 v_actor uuid := auth.uid();
 v_employee uuid;
 v_session public.tok_workforce_clock_sessions%ROWTYPE;
 v_now timestamptz := clock_timestamp();
 v_break_seconds integer;
 v_elapsed_seconds numeric;
 v_break_minutes integer;
 v_local_start timestamp;
 v_local_end timestamp;
 v_entry uuid;
BEGIN
 IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 IF p_action IS NULL OR p_action NOT IN ('clock_in','break_start','break_end','clock_out')
 THEN RAISE EXCEPTION 'Invalid punch action'; END IF;

 SELECT e.id INTO v_employee FROM public.tok_workforce_employees e
 WHERE e.restaurant_id=p_restaurant_id AND e.user_id=v_actor AND e.is_active
 AND EXISTS (SELECT 1 FROM public.tok_workforce_settings s
   WHERE s.restaurant_id=e.restaurant_id AND s.enabled)
 FOR UPDATE;
 IF v_employee IS NULL THEN RAISE EXCEPTION 'Workforce membership inactive or unauthorized'; END IF;

 -- The employee lock serializes simultaneous browser/tab requests and prevents double clocks.
 SELECT * INTO v_session FROM public.tok_workforce_clock_sessions
 WHERE employee_id=v_employee AND restaurant_id=p_restaurant_id AND clock_out_at IS NULL
 FOR UPDATE;

 IF p_action='clock_in' THEN
   IF v_session.id IS NOT NULL THEN RAISE EXCEPTION 'Already clocked in'; END IF;
   INSERT INTO public.tok_workforce_clock_sessions(restaurant_id,employee_id,clock_in_at)
   VALUES (p_restaurant_id,v_employee,v_now) RETURNING * INTO v_session;
 ELSE
   IF v_session.id IS NULL THEN RAISE EXCEPTION 'No active time clock session'; END IF;
   IF p_action='break_start' THEN
     IF v_session.pause_started_at IS NOT NULL THEN RAISE EXCEPTION 'Already on break'; END IF;
     UPDATE public.tok_workforce_clock_sessions SET pause_started_at=v_now,updated_at=v_now
       WHERE id=v_session.id RETURNING * INTO v_session;
   ELSIF p_action='break_end' THEN
     IF v_session.pause_started_at IS NULL THEN RAISE EXCEPTION 'No active break'; END IF;
     UPDATE public.tok_workforce_clock_sessions SET
       break_seconds=break_seconds+GREATEST(0,EXTRACT(EPOCH FROM v_now-pause_started_at)::integer),
       pause_started_at=NULL,updated_at=v_now
       WHERE id=v_session.id RETURNING * INTO v_session;
   ELSE
     IF v_session.pause_started_at IS NOT NULL THEN RAISE EXCEPTION 'End the break before clocking out'; END IF;
     v_elapsed_seconds := EXTRACT(EPOCH FROM v_now-v_session.clock_in_at);
     IF v_elapsed_seconds<=0 THEN RAISE EXCEPTION 'Invalid session duration'; END IF;
     v_break_seconds := v_session.break_seconds;
     v_break_minutes := CEIL(v_break_seconds / 60.0)::integer;
     v_local_start := v_session.clock_in_at AT TIME ZONE 'Europe/Zurich';
     v_local_end := v_now AT TIME ZONE 'Europe/Zurich';
     -- Sessions beyond a single shift are retained for manual supervisor reconciliation.
     IF v_elapsed_seconds < 72000
        AND (v_local_start::time <> v_local_end::time)
        AND v_break_minutes < CEIL(v_elapsed_seconds/60.0)::integer THEN
       INSERT INTO public.tok_workforce_time_entries
         (restaurant_id,employee_id,entry_date,start_time,end_time,break_minutes,
          is_night_work,is_sunday_work,created_by,notes)
       VALUES (p_restaurant_id,v_employee,v_local_start::date,v_local_start::time,v_local_end::time,
          v_break_minutes,EXTRACT(HOUR FROM v_local_start)<6 OR EXTRACT(HOUR FROM v_local_end)>=23,
          EXTRACT(ISODOW FROM v_local_start)=7,v_actor,'Badgeuse TOK · horodatage serveur')
       RETURNING id INTO v_entry;
     END IF;
     UPDATE public.tok_workforce_clock_sessions SET clock_out_at=v_now,entry_id=v_entry,updated_at=v_now
       WHERE id=v_session.id RETURNING * INTO v_session;
   END IF;
 END IF;
 INSERT INTO public.tok_workforce_clock_events(restaurant_id,employee_id,session_id,actor_id,action,occurred_at)
 VALUES(p_restaurant_id,v_employee,v_session.id,v_actor,p_action,v_now);
 RETURN jsonb_build_object('session_id',v_session.id,'action',p_action,
   'clock_in_at',v_session.clock_in_at,'clock_out_at',v_session.clock_out_at,
   'pause_started_at',v_session.pause_started_at,'break_seconds',v_session.break_seconds,
   'time_entry_id',v_session.entry_id,'recorded_at',v_now);
END $$;

REVOKE ALL ON FUNCTION public.tok_workforce_my_restaurants(),
  public.tok_workforce_claim_employee(uuid),public.tok_workforce_punch(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tok_workforce_my_restaurants(),
  public.tok_workforce_claim_employee(uuid),public.tok_workforce_punch(uuid,text) TO authenticated;

-- Source SwissTime features: team listing and two-step shift exchanges.
-- Store an ordinary visual signature, not a qualified electronic signature.
ALTER TABLE public.tok_workforce_validations
 ADD COLUMN signature_data text CHECK (
  signature_data IS NULL OR (
   char_length(signature_data) BETWEEN 100 AND 120000
   AND signature_data ~ '^data:image/png;base64,[A-Za-z0-9+/=]+$'
  )
 );

CREATE UNIQUE INDEX tok_workforce_employees_verified_email
 ON public.tok_workforce_employees (restaurant_id, lower(btrim(email)))
 WHERE email IS NOT NULL AND btrim(email)<>'';

ALTER TABLE public.tok_workforce_employees ADD COLUMN hourly_cost_chf numeric(9,2) NOT NULL DEFAULT 0
 CHECK (hourly_cost_chf BETWEEN 0 AND 10000);

CREATE FUNCTION public.tok_workforce_team_directory(p_restaurant_id uuid)
RETURNS TABLE(employee_id uuid,display_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
 SELECT e.id, e.first_name || ' ' || e.last_name
 FROM public.tok_workforce_employees e
 WHERE e.restaurant_id=p_restaurant_id AND e.is_active
 AND EXISTS (
   SELECT 1 FROM public.tok_workforce_employees myself
   JOIN public.tok_workforce_settings s ON s.restaurant_id=myself.restaurant_id
   WHERE myself.restaurant_id=p_restaurant_id AND myself.user_id=(SELECT auth.uid())
   AND myself.is_active AND s.enabled
 )
 ORDER BY e.last_name,e.first_name
 LIMIT 200;
$$;

ALTER TABLE public.tok_workforce_exchanges
 ADD COLUMN target_accepted_at timestamptz,
 ADD COLUMN target_response text CHECK (target_response IS NULL OR char_length(target_response)<=1000),
 ADD COLUMN requester_message text CHECK (requester_message IS NULL OR char_length(requester_message)<=1000),
 ADD COLUMN manager_notes text CHECK (manager_notes IS NULL OR char_length(manager_notes)<=1000);

CREATE FUNCTION public.tok_workforce_respond_exchange(p_exchange_id uuid,p_accept boolean,p_response text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_exchange public.tok_workforce_exchanges%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 SELECT * INTO v_exchange FROM public.tok_workforce_exchanges WHERE id=p_exchange_id FOR UPDATE;
 IF v_exchange.id IS NULL OR v_exchange.status<>'pending' OR v_exchange.target_accepted_at IS NOT NULL THEN
   RAISE EXCEPTION 'Exchange unavailable'; END IF;
 IF NOT public.tok_workforce_enabled(v_exchange.restaurant_id)
  OR NOT EXISTS(SELECT 1 FROM public.tok_workforce_employees e
    WHERE e.id=v_exchange.target_employee_id AND e.restaurant_id=v_exchange.restaurant_id
    AND e.user_id=auth.uid() AND e.is_active)
 THEN RAISE EXCEPTION 'Unauthorized recipient'; END IF;
 IF p_response IS NOT NULL AND char_length(p_response)>1000 THEN RAISE EXCEPTION 'Message too long'; END IF;
 UPDATE public.tok_workforce_exchanges SET
   target_accepted_at=CASE WHEN p_accept THEN now() ELSE NULL END,
   status=CASE WHEN p_accept THEN 'pending' ELSE 'rejected' END,
   target_response=p_response,updated_at=now()
 WHERE id=p_exchange_id;
END $$;

-- Keep the original transactional swap, but require explicit colleague consent.
CREATE OR REPLACE FUNCTION public.tok_workforce_review_exchange(p_exchange_id uuid,p_approve boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE
 request_row public.tok_workforce_exchanges%ROWTYPE;
 requester_employee uuid;
 target_employee uuid;
BEGIN
 SELECT * INTO request_row FROM public.tok_workforce_exchanges WHERE id=p_exchange_id FOR UPDATE;
 IF NOT FOUND OR NOT public.tok_workforce_can_manage(request_row.restaurant_id) THEN
   RAISE EXCEPTION 'Exchange not found or unauthorized';
 END IF;
 IF request_row.status <> 'pending' THEN RAISE EXCEPTION 'Exchange already reviewed'; END IF;
 IF p_approve THEN
   IF request_row.target_accepted_at IS NULL THEN RAISE EXCEPTION 'Colleague consent required'; END IF;
   SELECT employee_id INTO requester_employee FROM public.tok_workforce_shifts
     WHERE id=request_row.requester_shift_id AND restaurant_id=request_row.restaurant_id FOR UPDATE;
   IF requester_employee IS DISTINCT FROM request_row.requester_id THEN RAISE EXCEPTION 'Requester shift changed'; END IF;
   IF request_row.target_shift_id IS NOT NULL THEN
     SELECT employee_id INTO target_employee FROM public.tok_workforce_shifts
       WHERE id=request_row.target_shift_id AND restaurant_id=request_row.restaurant_id FOR UPDATE;
     IF target_employee IS DISTINCT FROM request_row.target_employee_id THEN RAISE EXCEPTION 'Target shift changed'; END IF;
     UPDATE public.tok_workforce_shifts SET employee_id=request_row.requester_id,updated_at=now()
       WHERE id=request_row.target_shift_id AND restaurant_id=request_row.restaurant_id;
   END IF;
   UPDATE public.tok_workforce_shifts SET employee_id=request_row.target_employee_id,updated_at=now()
     WHERE id=request_row.requester_shift_id AND restaurant_id=request_row.restaurant_id;
 END IF;
 UPDATE public.tok_workforce_exchanges
 SET status=CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
 reviewed_at=now(),reviewed_by=auth.uid(),updated_at=now()
 WHERE id=p_exchange_id AND restaurant_id=request_row.restaurant_id;
END $$;
REVOKE ALL ON FUNCTION public.tok_workforce_team_directory(uuid),
 public.tok_workforce_respond_exchange(uuid,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tok_workforce_team_directory(uuid),
 public.tok_workforce_respond_exchange(uuid,boolean,text) TO authenticated;
-- A leave request and its resulting absence are one reviewed transaction.
ALTER TABLE public.tok_workforce_requests
 ADD COLUMN requested_start_date date,
 ADD COLUMN requested_end_date date,
 ADD COLUMN requested_days numeric(5,1),
 ADD CONSTRAINT tok_workforce_request_period CHECK (
  (requested_start_date IS NULL AND requested_end_date IS NULL AND requested_days IS NULL)
  OR (requested_start_date IS NOT NULL AND requested_end_date IS NOT NULL AND requested_days IS NOT NULL
   AND requested_end_date >= requested_start_date AND requested_days > 0
   AND requested_days <= LEAST(366,(requested_end_date-requested_start_date+1)))
 );

CREATE FUNCTION public.tok_workforce_review_request(p_request_id uuid,p_approve boolean)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_request public.tok_workforce_requests%ROWTYPE;
BEGIN
 SELECT * INTO v_request FROM public.tok_workforce_requests WHERE id=p_request_id FOR UPDATE;
 IF v_request.id IS NULL OR NOT public.tok_workforce_can_manage(v_request.restaurant_id)
   THEN RAISE EXCEPTION 'Request unavailable or unauthorized'; END IF;
 IF v_request.status <> 'pending' THEN RAISE EXCEPTION 'Request already reviewed'; END IF;
 IF p_approve AND v_request.request_type='vacation' THEN
   IF v_request.requested_start_date IS NULL OR v_request.requested_end_date IS NULL OR v_request.requested_days IS NULL
     THEN RAISE EXCEPTION 'Vacation dates required'; END IF;
   IF EXISTS(SELECT 1 FROM public.tok_workforce_absences a
     WHERE a.restaurant_id=v_request.restaurant_id AND a.employee_id=v_request.employee_id
       AND a.absence_type='vacation' AND a.start_date<=v_request.requested_end_date
       AND a.end_date>=v_request.requested_start_date)
     THEN RAISE EXCEPTION 'Overlapping approved vacation'; END IF;
   INSERT INTO public.tok_workforce_absences
     (restaurant_id,employee_id,absence_type,start_date,end_date,days_count,notes)
   VALUES (v_request.restaurant_id,v_request.employee_id,'vacation',
     v_request.requested_start_date,v_request.requested_end_date,v_request.requested_days,
     'Congé approuvé depuis TOK Équipe');
 END IF;
 UPDATE public.tok_workforce_requests
   SET status=CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
       reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now()
   WHERE id=p_request_id;
END $$;

REVOKE UPDATE, DELETE ON public.tok_workforce_requests FROM authenticated;
REVOKE ALL ON FUNCTION public.tok_workforce_review_request(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tok_workforce_review_request(uuid,boolean) TO authenticated;
