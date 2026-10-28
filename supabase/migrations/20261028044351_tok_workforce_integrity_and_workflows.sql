-- TOK Équipe: additive integrity, signed versions and complete employee workflows.
-- Existing attestations remain readable; only new attestations carry a snapshot.
BEGIN;

ALTER TABLE public.tok_workforce_time_entries
  ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0);
ALTER TABLE public.tok_workforce_validations
  ADD COLUMN entry_version integer CHECK (entry_version > 0),
  ADD COLUMN entry_snapshot jsonb,
  ADD COLUMN entry_hash text CHECK (entry_hash IS NULL OR entry_hash ~ '^[a-f0-9]{64}$');
ALTER TABLE public.tok_workforce_requests
  ADD CONSTRAINT tok_workforce_requests_restaurant_id_key UNIQUE (restaurant_id, id),
  ADD COLUMN requested_entry_id uuid,
  ADD COLUMN requested_entry_version integer CHECK (requested_entry_version > 0),
  ADD COLUMN requested_start_time time,
  ADD COLUMN requested_end_time time,
  ADD COLUMN requested_break_minutes integer CHECK (requested_break_minutes BETWEEN 0 AND 720),
  ADD COLUMN review_note text CHECK (review_note IS NULL OR char_length(review_note) <= 2000),
  ADD COLUMN previous_entry_snapshot jsonb,
  ADD COLUMN applied_entry_snapshot jsonb,
  ADD CONSTRAINT tok_workforce_request_entry_fk FOREIGN KEY (restaurant_id, requested_entry_id)
    REFERENCES public.tok_workforce_time_entries(restaurant_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT tok_workforce_request_correction_shape CHECK (
    (requested_entry_id IS NULL AND requested_entry_version IS NULL
      AND requested_start_time IS NULL AND requested_end_time IS NULL AND requested_break_minutes IS NULL)
    OR (request_type = 'correction' AND requested_entry_id IS NOT NULL AND requested_entry_version IS NOT NULL
      AND requested_start_time IS NOT NULL AND requested_end_time IS NOT NULL AND requested_break_minutes IS NOT NULL)
  );
ALTER TABLE public.tok_workforce_absences
  ADD COLUMN source_request_id uuid UNIQUE,
  ADD CONSTRAINT tok_workforce_absence_source_request_fk FOREIGN KEY (restaurant_id, source_request_id)
    REFERENCES public.tok_workforce_requests(restaurant_id, id) ON DELETE RESTRICT;
-- Only the review RPC may attach the approved-request provenance. Ordinary
-- inserts retain all existing input columns but cannot manufacture this link.
REVOKE INSERT ON public.tok_workforce_absences FROM authenticated;
GRANT INSERT (id, restaurant_id, employee_id, absence_type, start_date, end_date,
  days_count, notes, created_at, updated_at) ON public.tok_workforce_absences TO authenticated;
ALTER TABLE public.tok_workforce_exchanges
  ADD COLUMN target_accepted_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  ADD COLUMN requester_shift_updated_at timestamptz,
  ADD COLUMN target_shift_updated_at timestamptz,
  ADD COLUMN cancelled_at timestamptz,
  ADD COLUMN cancelled_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  DROP CONSTRAINT tok_workforce_exchanges_manager_notes_check,
  ADD CONSTRAINT tok_workforce_exchanges_manager_notes_check
    CHECK (manager_notes IS NULL OR char_length(manager_notes) <= 2000);
CREATE INDEX tok_workforce_request_entry_idx ON public.tok_workforce_requests(restaurant_id, requested_entry_id)
  WHERE requested_entry_id IS NOT NULL;

CREATE TABLE public.tok_workforce_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  holiday_date date NOT NULL,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 150),
  is_national boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, holiday_date)
);
ALTER TABLE public.tok_workforce_holidays ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tok_workforce_holidays FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tok_workforce_holidays TO authenticated;
CREATE POLICY tok_workforce_holidays_manage ON public.tok_workforce_holidays FOR ALL TO authenticated
  USING (public.tok_workforce_can_manage(restaurant_id))
  WITH CHECK (public.tok_workforce_can_manage(restaurant_id));
CREATE POLICY tok_workforce_holidays_read ON public.tok_workforce_holidays FOR SELECT TO authenticated
  USING (public.tok_workforce_can_schedule(restaurant_id) OR (
    public.tok_workforce_enabled(restaurant_id) AND EXISTS (
      SELECT 1 FROM public.tok_workforce_employees e
      WHERE e.restaurant_id = tok_workforce_holidays.restaurant_id
        AND e.user_id = (SELECT auth.uid()) AND e.is_active
    )
  ));

-- Every scheduling/attestation write takes this same tenant lock. A direct UPDATE
-- may already own a row lock when its trigger runs: never wait for the advisory
-- lock in that case. A retryable failure prevents a lock-order deadlock and also
-- prevents concurrent shift/absence or validation/correction write skew.
CREATE FUNCTION public.tok_workforce_lock_restaurant(p_restaurant_id uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_restaurant_id IS NULL OR NOT pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended('tok_workforce_write:' || p_restaurant_id::text, 0)) THEN
    RAISE EXCEPTION 'Cette équipe est en cours de modification. Réessayez.' USING ERRCODE = '40001';
  END IF;
END $$;

-- Wall-clock intervals are Swiss local dates/times; a smaller end time means
-- the following day. Keep seconds (including fractions) for clock-generated rows.
CREATE FUNCTION public.tok_workforce_duration_seconds(p_start time, p_end time, p_break integer)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE v_seconds numeric;
BEGIN
  IF p_start IS NULL OR p_end IS NULL OR p_break IS NULL
    OR p_start >= time '24:00' OR p_end >= time '24:00' OR p_start = p_end THEN
    RAISE EXCEPTION 'Les heures de début et de fin sont invalides.' USING ERRCODE = '22023';
  END IF;
  v_seconds := EXTRACT(EPOCH FROM p_end) - EXTRACT(EPOCH FROM p_start);
  IF v_seconds < 0 THEN v_seconds := v_seconds + 86400; END IF;
  IF p_break < 0 OR p_break > 720 OR p_break * 60 >= v_seconds THEN
    RAISE EXCEPTION 'La pause doit être inférieure à la durée du service.' USING ERRCODE = '22023';
  END IF;
  RETURN v_seconds - p_break * 60;
