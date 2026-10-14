-- TOK workforce: native, restaurant-scoped adaptation of SwissTime Tracker.
-- New tables only: do not import SwissTime's global "employees", roles or auth schema.
CREATE TABLE public.tok_workforce_settings (
  restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  canton text NOT NULL DEFAULT 'GE' CHECK (canton ~ '^[A-Z]{2}$'),
  max_weekly_hours numeric(4,1) NOT NULL DEFAULT 50 CHECK (max_weekly_hours BETWEEN 1 AND 60),
  min_vacation_days integer NOT NULL DEFAULT 20 CHECK (min_vacation_days BETWEEN 0 AND 60),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.tok_workforce_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  first_name text NOT NULL CHECK (char_length(btrim(first_name)) BETWEEN 1 AND 100),
  last_name text NOT NULL CHECK (char_length(btrim(last_name)) BETWEEN 1 AND 100),
  email text CHECK (email IS NULL OR char_length(email) <= 254),
  role text NOT NULL DEFAULT 'employee' CHECK (role IN ('employee','manager')),
  contracted_hours_per_week numeric(4,1) NOT NULL DEFAULT 42 CHECK (contracted_hours_per_week BETWEEN 0 AND 60),
  vacation_days_per_year integer NOT NULL DEFAULT 20 CHECK (vacation_days_per_year BETWEEN 0 AND 60),
  started_on date NOT NULL DEFAULT current_date,
  ended_on date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(restaurant_id,id),
  CONSTRAINT workforce_employee_dates CHECK (ended_on IS NULL OR ended_on >= started_on)
);
CREATE TABLE public.tok_workforce_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL,
  shift_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  break_minutes integer NOT NULL DEFAULT 0 CHECK (break_minutes BETWEEN 0 AND 720),
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','confirmed','completed','cancelled')),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 2000),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(restaurant_id,id),
  FOREIGN KEY(restaurant_id,employee_id) REFERENCES public.tok_workforce_employees(restaurant_id,id) ON DELETE CASCADE,
  CHECK(start_time <> end_time)
);
CREATE TABLE public.tok_workforce_time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL,
  entry_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  break_minutes integer NOT NULL DEFAULT 0 CHECK (break_minutes BETWEEN 0 AND 720),
  is_night_work boolean NOT NULL DEFAULT false,
  is_sunday_work boolean NOT NULL DEFAULT false,
  notes text CHECK (notes IS NULL OR char_length(notes) <= 2000),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(restaurant_id,id),
  FOREIGN KEY(restaurant_id,employee_id) REFERENCES public.tok_workforce_employees(restaurant_id,id) ON DELETE CASCADE,
  CHECK(start_time <> end_time)
);
CREATE TABLE public.tok_workforce_validations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  time_entry_id uuid NOT NULL UNIQUE,
  signed_by uuid NOT NULL REFERENCES auth.users(id),
  signed_name text NOT NULL CHECK (char_length(btrim(signed_name)) BETWEEN 2 AND 120),
  signed_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(restaurant_id,time_entry_id) REFERENCES public.tok_workforce_time_entries(restaurant_id,id) ON DELETE CASCADE
);
CREATE TABLE public.tok_workforce_absences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL,
  absence_type text NOT NULL CHECK (absence_type IN ('vacation','sick','holiday','other')),
  start_date date NOT NULL,
  end_date date NOT NULL,
  days_count numeric(5,1) NOT NULL CHECK(days_count > 0 AND days_count <= 366),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(restaurant_id,employee_id) REFERENCES public.tok_workforce_employees(restaurant_id,id) ON DELETE CASCADE,
  CHECK(end_date >= start_date)
);
CREATE TABLE public.tok_workforce_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL,
  request_type text NOT NULL CHECK (request_type IN ('vacation','correction','schedule','other')),
  description text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 1 AND 2000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(restaurant_id,employee_id) REFERENCES public.tok_workforce_employees(restaurant_id,id) ON DELETE CASCADE
);
CREATE TABLE public.tok_workforce_exchanges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  requester_id uuid NOT NULL,
  requester_shift_id uuid NOT NULL,
  target_employee_id uuid NOT NULL,
  target_shift_id uuid,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(restaurant_id,requester_id) REFERENCES public.tok_workforce_employees(restaurant_id,id) ON DELETE CASCADE,
  FOREIGN KEY(restaurant_id,target_employee_id) REFERENCES public.tok_workforce_employees(restaurant_id,id) ON DELETE CASCADE,
  FOREIGN KEY(restaurant_id,requester_shift_id) REFERENCES public.tok_workforce_shifts(restaurant_id,id) ON DELETE CASCADE,
  FOREIGN KEY(restaurant_id,target_shift_id) REFERENCES public.tok_workforce_shifts(restaurant_id,id) ON DELETE SET NULL (target_shift_id),
  CHECK(requester_id <> target_employee_id),
  CHECK(target_shift_id IS NULL OR target_shift_id <> requester_shift_id)
);
CREATE TABLE public.tok_workforce_access_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  previous_enabled boolean,
  new_enabled boolean NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX tok_workforce_employees_list_idx ON public.tok_workforce_employees(restaurant_id,is_active,last_name);