END $$;

CREATE FUNCTION public.tok_workforce_local_interval(p_date date, p_start time, p_end time)
RETURNS tsrange LANGUAGE sql IMMUTABLE STRICT SET search_path = '' AS $$
  SELECT pg_catalog.tsrange(p_date + p_start,
    p_date + p_end + CASE WHEN p_end < p_start THEN interval '1 day' ELSE interval '0 days' END, '[)')
$$;

CREATE FUNCTION public.tok_workforce_entry_integrity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_interval tsrange; v_midnight timestamp;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.restaurant_id IS DISTINCT FROM OLD.restaurant_id OR NEW.id IS DISTINCT FROM OLD.id) THEN
    RAISE EXCEPTION 'Le restaurant et l’identité du relevé sont immuables.' USING ERRCODE = '22023';
  END IF;
  PERFORM public.tok_workforce_lock_restaurant(NEW.restaurant_id);
  PERFORM public.tok_workforce_duration_seconds(NEW.start_time, NEW.end_time, NEW.break_minutes);
  v_interval := public.tok_workforce_local_interval(NEW.entry_date, NEW.start_time, NEW.end_time);
  v_midnight := NEW.entry_date::timestamp;
  NEW.is_night_work := v_interval && pg_catalog.tsrange(v_midnight, v_midnight + interval '6 hours', '[)')
    OR v_interval && pg_catalog.tsrange(v_midnight + interval '23 hours', v_midnight + interval '30 hours', '[)');
  NEW.is_sunday_work := EXTRACT(ISODOW FROM NEW.entry_date) = 7
    OR (EXTRACT(ISODOW FROM NEW.entry_date + 1) = 7 AND upper(v_interval) > v_midnight + interval '1 day');
  IF TG_OP = 'INSERT' THEN
    NEW.version := 1;
    NEW.created_at := clock_timestamp();
    NEW.created_by := auth.uid();
  ELSE
    NEW.version := OLD.version + CASE WHEN
      ROW(NEW.employee_id, NEW.entry_date, NEW.start_time, NEW.end_time, NEW.break_minutes, NEW.notes)
      IS DISTINCT FROM ROW(OLD.employee_id, OLD.entry_date, OLD.start_time, OLD.end_time, OLD.break_minutes, OLD.notes)
      THEN 1 ELSE 0 END;
    NEW.created_at := OLD.created_at;
    NEW.created_by := OLD.created_by;
  END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END $$;
CREATE TRIGGER tok_workforce_entry_integrity BEFORE INSERT OR UPDATE
  ON public.tok_workforce_time_entries FOR EACH ROW EXECUTE FUNCTION public.tok_workforce_entry_integrity();

CREATE OR REPLACE FUNCTION public.tok_workforce_guard_validated_entry()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.tok_workforce_lock_restaurant(OLD.restaurant_id);
  IF EXISTS (SELECT 1 FROM public.tok_workforce_validations v WHERE v.time_entry_id = OLD.id) THEN
    RAISE EXCEPTION 'Ce relevé est signé. Une correction ne peut pas modifier son contenu.' USING ERRCODE = '55000';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

CREATE OR REPLACE FUNCTION public.tok_workforce_prevent_shift_absence_conflict()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.restaurant_id IS DISTINCT FROM OLD.restaurant_id OR NEW.id IS DISTINCT FROM OLD.id) THEN
    RAISE EXCEPTION 'Le restaurant et l’identité de cet élément sont immuables.' USING ERRCODE = '22023';
  END IF;
  PERFORM public.tok_workforce_lock_restaurant(CASE WHEN TG_OP = 'DELETE' THEN OLD.restaurant_id ELSE NEW.restaurant_id END);
  IF TG_OP = 'DELETE' THEN
    IF TG_TABLE_NAME = 'tok_workforce_absences' THEN
      IF OLD.source_request_id IS NOT NULL THEN
        RAISE EXCEPTION 'Cette absence provient d’un congé approuvé et doit être conservée.' USING ERRCODE = '55000';
      END IF;
    END IF;
    RETURN OLD;
  END IF;
  IF TG_TABLE_NAME = 'tok_workforce_shifts' THEN
    PERFORM public.tok_workforce_duration_seconds(NEW.start_time, NEW.end_time, NEW.break_minutes);
    IF NEW.status <> 'cancelled' AND EXISTS (
      SELECT 1 FROM public.tok_workforce_absences a
      WHERE a.restaurant_id = NEW.restaurant_id AND a.employee_id = NEW.employee_id
        AND public.tok_workforce_local_interval(NEW.shift_date, NEW.start_time, NEW.end_time)
          && pg_catalog.tsrange(a.start_date::timestamp, (a.end_date + 1)::timestamp, '[)')
    ) THEN RAISE EXCEPTION 'Ce service empiète sur une absence du collaborateur.' USING ERRCODE = '23514'; END IF;
  ELSE
    IF NEW.end_date < NEW.start_date OR NEW.days_count <= 0 OR NEW.days_count > NEW.end_date - NEW.start_date + 1 THEN
      RAISE EXCEPTION 'La durée de l’absence dépasse sa période.' USING ERRCODE = '22023';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.source_request_id IS DISTINCT FROM OLD.source_request_id THEN
      RAISE EXCEPTION 'Le lien avec la demande approuvée est immuable.' USING ERRCODE = '22023';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.source_request_id IS NOT NULL AND
      ROW(NEW.employee_id, NEW.absence_type, NEW.start_date, NEW.end_date, NEW.days_count)
      IS DISTINCT FROM ROW(OLD.employee_id, OLD.absence_type, OLD.start_date, OLD.end_date, OLD.days_count) THEN
      RAISE EXCEPTION 'Les dates et la durée d’un congé approuvé sont protégées.' USING ERRCODE = '55000';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.tok_workforce_shifts s
      WHERE s.restaurant_id = NEW.restaurant_id AND s.employee_id = NEW.employee_id AND s.status <> 'cancelled'
        AND public.tok_workforce_local_interval(s.shift_date, s.start_time, s.end_time)
          && pg_catalog.tsrange(NEW.start_date::timestamp, (NEW.end_date + 1)::timestamp, '[)')
    ) THEN RAISE EXCEPTION 'Un service est planifié pendant cette absence. Ajustez le planning.' USING ERRCODE = '23514'; END IF;
    IF EXISTS (
      SELECT 1 FROM public.tok_workforce_absences a
      WHERE a.restaurant_id = NEW.restaurant_id AND a.employee_id = NEW.employee_id AND a.id <> NEW.id
        AND a.start_date <= NEW.end_date AND a.end_date >= NEW.start_date
    ) THEN RAISE EXCEPTION 'Une absence existe déjà sur cette période.' USING ERRCODE = '23514'; END IF;
  END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END $$;
-- Replace triggers, not historical migrations: time-only edits must run guards too.
DROP TRIGGER tok_workforce_shift_absence_guard ON public.tok_workforce_shifts;
CREATE TRIGGER tok_workforce_shift_absence_guard BEFORE INSERT OR UPDATE OR DELETE
  ON public.tok_workforce_shifts FOR EACH ROW EXECUTE FUNCTION public.tok_workforce_prevent_shift_absence_conflict();
DROP TRIGGER tok_workforce_absence_shift_guard ON public.tok_workforce_absences;
CREATE TRIGGER tok_workforce_absence_shift_guard BEFORE INSERT OR UPDATE OR DELETE
  ON public.tok_workforce_absences FOR EACH ROW EXECUTE FUNCTION public.tok_workforce_prevent_shift_absence_conflict();

-- Check at statement end, after every row of an atomic two-shift swap has moved.
CREATE FUNCTION public.tok_workforce_prevent_shift_overlap()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_shift public.tok_workforce_shifts%ROWTYPE;
BEGIN
  SELECT * INTO v_shift FROM public.tok_workforce_shifts WHERE id = NEW.id;
  IF FOUND AND v_shift.status <> 'cancelled' AND EXISTS (
    SELECT 1 FROM public.tok_workforce_shifts s
    WHERE s.restaurant_id = v_shift.restaurant_id AND s.employee_id = v_shift.employee_id
      AND s.id <> v_shift.id AND s.status <> 'cancelled'
      AND public.tok_workforce_local_interval(s.shift_date, s.start_time, s.end_time)
        && public.tok_workforce_local_interval(v_shift.shift_date, v_shift.start_time, v_shift.end_time)
  ) THEN RAISE EXCEPTION 'Deux services se chevauchent pour ce collaborateur.' USING ERRCODE = '23514'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER tok_workforce_shift_overlap_guard AFTER INSERT OR UPDATE
  ON public.tok_workforce_shifts DEFERRABLE INITIALLY IMMEDIATE
  FOR EACH ROW EXECUTE FUNCTION public.tok_workforce_prevent_shift_overlap();