CREATE INDEX tok_workforce_employees_user_idx ON public.tok_workforce_employees(user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX tok_workforce_employees_email_idx ON public.tok_workforce_employees(restaurant_id,lower(email)) WHERE email IS NOT NULL AND btrim(email)<>'';
CREATE INDEX tok_workforce_shifts_week_idx ON public.tok_workforce_shifts(restaurant_id,shift_date);
CREATE INDEX tok_workforce_shifts_employee_idx ON public.tok_workforce_shifts(employee_id,shift_date);
CREATE INDEX tok_workforce_entries_week_idx ON public.tok_workforce_time_entries(restaurant_id,entry_date);
CREATE INDEX tok_workforce_entries_employee_idx ON public.tok_workforce_time_entries(employee_id,entry_date);
CREATE INDEX tok_workforce_validation_restaurant_idx ON public.tok_workforce_validations(restaurant_id,signed_at DESC);
CREATE INDEX tok_workforce_absences_period_idx ON public.tok_workforce_absences(restaurant_id,start_date,end_date);
CREATE INDEX tok_workforce_requests_status_idx ON public.tok_workforce_requests(restaurant_id,status,created_at DESC);
CREATE INDEX tok_workforce_exchanges_status_idx ON public.tok_workforce_exchanges(restaurant_id,status,created_at DESC);
CREATE INDEX tok_workforce_audit_recent_idx ON public.tok_workforce_access_audit(restaurant_id,occurred_at DESC);

CREATE FUNCTION public.tok_workforce_enabled(p_restaurant_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT (SELECT auth.uid()) IS NOT NULL AND COALESCE((SELECT s.enabled FROM public.tok_workforce_settings s WHERE s.restaurant_id=p_restaurant_id),false) $$;
CREATE FUNCTION public.tok_workforce_can_manage(p_restaurant_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND (public.auth_is_admin() OR (public.auth_owns_restaurant(p_restaurant_id) AND public.tok_workforce_enabled(p_restaurant_id)))
$$;

ALTER TABLE public.tok_workforce_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tok_workforce_employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tok_workforce_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tok_workforce_time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tok_workforce_validations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tok_workforce_absences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tok_workforce_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tok_workforce_exchanges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tok_workforce_access_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY tok_workforce_settings_read ON public.tok_workforce_settings FOR SELECT TO authenticated
 USING (public.auth_is_admin() OR public.auth_owns_restaurant(restaurant_id));
CREATE POLICY tok_workforce_settings_admin_insert ON public.tok_workforce_settings FOR INSERT TO authenticated
 WITH CHECK (public.auth_is_admin() AND updated_by=(SELECT auth.uid()));
CREATE POLICY tok_workforce_settings_admin_update ON public.tok_workforce_settings FOR UPDATE TO authenticated
 USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin() AND updated_by=(SELECT auth.uid()));
CREATE POLICY tok_workforce_audit_admin_read ON public.tok_workforce_access_audit FOR SELECT TO authenticated
 USING (public.auth_is_admin());

CREATE POLICY tok_workforce_employees_manage ON public.tok_workforce_employees FOR ALL TO authenticated
 USING (public.tok_workforce_can_manage(restaurant_id)) WITH CHECK (public.tok_workforce_can_manage(restaurant_id));
CREATE POLICY tok_workforce_employees_self ON public.tok_workforce_employees FOR SELECT TO authenticated
 USING (user_id=(SELECT auth.uid()) AND public.tok_workforce_enabled(restaurant_id));
CREATE POLICY tok_workforce_shifts_manage ON public.tok_workforce_shifts FOR ALL TO authenticated
 USING (public.tok_workforce_can_manage(restaurant_id)) WITH CHECK (public.tok_workforce_can_manage(restaurant_id));
CREATE POLICY tok_workforce_shifts_self ON public.tok_workforce_shifts FOR SELECT TO authenticated
 USING (public.tok_workforce_enabled(restaurant_id) AND EXISTS(
    SELECT 1 FROM public.tok_workforce_employees e WHERE e.id=employee_id AND e.restaurant_id=tok_workforce_shifts.restaurant_id AND e.user_id=(SELECT auth.uid())
 ));
CREATE POLICY tok_workforce_entries_manage ON public.tok_workforce_time_entries FOR ALL TO authenticated
 USING (public.tok_workforce_can_manage(restaurant_id)) WITH CHECK (public.tok_workforce_can_manage(restaurant_id));
CREATE POLICY tok_workforce_entries_self ON public.tok_workforce_time_entries FOR SELECT TO authenticated
 USING (public.tok_workforce_enabled(restaurant_id) AND EXISTS(
    SELECT 1 FROM public.tok_workforce_employees e WHERE e.id=employee_id AND e.restaurant_id=tok_workforce_time_entries.restaurant_id AND e.user_id=(SELECT auth.uid())
 ));
CREATE POLICY tok_workforce_entries_self_insert ON public.tok_workforce_time_entries FOR INSERT TO authenticated
 WITH CHECK (public.tok_workforce_enabled(restaurant_id) AND EXISTS(
    SELECT 1 FROM public.tok_workforce_employees e WHERE e.id=employee_id AND e.restaurant_id=tok_workforce_time_entries.restaurant_id AND e.user_id=(SELECT auth.uid())
 ));
CREATE POLICY tok_workforce_validations_manage_read ON public.tok_workforce_validations FOR SELECT TO authenticated
 USING (public.tok_workforce_can_manage(restaurant_id) OR (public.tok_workforce_enabled(restaurant_id) AND EXISTS(
    SELECT 1 FROM public.tok_workforce_time_entries t JOIN public.tok_workforce_employees e ON e.id=t.employee_id AND e.restaurant_id=t.restaurant_id
    WHERE t.id=time_entry_id AND t.restaurant_id=tok_workforce_validations.restaurant_id AND e.user_id=(SELECT auth.uid())
 )));
CREATE POLICY tok_workforce_validations_sign ON public.tok_workforce_validations FOR INSERT TO authenticated
 WITH CHECK (public.tok_workforce_can_manage(restaurant_id) AND signed_by=(SELECT auth.uid()));
CREATE POLICY tok_workforce_absences_manage ON public.tok_workforce_absences FOR ALL TO authenticated
 USING (public.tok_workforce_can_manage(restaurant_id)) WITH CHECK (public.tok_workforce_can_manage(restaurant_id));
CREATE POLICY tok_workforce_absences_self ON public.tok_workforce_absences FOR SELECT TO authenticated
 USING (public.tok_workforce_enabled(restaurant_id) AND EXISTS(
    SELECT 1 FROM public.tok_workforce_employees e WHERE e.id=employee_id AND e.restaurant_id=tok_workforce_absences.restaurant_id AND e.user_id=(SELECT auth.uid())
 ));
CREATE POLICY tok_workforce_requests_manage ON public.tok_workforce_requests FOR ALL TO authenticated
 USING (public.tok_workforce_can_manage(restaurant_id)) WITH CHECK (public.tok_workforce_can_manage(restaurant_id));
CREATE POLICY tok_workforce_requests_self ON public.tok_workforce_requests FOR SELECT TO authenticated
 USING (public.tok_workforce_enabled(restaurant_id) AND EXISTS(
    SELECT 1 FROM public.tok_workforce_employees e WHERE e.id=employee_id AND e.restaurant_id=tok_workforce_requests.restaurant_id AND e.user_id=(SELECT auth.uid())
 ));
CREATE POLICY tok_workforce_requests_self_insert ON public.tok_workforce_requests FOR INSERT TO authenticated
 WITH CHECK (status='pending' AND reviewed_by IS NULL AND reviewed_at IS NULL AND public.tok_workforce_enabled(restaurant_id) AND EXISTS(
    SELECT 1 FROM public.tok_workforce_employees e WHERE e.id=employee_id AND e.restaurant_id=tok_workforce_requests.restaurant_id AND e.user_id=(SELECT auth.uid())
 ));
CREATE POLICY tok_workforce_exchanges_manage ON public.tok_workforce_exchanges FOR ALL TO authenticated
 USING (public.tok_workforce_can_manage(restaurant_id)) WITH CHECK (public.tok_workforce_can_manage(restaurant_id));
CREATE POLICY tok_workforce_exchanges_self_read ON public.tok_workforce_exchanges FOR SELECT TO authenticated
 USING (public.tok_workforce_enabled(restaurant_id) AND EXISTS(
    SELECT 1 FROM public.tok_workforce_employees e WHERE e.restaurant_id=tok_workforce_exchanges.restaurant_id AND e.user_id=(SELECT auth.uid()) AND e.id IN (requester_id,target_employee_id)
 ));
CREATE POLICY tok_workforce_exchanges_self_insert ON public.tok_workforce_exchanges FOR INSERT TO authenticated
 WITH CHECK (status='pending' AND reviewed_by IS NULL AND reviewed_at IS NULL AND public.tok_workforce_enabled(restaurant_id)
 AND EXISTS(SELECT 1 FROM public.tok_workforce_employees e WHERE e.id=requester_id AND e.restaurant_id=tok_workforce_exchanges.restaurant_id AND e.user_id=(SELECT auth.uid()))
 AND EXISTS(SELECT 1 FROM public.tok_workforce_shifts s WHERE s.id=requester_shift_id AND s.restaurant_id=tok_workforce_exchanges.restaurant_id AND s.employee_id=requester_id)
 );

REVOKE ALL ON public.tok_workforce_settings, public.tok_workforce_employees, public.tok_workforce_shifts,
 public.tok_workforce_time_entries, public.tok_workforce_validations, public.tok_workforce_absences,
 public.tok_workforce_requests, public.tok_workforce_exchanges, public.tok_workforce_access_audit FROM anon;
GRANT SELECT ON public.tok_workforce_settings TO authenticated;
GRANT INSERT, UPDATE ON public.tok_workforce_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tok_workforce_employees, public.tok_workforce_shifts,
 public.tok_workforce_time_entries, public.tok_workforce_absences, public.tok_workforce_requests,
 public.tok_workforce_exchanges TO authenticated;
GRANT SELECT, INSERT ON public.tok_workforce_validations TO authenticated;
GRANT SELECT ON public.tok_workforce_access_audit TO authenticated;
REVOKE ALL ON FUNCTION public.tok_workforce_enabled(uuid),public.tok_workforce_can_manage(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tok_workforce_enabled(uuid),public.tok_workforce_can_manage(uuid) TO authenticated;

-- Activation history is server-authored, immutable to the browser.
CREATE FUNCTION public.tok_workforce_log_enablement() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
BEGIN
  IF NOT public.auth_is_admin() THEN RAISE EXCEPTION 'Administrator required'; END IF;
  IF TG_OP='INSERT' OR OLD.enabled IS DISTINCT FROM NEW.enabled THEN
    INSERT INTO public.tok_workforce_access_audit(restaurant_id,actor_id,previous_enabled,new_enabled)
    VALUES (NEW.restaurant_id,auth.uid(),CASE WHEN TG_OP='INSERT' THEN NULL ELSE OLD.enabled END,NEW.enabled);
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER tok_workforce_settings_audit BEFORE INSERT OR UPDATE ON public.tok_workforce_settings
FOR EACH ROW EXECUTE FUNCTION public.tok_workforce_log_enablement();
REVOKE ALL ON FUNCTION public.tok_workforce_log_enablement() FROM PUBLIC, anon, authenticated;

-- Approving an exchange and moving the shift(s) must happen in one transaction.
-- Restaurant users may create and inspect requests, but only the secured RPC
-- may mutate their status or move shifts as part of the same transaction.
REVOKE UPDATE, DELETE ON public.tok_workforce_exchanges FROM authenticated;

CREATE FUNCTION public.tok_workforce_review_exchange(p_exchange_id uuid,p_approve boolean)
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
  IF request_row.status<>'pending' THEN RAISE EXCEPTION 'Exchange already reviewed'; END IF;
  IF p_approve THEN
    SELECT employee_id INTO requester_employee FROM public.tok_workforce_shifts
      WHERE id=request_row.requester_shift_id AND restaurant_id=request_row.restaurant_id FOR UPDATE;
    IF requester_employee IS DISTINCT FROM request_row.requester_id THEN RAISE EXCEPTION 'Requester shift changed'; END IF;
    IF request_row.target_shift_id IS NOT NULL THEN
      SELECT employee_id INTO target_employee FROM public.tok_workforce_shifts
        WHERE id=request_row.target_shift_id AND restaurant_id=request_row.restaurant_id FOR UPDATE;
      IF target_employee IS DISTINCT FROM request_row.target_employee_id THEN RAISE EXCEPTION 'Target shift changed'; END IF;
      UPDATE public.tok_workforce_shifts SET employee_id=request_row.requester_id, updated_at=now()
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
REVOKE ALL ON FUNCTION public.tok_workforce_review_exchange(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tok_workforce_review_exchange(uuid,boolean) TO authenticated;

-- Preserve attestations: no silent edit or deletion of an already validated entry.
CREATE FUNCTION public.tok_workforce_guard_validated_entry() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.tok_workforce_validations v WHERE v.time_entry_id=OLD.id)
    AND NOT public.auth_is_admin() THEN
    RAISE EXCEPTION 'A validated time entry cannot be modified';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER tok_workforce_lock_approved_hours BEFORE UPDATE OR DELETE
ON public.tok_workforce_time_entries FOR EACH ROW
EXECUTE FUNCTION public.tok_workforce_guard_validated_entry();
REVOKE ALL ON FUNCTION public.tok_workforce_guard_validated_entry() FROM PUBLIC,anon,authenticated;