CREATE FUNCTION public.tok_workforce_validation_integrity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_entry public.tok_workforce_time_entries%ROWTYPE;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Une attestation signée est immuable.' USING ERRCODE = '55000';
  END IF;
  IF auth.uid() IS NULL OR public.tok_workforce_can_schedule(NEW.restaurant_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Validation non autorisée.' USING ERRCODE = '42501';
  END IF;
  PERFORM public.tok_workforce_lock_restaurant(NEW.restaurant_id);
  SELECT * INTO v_entry FROM public.tok_workforce_time_entries
    WHERE id = NEW.time_entry_id AND restaurant_id = NEW.restaurant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Relevé introuvable.' USING ERRCODE = '42501'; END IF;
  IF NEW.signature_data IS NULL OR char_length(NEW.signature_data) NOT BETWEEN 100 AND 120000
    OR NEW.signature_data !~ '^data:image/png;base64,[A-Za-z0-9+/=]+$' THEN
    RAISE EXCEPTION 'Une signature PNG valide est requise.' USING ERRCODE = '22023';
  END IF;
  NEW.signed_name := btrim(NEW.signed_name);
  NEW.signed_by := auth.uid();
  NEW.signed_at := clock_timestamp();
  NEW.entry_version := v_entry.version;
  NEW.entry_snapshot := to_jsonb(v_entry);
  NEW.entry_hash := encode(sha256(convert_to(NEW.entry_snapshot::text, 'UTF8')), 'hex');
  RETURN NEW;
END $$;
CREATE TRIGGER tok_workforce_validation_integrity BEFORE INSERT OR UPDATE OR DELETE
  ON public.tok_workforce_validations FOR EACH ROW EXECUTE FUNCTION public.tok_workforce_validation_integrity();
REVOKE INSERT, UPDATE, DELETE ON public.tok_workforce_validations FROM authenticated;

CREATE FUNCTION public.tok_workforce_validate_entries(
  p_restaurant_id uuid, p_entry_ids uuid[], p_signed_name text, p_signature_data text,
  p_expected_versions jsonb DEFAULT '{}'::jsonb
) RETURNS SETOF public.tok_workforce_validations
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_id uuid; v_ids uuid[]; v_entry public.tok_workforce_time_entries%ROWTYPE; v_expected text;
BEGIN
  IF auth.uid() IS NULL OR public.tok_workforce_can_schedule(p_restaurant_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Validation non autorisée pour cet établissement.' USING ERRCODE = '42501';
  END IF;
  IF p_entry_ids IS NULL OR cardinality(p_entry_ids) NOT BETWEEN 1 AND 100
    OR array_position(p_entry_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Sélectionnez entre 1 et 100 relevés.' USING ERRCODE = '22023';
  END IF;
  IF p_signed_name IS NULL OR char_length(btrim(p_signed_name)) NOT BETWEEN 2 AND 120
    OR p_signature_data IS NULL OR char_length(p_signature_data) NOT BETWEEN 100 AND 120000
    OR p_signature_data !~ '^data:image/png;base64,[A-Za-z0-9+/=]+$'
    OR p_expected_versions IS NULL OR jsonb_typeof(p_expected_versions) <> 'object' THEN
    RAISE EXCEPTION 'Nom, signature ou versions invalides.' USING ERRCODE = '22023';
  END IF;
  SELECT array_agg(DISTINCT value ORDER BY value) INTO v_ids FROM unnest(p_entry_ids) AS t(value);
  PERFORM public.tok_workforce_lock_restaurant(p_restaurant_id);
  -- Lock in UUID order; validate every row before writing any attestation.
  FOREACH v_id IN ARRAY v_ids LOOP
    SELECT * INTO v_entry FROM public.tok_workforce_time_entries
      WHERE id = v_id AND restaurant_id = p_restaurant_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Un relevé est introuvable ou appartient à un autre établissement.' USING ERRCODE = '42501'; END IF;
    PERFORM public.tok_workforce_duration_seconds(v_entry.start_time, v_entry.end_time, v_entry.break_minutes);
    IF p_expected_versions <> '{}'::jsonb THEN
      v_expected := p_expected_versions ->> v_id::text;
      IF v_expected IS NULL OR v_expected !~ '^[1-9][0-9]{0,9}$' THEN
        RAISE EXCEPTION 'La version de chaque relevé sélectionné est requise.' USING ERRCODE = '22023';
      END IF;
      IF v_expected::bigint <> v_entry.version THEN
        RAISE EXCEPTION 'Un relevé a changé. Rechargez les heures avant de signer.' USING ERRCODE = '40001';
      END IF;
    END IF;
  END LOOP;
  FOREACH v_id IN ARRAY v_ids LOOP
    -- A repeated request returns existing evidence and never replaces its signer.
    IF NOT EXISTS (SELECT 1 FROM public.tok_workforce_validations WHERE time_entry_id = v_id) THEN
      INSERT INTO public.tok_workforce_validations(restaurant_id, time_entry_id, signed_by, signed_name, signature_data)
      VALUES (p_restaurant_id, v_id, auth.uid(), btrim(p_signed_name), p_signature_data);
    END IF;
  END LOOP;
  RETURN QUERY SELECT v.* FROM public.tok_workforce_validations v
    WHERE v.restaurant_id = p_restaurant_id AND v.time_entry_id = ANY(v_ids) ORDER BY v.time_entry_id;
END $$;

CREATE FUNCTION public.tok_workforce_request_integrity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_entry public.tok_workforce_time_entries%ROWTYPE;
BEGIN
  PERFORM public.tok_workforce_lock_restaurant(NEW.restaurant_id);
  NEW.status := 'pending'; NEW.reviewed_by := NULL; NEW.reviewed_at := NULL;
  NEW.review_note := NULL; NEW.previous_entry_snapshot := NULL; NEW.applied_entry_snapshot := NULL;
  NEW.created_at := clock_timestamp(); NEW.updated_at := NEW.created_at;
  IF NOT EXISTS (SELECT 1 FROM public.tok_workforce_employees e
    WHERE e.restaurant_id = NEW.restaurant_id AND e.id = NEW.employee_id AND e.is_active) THEN
    RAISE EXCEPTION 'Collaborateur actif requis.' USING ERRCODE = '42501';
  END IF;
  IF NEW.request_type = 'vacation' AND (NEW.requested_start_date IS NULL
    OR NEW.requested_end_date IS NULL OR NEW.requested_days IS NULL) THEN
    RAISE EXCEPTION 'Indiquez les dates et la durée du congé.' USING ERRCODE = '22023';
  END IF;
  IF NEW.request_type = 'correction' THEN
    SELECT * INTO v_entry FROM public.tok_workforce_time_entries
      WHERE id = NEW.requested_entry_id AND restaurant_id = NEW.restaurant_id AND employee_id = NEW.employee_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Choisissez un relevé de ce collaborateur.' USING ERRCODE = '42501'; END IF;
    IF EXISTS (SELECT 1 FROM public.tok_workforce_validations WHERE time_entry_id = v_entry.id) THEN
      RAISE EXCEPTION 'Un relevé signé ne peut pas être modifié par une demande de correction.' USING ERRCODE = '55000';
    END IF;
    IF NEW.requested_entry_version IS NOT NULL AND NEW.requested_entry_version <> v_entry.version THEN
      RAISE EXCEPTION 'Ce relevé a changé. Rechargez-le avant la demande.' USING ERRCODE = '40001';
    END IF;
    NEW.requested_entry_version := v_entry.version;
    PERFORM public.tok_workforce_duration_seconds(NEW.requested_start_time, NEW.requested_end_time, NEW.requested_break_minutes);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tok_workforce_request_integrity BEFORE INSERT ON public.tok_workforce_requests
  FOR EACH ROW EXECUTE FUNCTION public.tok_workforce_request_integrity();

-- Keep the two-argument endpoint below as a wrapper. The new overload has no
-- default argument, avoiding ambiguous PostgREST overload resolution.
CREATE FUNCTION public.tok_workforce_review_request(p_request_id uuid, p_approve boolean, p_review_note text)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_restaurant uuid; v_request public.tok_workforce_requests%ROWTYPE;
  v_entry public.tok_workforce_time_entries%ROWTYPE; v_before jsonb; v_after jsonb;
BEGIN
  SELECT restaurant_id INTO v_restaurant FROM public.tok_workforce_requests WHERE id = p_request_id;
  IF auth.uid() IS NULL OR v_restaurant IS NULL OR public.tok_workforce_can_schedule(v_restaurant) IS NOT TRUE THEN
    RAISE EXCEPTION 'Demande introuvable ou non autorisée.' USING ERRCODE = '42501';
  END IF;
  IF p_approve IS NULL OR char_length(COALESCE(p_review_note, '')) > 2000 THEN
    RAISE EXCEPTION 'Décision ou note invalide.' USING ERRCODE = '22023';
  END IF;
  PERFORM public.tok_workforce_lock_restaurant(v_restaurant);
  SELECT * INTO v_request FROM public.tok_workforce_requests WHERE id = p_request_id FOR UPDATE;
  IF v_request.status = (CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END) THEN RETURN; END IF;
  IF v_request.status <> 'pending' THEN RAISE EXCEPTION 'Cette demande a déjà été traitée.' USING ERRCODE = '55000'; END IF;
  IF p_approve AND NOT EXISTS (SELECT 1 FROM public.tok_workforce_employees e
    WHERE e.id = v_request.employee_id AND e.restaurant_id = v_restaurant AND e.is_active) THEN
    RAISE EXCEPTION 'Le collaborateur est inactif.' USING ERRCODE = '55000';
  END IF;
  IF p_approve AND v_request.request_type = 'vacation' THEN
    IF v_request.requested_start_date IS NULL OR v_request.requested_end_date IS NULL OR v_request.requested_days IS NULL THEN
      RAISE EXCEPTION 'Cette ancienne demande ne contient pas les dates du congé.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.tok_workforce_absences
      (restaurant_id, employee_id, absence_type, start_date, end_date, days_count, notes, source_request_id)
    VALUES (v_restaurant, v_request.employee_id, 'vacation', v_request.requested_start_date,
      v_request.requested_end_date, v_request.requested_days, NULLIF(btrim(p_review_note), ''), v_request.id);
  ELSIF p_approve AND v_request.request_type = 'correction' THEN
    SELECT * INTO v_entry FROM public.tok_workforce_time_entries
      WHERE id = v_request.requested_entry_id AND restaurant_id = v_restaurant AND employee_id = v_request.employee_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'La correction ne référence pas un relevé valide.' USING ERRCODE = '22023'; END IF;
    IF v_request.requested_entry_version IS DISTINCT FROM v_entry.version THEN
      RAISE EXCEPTION 'Le relevé a changé depuis cette demande. Une nouvelle demande est nécessaire.' USING ERRCODE = '40001';
    END IF;
    IF EXISTS (SELECT 1 FROM public.tok_workforce_validations WHERE time_entry_id = v_entry.id) THEN
      RAISE EXCEPTION 'Ce relevé a été signé depuis la demande.' USING ERRCODE = '55000';
    END IF;
    v_before := to_jsonb(v_entry);
    UPDATE public.tok_workforce_time_entries SET start_time = v_request.requested_start_time,
      end_time = v_request.requested_end_time, break_minutes = v_request.requested_break_minutes
      WHERE id = v_entry.id RETURNING * INTO v_entry;
    v_after := to_jsonb(v_entry);
  END IF;
  UPDATE public.tok_workforce_requests SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
    reviewed_by = auth.uid(), reviewed_at = clock_timestamp(), review_note = NULLIF(btrim(p_review_note), ''),
    previous_entry_snapshot = v_before, applied_entry_snapshot = v_after, updated_at = clock_timestamp()
    WHERE id = p_request_id;
END $$;
CREATE OR REPLACE FUNCTION public.tok_workforce_review_request(p_request_id uuid, p_approve boolean)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.tok_workforce_review_request(p_request_id, p_approve, NULL::text);
END $$;

CREATE FUNCTION public.tok_workforce_exchange_insert_integrity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_requester public.tok_workforce_shifts%ROWTYPE; v_target public.tok_workforce_shifts%ROWTYPE;
BEGIN
  PERFORM public.tok_workforce_lock_restaurant(NEW.restaurant_id);
  -- An INSERT never constitutes consent or a management decision, regardless of
  -- which authenticated caller supplied the payload.
  NEW.status := 'pending'; NEW.target_accepted_at := NULL; NEW.target_accepted_by := NULL;
  NEW.target_response := NULL; NEW.manager_notes := NULL; NEW.reviewed_by := NULL; NEW.reviewed_at := NULL;
  NEW.cancelled_by := NULL; NEW.cancelled_at := NULL;
  NEW.created_at := clock_timestamp(); NEW.updated_at := NEW.created_at;
  IF (SELECT count(*) FROM public.tok_workforce_employees e
    WHERE e.restaurant_id = NEW.restaurant_id AND e.id IN (NEW.requester_id, NEW.target_employee_id) AND e.is_active) <> 2 THEN
    RAISE EXCEPTION 'Deux collaborateurs actifs de cet établissement sont requis.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_requester FROM public.tok_workforce_shifts
    WHERE id = NEW.requester_shift_id AND restaurant_id = NEW.restaurant_id AND employee_id = NEW.requester_id;
  IF NOT FOUND OR v_requester.status NOT IN ('planned', 'confirmed') THEN
    RAISE EXCEPTION 'Le service proposé n’est plus échangeable.' USING ERRCODE = '55000';
  END IF;
  NEW.requester_shift_updated_at := v_requester.updated_at;
  IF NEW.target_shift_id IS NOT NULL THEN
    SELECT * INTO v_target FROM public.tok_workforce_shifts
      WHERE id = NEW.target_shift_id AND restaurant_id = NEW.restaurant_id AND employee_id = NEW.target_employee_id;
    IF NOT FOUND OR v_target.status NOT IN ('planned', 'confirmed') THEN
      RAISE EXCEPTION 'Le service de contrepartie n’est plus échangeable.' USING ERRCODE = '55000';
    END IF;
    NEW.target_shift_updated_at := v_target.updated_at;
  ELSE NEW.target_shift_updated_at := NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tok_workforce_exchange_insert_integrity BEFORE INSERT ON public.tok_workforce_exchanges
  FOR EACH ROW EXECUTE FUNCTION public.tok_workforce_exchange_insert_integrity();

CREATE OR REPLACE FUNCTION public.tok_workforce_respond_exchange(p_exchange_id uuid, p_accept boolean, p_response text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_exchange public.tok_workforce_exchanges%ROWTYPE; v_restaurant uuid;
  v_requester public.tok_workforce_shifts%ROWTYPE; v_target public.tok_workforce_shifts%ROWTYPE;
BEGIN
  SELECT restaurant_id INTO v_restaurant FROM public.tok_workforce_exchanges WHERE id = p_exchange_id;
  IF auth.uid() IS NULL OR v_restaurant IS NULL OR public.tok_workforce_enabled(v_restaurant) IS NOT TRUE THEN
    RAISE EXCEPTION 'Échange indisponible.' USING ERRCODE = '42501';
  END IF;
  PERFORM public.tok_workforce_lock_restaurant(v_restaurant);
  SELECT * INTO v_exchange FROM public.tok_workforce_exchanges WHERE id = p_exchange_id FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM public.tok_workforce_employees e WHERE e.id = v_exchange.target_employee_id
    AND e.restaurant_id = v_restaurant AND e.user_id = auth.uid() AND e.is_active) THEN
    RAISE EXCEPTION 'Seul le collègue destinataire peut répondre.' USING ERRCODE = '42501';
  END IF;
  IF p_accept IS NULL OR char_length(COALESCE(p_response, '')) > 1000 THEN
    RAISE EXCEPTION 'Réponse invalide.' USING ERRCODE = '22023';
  END IF;
  IF NOT p_accept AND v_exchange.status = 'rejected' THEN RETURN; END IF;
  IF v_exchange.status <> 'pending' THEN RAISE EXCEPTION 'Cet échange a déjà été traité.' USING ERRCODE = '55000'; END IF;
  IF v_exchange.target_accepted_by = auth.uid() THEN
    IF p_accept THEN RETURN; END IF;
    RAISE EXCEPTION 'Cet échange a déjà été accepté.' USING ERRCODE = '55000';
  END IF;
  IF p_accept THEN
    SELECT * INTO v_requester FROM public.tok_workforce_shifts
      WHERE id = v_exchange.requester_shift_id AND restaurant_id = v_restaurant AND employee_id = v_exchange.requester_id;
    IF NOT FOUND OR v_requester.status NOT IN ('planned', 'confirmed')
      OR (v_exchange.requester_shift_updated_at IS NOT NULL AND v_requester.updated_at <> v_exchange.requester_shift_updated_at) THEN
      RAISE EXCEPTION 'Le service a changé depuis la demande.' USING ERRCODE = '40001';
    END IF;
    IF v_exchange.target_shift_id IS NOT NULL THEN
      SELECT * INTO v_target FROM public.tok_workforce_shifts
        WHERE id = v_exchange.target_shift_id AND restaurant_id = v_restaurant AND employee_id = v_exchange.target_employee_id;
      IF NOT FOUND OR v_target.status NOT IN ('planned', 'confirmed')
        OR (v_exchange.target_shift_updated_at IS NOT NULL AND v_target.updated_at <> v_exchange.target_shift_updated_at) THEN
        RAISE EXCEPTION 'La contrepartie a changé depuis la demande.' USING ERRCODE = '40001';
      END IF;
    END IF;
  END IF;
  UPDATE public.tok_workforce_exchanges SET
    target_accepted_at = CASE WHEN p_accept THEN clock_timestamp() ELSE NULL END,
    target_accepted_by = CASE WHEN p_accept THEN auth.uid() ELSE NULL END,
    requester_shift_updated_at = CASE WHEN p_accept THEN v_requester.updated_at ELSE requester_shift_updated_at END,
    target_shift_updated_at = CASE WHEN p_accept THEN v_target.updated_at ELSE target_shift_updated_at END,
    status = CASE WHEN p_accept THEN 'pending' ELSE 'rejected' END,
    target_response = NULLIF(btrim(p_response), ''), updated_at = clock_timestamp()
    WHERE id = p_exchange_id;
END $$;

CREATE FUNCTION public.tok_workforce_review_exchange(p_exchange_id uuid, p_approve boolean, p_manager_notes text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_restaurant uuid; v_exchange public.tok_workforce_exchanges%ROWTYPE;
  v_requester public.tok_workforce_shifts%ROWTYPE; v_target public.tok_workforce_shifts%ROWTYPE;
BEGIN
  SELECT restaurant_id INTO v_restaurant FROM public.tok_workforce_exchanges WHERE id = p_exchange_id;
  IF auth.uid() IS NULL OR v_restaurant IS NULL OR public.tok_workforce_can_schedule(v_restaurant) IS NOT TRUE THEN
    RAISE EXCEPTION 'Échange introuvable ou non autorisé.' USING ERRCODE = '42501';
  END IF;
  IF p_approve IS NULL OR char_length(COALESCE(p_manager_notes, '')) > 2000 THEN
    RAISE EXCEPTION 'Décision ou note invalide.' USING ERRCODE = '22023';
  END IF;
  PERFORM public.tok_workforce_lock_restaurant(v_restaurant);
  SELECT * INTO v_exchange FROM public.tok_workforce_exchanges WHERE id = p_exchange_id FOR UPDATE;
  IF v_exchange.status = (CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END) THEN RETURN; END IF;
  IF v_exchange.status <> 'pending' THEN RAISE EXCEPTION 'Cet échange a déjà été traité.' USING ERRCODE = '55000'; END IF;
  IF p_approve THEN
    IF v_exchange.target_accepted_at IS NULL OR v_exchange.target_accepted_by IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.tok_workforce_employees e WHERE e.id = v_exchange.target_employee_id
        AND e.restaurant_id = v_restaurant AND e.is_active AND e.user_id = v_exchange.target_accepted_by
    ) THEN RAISE EXCEPTION 'Le consentement authentifié du collègue est requis.' USING ERRCODE = '55000'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.tok_workforce_employees e
      WHERE e.restaurant_id = v_restaurant AND e.id = v_exchange.requester_id AND e.is_active) THEN
      RAISE EXCEPTION 'Le demandeur n’est plus actif.' USING ERRCODE = '55000';
    END IF;
    PERFORM s.id FROM public.tok_workforce_shifts s WHERE s.restaurant_id = v_restaurant
      AND s.id IN (v_exchange.requester_shift_id, v_exchange.target_shift_id) ORDER BY s.id FOR UPDATE;
    SELECT * INTO v_requester FROM public.tok_workforce_shifts
      WHERE id = v_exchange.requester_shift_id AND restaurant_id = v_restaurant;
    IF NOT FOUND OR v_requester.employee_id <> v_exchange.requester_id
      OR v_requester.status NOT IN ('planned', 'confirmed')
      OR v_requester.updated_at IS DISTINCT FROM v_exchange.requester_shift_updated_at THEN
      RAISE EXCEPTION 'Le service proposé a changé. Créez un nouvel échange.' USING ERRCODE = '40001';
    END IF;
    IF v_exchange.target_shift_id IS NOT NULL THEN
      SELECT * INTO v_target FROM public.tok_workforce_shifts
        WHERE id = v_exchange.target_shift_id AND restaurant_id = v_restaurant;
      IF NOT FOUND OR v_target.employee_id <> v_exchange.target_employee_id
        OR v_target.status NOT IN ('planned', 'confirmed')
        OR v_target.updated_at IS DISTINCT FROM v_exchange.target_shift_updated_at THEN
        RAISE EXCEPTION 'Le service de contrepartie a changé. Créez un nouvel échange.' USING ERRCODE = '40001';
      END IF;
    END IF;
    -- Both rows move in one statement. All AFTER constraints see the final swap.
    UPDATE public.tok_workforce_shifts SET employee_id = CASE
        WHEN id = v_exchange.requester_shift_id THEN v_exchange.target_employee_id ELSE v_exchange.requester_id END
      WHERE restaurant_id = v_restaurant AND id IN (v_exchange.requester_shift_id, v_exchange.target_shift_id);
  END IF;
  UPDATE public.tok_workforce_exchanges SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
    manager_notes = NULLIF(btrim(p_manager_notes), ''), reviewed_at = clock_timestamp(),
    reviewed_by = auth.uid(), updated_at = clock_timestamp() WHERE id = p_exchange_id;
END $$;
CREATE OR REPLACE FUNCTION public.tok_workforce_review_exchange(p_exchange_id uuid, p_approve boolean)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.tok_workforce_review_exchange(p_exchange_id, p_approve, NULL::text);
END $$;

CREATE FUNCTION public.tok_workforce_cancel_exchange(p_exchange_id uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_exchange public.tok_workforce_exchanges%ROWTYPE; v_restaurant uuid;
BEGIN
  SELECT restaurant_id INTO v_restaurant FROM public.tok_workforce_exchanges WHERE id = p_exchange_id;
  IF auth.uid() IS NULL OR v_restaurant IS NULL OR public.tok_workforce_enabled(v_restaurant) IS NOT TRUE THEN
    RAISE EXCEPTION 'Échange indisponible.' USING ERRCODE = '42501';
  END IF;
  PERFORM public.tok_workforce_lock_restaurant(v_restaurant);
  SELECT * INTO v_exchange FROM public.tok_workforce_exchanges WHERE id = p_exchange_id FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM public.tok_workforce_employees e WHERE e.id = v_exchange.requester_id
    AND e.restaurant_id = v_restaurant AND e.user_id = auth.uid() AND e.is_active) THEN
    RAISE EXCEPTION 'Seul le demandeur peut annuler cet échange.' USING ERRCODE = '42501';
  END IF;
  IF v_exchange.status = 'cancelled' THEN RETURN; END IF;
  IF v_exchange.status <> 'pending' THEN RAISE EXCEPTION 'Cet échange ne peut plus être annulé.' USING ERRCODE = '55000'; END IF;
  UPDATE public.tok_workforce_exchanges SET status = 'cancelled', cancelled_by = auth.uid(),
    cancelled_at = clock_timestamp(), updated_at = clock_timestamp() WHERE id = p_exchange_id;
END $$;

CREATE FUNCTION public.tok_workforce_exchange_candidates(
  p_restaurant_id uuid, p_employee_id uuid, p_start_date date, p_end_date date
) RETURNS TABLE(shift_id uuid, employee_id uuid, display_name text, shift_date date,
  start_time time, end_time time, break_minutes integer, status text, updated_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_now timestamp := now() AT TIME ZONE 'Europe/Zurich';
BEGIN
  IF auth.uid() IS NULL OR NOT (public.tok_workforce_can_schedule(p_restaurant_id) OR EXISTS (
    SELECT 1 FROM public.tok_workforce_employees e WHERE e.restaurant_id = p_restaurant_id
      AND e.user_id = auth.uid() AND e.is_active AND public.tok_workforce_enabled(p_restaurant_id)
  )) THEN RAISE EXCEPTION 'Équipe non autorisée.' USING ERRCODE = '42501'; END IF;
  IF p_start_date IS NULL OR p_end_date IS NULL OR p_end_date < p_start_date OR p_end_date - p_start_date > 92 THEN
    RAISE EXCEPTION 'Choisissez une période de 93 jours au maximum.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tok_workforce_employees e
    WHERE e.restaurant_id = p_restaurant_id AND e.id = p_employee_id AND e.is_active) THEN
    RAISE EXCEPTION 'Collaborateur introuvable dans cet établissement.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT s.id, s.employee_id, e.first_name || ' ' || e.last_name, s.shift_date,
    s.start_time, s.end_time, s.break_minutes, s.status, s.updated_at
    FROM public.tok_workforce_shifts s JOIN public.tok_workforce_employees e
      ON e.restaurant_id = s.restaurant_id AND e.id = s.employee_id
    WHERE s.restaurant_id = p_restaurant_id AND s.employee_id = p_employee_id
      AND s.shift_date BETWEEN p_start_date AND p_end_date AND s.status IN ('planned', 'confirmed')
      AND (s.shift_date + s.start_time) >= v_now
    ORDER BY s.shift_date, s.start_time, s.id LIMIT 200;
END $$;

CREATE FUNCTION public.tok_workforce_holiday_metadata()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.restaurant_id IS DISTINCT FROM OLD.restaurant_id OR NEW.id IS DISTINCT FROM OLD.id) THEN
    RAISE EXCEPTION 'Le restaurant et l’identité du jour férié sont immuables.' USING ERRCODE = '22023';
  END IF;
  NEW.name := btrim(NEW.name);
  NEW.created_by := CASE WHEN TG_OP = 'INSERT' THEN auth.uid() ELSE OLD.created_by END;
  NEW.created_at := CASE WHEN TG_OP = 'INSERT' THEN clock_timestamp() ELSE OLD.created_at END;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END $$;
CREATE TRIGGER tok_workforce_holiday_metadata BEFORE INSERT OR UPDATE ON public.tok_workforce_holidays
  FOR EACH ROW EXECUTE FUNCTION public.tok_workforce_holiday_metadata();

REVOKE ALL ON FUNCTION public.tok_workforce_lock_restaurant(uuid),
  public.tok_workforce_duration_seconds(time, time, integer), public.tok_workforce_local_interval(date, time, time),
  public.tok_workforce_entry_integrity(), public.tok_workforce_guard_validated_entry(),
  public.tok_workforce_prevent_shift_absence_conflict(), public.tok_workforce_prevent_shift_overlap(),
  public.tok_workforce_validation_integrity(), public.tok_workforce_request_integrity(),
  public.tok_workforce_exchange_insert_integrity(), public.tok_workforce_holiday_metadata()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tok_workforce_validate_entries(uuid, uuid[], text, text, jsonb),
  public.tok_workforce_review_request(uuid, boolean, text), public.tok_workforce_review_exchange(uuid, boolean, text),
  public.tok_workforce_cancel_exchange(uuid),
  public.tok_workforce_exchange_candidates(uuid, uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tok_workforce_validate_entries(uuid, uuid[], text, text, jsonb),
  public.tok_workforce_review_request(uuid, boolean, text), public.tok_workforce_review_exchange(uuid, boolean, text),
  public.tok_workforce_cancel_exchange(uuid),
  public.tok_workforce_exchange_candidates(uuid, uuid, date, date) TO authenticated;

-- Add only the new Workforce resources. Preserve the existing launch behavior.
CREATE OR REPLACE FUNCTION public.launch_table_allowed(p_table text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(auth.role() = 'anon', false)
    OR NOT public.launch_gate_enabled()
    OR coalesce(auth.role()='service_role',false)
    OR public.has_role(auth.uid(),'admin')
    OR (coalesce(auth.role()='authenticated',false) AND auth.uid() IS NOT NULL
      AND p_table=ANY(ARRAY[
        'tok_workforce_settings','tok_workforce_employees','tok_workforce_shifts',
        'tok_workforce_time_entries','tok_workforce_validations','tok_workforce_absences',
        'tok_workforce_requests','tok_workforce_exchanges','tok_workforce_clock_sessions',
        'tok_workforce_clock_events','tok_workforce_invitations','tok_workforce_holidays']))
    OR p_table=ANY(ARRAY['feature_flags','profiles','user_profiles','user_roles',
      'signup_applications','signup_application_drafts','signup_application_documents',
      'restaurant_subscription_plans','legal_acceptances','user_legal_acceptances',
      'platform_settings','cities','cuisines'])
    OR ((public.has_role(auth.uid(),'restaurateur')) AND p_table=ANY(ARRAY[
      'restaurants','restaurant_branches','restaurant_cuisines','menu_items',
      'restaurant_media','meal_formula_categories','meal_formulas','anti_waste_offers',
      'flash_sales','floor_plan_variants','reservation_slots','reservation_tables',
      'reservation_table_layout_overrides','reservation_progressive_offers',
      'restaurant_preferred_tables','restaurant_promotions','restaurant_invoice_settings',
      'restaurant_ai_subscriptions','restaurant_subscriptions','restaurant_ai_profiles',
      'restaurant_social_links','restaurant_billing_accounts','restaurant_billing_ledger',
      'notifications','support_incidents','support_messages']))
    OR public.has_role(auth.uid(),'courier')
    OR public.has_role(auth.uid(),'commercial')
$$;
CREATE OR REPLACE FUNCTION public.launch_rpc_allowed(p_rpc text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT NOT public.launch_gate_enabled() OR coalesce(auth.role()='service_role',false)
    OR public.has_role(auth.uid(),'admin')
    OR (coalesce(auth.role()='authenticated',false) AND auth.uid() IS NOT NULL
      AND p_rpc=ANY(ARRAY[
        'tok_workforce_my_restaurants','tok_workforce_claim_employee',
        'tok_workforce_invite_employee','tok_workforce_list_invitations',
        'tok_workforce_revoke_invitation','tok_workforce_punch',
        'tok_workforce_team_directory','tok_workforce_respond_exchange',
        'tok_workforce_review_exchange','tok_workforce_review_request',
        'tok_workforce_cancel_exchange','tok_workforce_exchange_candidates','tok_workforce_validate_entries',
        'tok_workforce_can_schedule','tok_workforce_enabled']))
    OR p_rpc=ANY(ARRAY['get_launch_gate_state','has_role','is_feature_flag_active',
      'sync_signup_application','get_my_signup_application'])
    OR (coalesce(auth.role() = 'anon', false) AND p_rpc=ANY(ARRAY[
      'search_restaurants_catalog_page','get_total_donated_points']))
    OR (public.has_role(auth.uid(),'restaurateur') AND p_rpc=ANY(ARRAY[
      'restaurant_set_cuisines','get_my_restaurant_ai_subscriptions',
      'get_my_restaurant_billing_account','get_restaurant_billing_summary']))
    OR public.has_role(auth.uid(),'courier') OR public.has_role(auth.uid(),'commercial')
$$;
NOTIFY pgrst, 'reload schema';
COMMIT;
