-- Invitations TOK Équipe: account linking remains voluntary and requires
-- the recipient's verified Auth email. No password, token or platform role is issued.
BEGIN;

CREATE TABLE public.tok_workforce_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL UNIQUE,
  email text NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254),
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email_queue_id uuid REFERENCES public.email_queue(id) ON DELETE SET NULL,
  FOREIGN KEY (restaurant_id, employee_id)
    REFERENCES public.tok_workforce_employees(restaurant_id, id) ON DELETE CASCADE,
  CHECK (expires_at > invited_at),
  CHECK (accepted_at IS NULL OR revoked_at IS NULL)
);
CREATE INDEX tok_workforce_invitations_restaurant_idx
  ON public.tok_workforce_invitations(restaurant_id, invited_at DESC);
CREATE INDEX email_queue_workforce_invitation_rate_idx
  ON public.email_queue((metadata->>'restaurant_id'), created_at DESC)
  WHERE metadata->>'type' = 'tok_workforce_invitation';

ALTER TABLE public.tok_workforce_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tok_workforce_invitations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.tok_workforce_invitations TO authenticated;
GRANT ALL ON public.tok_workforce_invitations TO service_role;
CREATE POLICY tok_workforce_invitations_manager_read
  ON public.tok_workforce_invitations FOR SELECT TO authenticated
  USING (public.tok_workforce_can_manage(restaurant_id));

-- The browser may edit a personnel file but cannot associate somebody else's
-- Auth account. Only a trusted server operation (including the claim RPC) may link it.
CREATE FUNCTION public.tok_workforce_guard_account_link() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') AND (
    (TG_OP = 'INSERT' AND NEW.user_id IS NOT NULL)
    OR (TG_OP = 'UPDATE' AND NEW.user_id IS DISTINCT FROM OLD.user_id)
  ) THEN
    RAISE EXCEPTION 'Le compte doit être associé par le collaborateur depuis son invitation.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tok_workforce_guard_account_link
  BEFORE INSERT OR UPDATE OF user_id ON public.tok_workforce_employees
  FOR EACH ROW EXECUTE FUNCTION public.tok_workforce_guard_account_link();
REVOKE ALL ON FUNCTION public.tok_workforce_guard_account_link() FROM PUBLIC, anon, authenticated;

-- Deactivation also removes direct employee reads, not only the portal entry.
DROP POLICY IF EXISTS tok_workforce_employees_self ON public.tok_workforce_employees;
CREATE POLICY tok_workforce_employees_self
  ON public.tok_workforce_employees FOR SELECT TO authenticated
  USING (is_active AND user_id = (SELECT auth.uid())
    AND public.tok_workforce_enabled(restaurant_id));

CREATE FUNCTION public.tok_workforce_invite_employee(
  p_restaurant_id uuid, p_employee_id uuid, p_email text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_employee public.tok_workforce_employees%ROWTYPE;
  v_invite public.tok_workforce_invitations%ROWTYPE;
  v_queue public.email_queue%ROWTYPE;
  v_email text;
  v_restaurant text;
  v_demo boolean;
  v_now timestamptz := now();
  v_expires timestamptz;
  v_queue_id uuid;
  v_link text;
  v_name_html text;
  v_restaurant_html text;
  v_email_html text;
BEGIN
  IF v_actor IS NULL OR public.tok_workforce_can_manage(p_restaurant_id) IS NOT TRUE
    OR public.tok_workforce_enabled(p_restaurant_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Accès à la gestion de cette équipe refusé.' USING ERRCODE = '42501';
  END IF;
  SELECT left(regexp_replace(r.name, E'[\r\n]+', ' ', 'g'), 150), r.is_demo
    INTO v_restaurant, v_demo FROM public.restaurants r WHERE r.id = p_restaurant_id;
  IF COALESCE(v_demo, false) THEN
    RAISE EXCEPTION 'Les invitations réelles sont désactivées dans le restaurant de démonstration.';
  END IF;
  SELECT * INTO v_employee FROM public.tok_workforce_employees
    WHERE restaurant_id = p_restaurant_id AND id = p_employee_id FOR UPDATE;
  IF NOT FOUND OR NOT v_employee.is_active THEN
    RAISE EXCEPTION 'Collaborateur introuvable ou inactif.' USING ERRCODE = '42501';
  END IF;
  IF v_employee.user_id IS NOT NULL THEN
    RAISE EXCEPTION 'Ce collaborateur dispose déjà de son accès TOK.';
  END IF;
  v_email := lower(btrim(CASE WHEN p_email IS NULL THEN v_employee.email ELSE p_email END));
  IF v_email IS NULL OR char_length(v_email) > 254
    OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Renseignez une adresse e-mail valide.' USING ERRCODE = '22023';
  END IF;

  -- Same lock order as claim/revoke: employee, then invitation. A restaurant
  -- advisory lock makes hourly quotas deterministic across multiple employees.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('tok_workforce_invitation:' || p_restaurant_id::text, 0));
  SELECT * INTO v_invite FROM public.tok_workforce_invitations
    WHERE restaurant_id = p_restaurant_id AND employee_id = p_employee_id FOR UPDATE;
  IF v_invite.id IS NOT NULL THEN
    SELECT * INTO v_queue FROM public.email_queue WHERE id = v_invite.email_queue_id;
    IF v_invite.email = v_email AND v_invite.revoked_at IS NULL
      AND v_invite.accepted_at IS NULL AND v_invite.expires_at > v_now THEN
      IF v_queue.status IN ('queued', 'processing')
        OR (v_queue.status = 'sent' AND v_invite.invited_at > v_now - interval '60 seconds') THEN
        RETURN jsonb_build_object('invitation_id', v_invite.id,
          'employee_id', p_employee_id, 'email', v_email,
          'expires_at', v_invite.expires_at,
          'delivery_status', v_queue.status, 'reused', true);
      END IF;
      -- A timeout can occur after provider acceptance. Reuse the exact queued
      -- body and ID so the worker keeps the same provider idempotency key.
      IF v_queue.status = 'failed' AND v_invite.invited_at <= v_now - interval '60 seconds' THEN
        IF COALESCE((v_queue.metadata->>'workforce_retry_count')::integer, 0) >= 5 THEN
          RAISE EXCEPTION 'Cet envoi a déjà été relancé cinq fois. Contactez le support TOK.';
        END IF;
        UPDATE public.email_queue SET status = 'queued', error = NULL,
          metadata = metadata || jsonb_build_object('workforce_retry_count',
            COALESCE((metadata->>'workforce_retry_count')::integer, 0) + 1)
          WHERE id = v_queue.id AND status = 'failed';
        UPDATE public.tok_workforce_invitations SET invited_at = v_now, invited_by = v_actor
          WHERE id = v_invite.id;
        RETURN jsonb_build_object('invitation_id', v_invite.id,
          'employee_id', p_employee_id, 'email', v_email,
          'expires_at', v_invite.expires_at, 'delivery_status', 'queued', 'reused', true);
      END IF;
    END IF;
    IF v_invite.invited_at > v_now - interval '60 seconds' THEN
      RAISE EXCEPTION 'Attendez une minute avant de renvoyer ou modifier cette invitation.';
    END IF;
  END IF;
  IF (SELECT count(*) FROM public.email_queue q
      WHERE q.metadata->>'type' = 'tok_workforce_invitation'
        AND q.metadata->>'restaurant_id' = p_restaurant_id::text
        AND q.created_at > v_now - interval '1 hour') >= 100 THEN
    RAISE EXCEPTION 'La limite de 100 invitations par heure pour cet établissement est atteinte.';
  END IF;
  IF (SELECT count(*) FROM public.email_queue q
      WHERE q.metadata->>'type' = 'tok_workforce_invitation'
        AND q.metadata->>'restaurant_id' = p_restaurant_id::text
        AND q.metadata->>'employee_id' = p_employee_id::text
        AND q.created_at > v_now - interval '24 hours') >= 5 THEN
    RAISE EXCEPTION 'La limite de 5 invitations par jour pour ce collaborateur est atteinte.';
  END IF;

  -- The address and the outbox record commit together. No caller-supplied URL,
  -- content, role or user_id is accepted.
  UPDATE public.tok_workforce_employees SET email = v_email, updated_at = v_now
    WHERE restaurant_id = p_restaurant_id AND id = p_employee_id;
  UPDATE public.email_queue SET status = 'cancelled'
    WHERE id = v_invite.email_queue_id AND status IN ('queued', 'failed');
  v_expires := v_now + interval '7 days';
  v_link := 'https://www.thetok.ch/equipe/mon-espace?restaurant=' || p_restaurant_id::text;
  v_name_html := replace(replace(replace(replace(replace(
    v_employee.first_name, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;');
  v_restaurant_html := replace(replace(replace(replace(replace(
    v_restaurant, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;');
  v_email_html := replace(replace(replace(replace(replace(
    v_email, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;');

  INSERT INTO public.email_queue(to_email, subject, body_text, body_html, status, metadata)
  VALUES (
    v_email,
    'Votre invitation à rejoindre ' || v_restaurant || ' sur TOK Équipe',
    format(E'Bonjour %s,\n\n%s vous invite à rejoindre son équipe sur TOK.\n\nRetrouvez votre vue d’ensemble, votre planning, vos heures, votre badgeuse, vos compteurs et vos demandes.\n\nRejoindre mon équipe : %s\n\nConnectez-vous ou créez votre compte TOK avec cette adresse : %s. Confirmez votre adresse e-mail, puis acceptez l’invitation dans votre espace collaborateur.\n\nInvitation valable jusqu’au %s. Votre accès reste limité à vos données et aux responsabilités confiées par votre établissement.\n\nL’équipe TOK',
      v_employee.first_name, v_restaurant, v_link, v_email,
      to_char(v_expires AT TIME ZONE 'Europe/Zurich', 'DD.MM.YYYY "à" HH24:MI')),
    format('<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:#fff7ed;font-family:Arial,sans-serif;color:#292524"><table role="presentation" style="width:100%%;padding:24px"><tr><td align="center"><table role="presentation" style="width:100%%;max-width:600px;background:#ffffff;border-radius:18px"><tr><td style="padding:28px"><img src="https://www.thetok.ch/logotok.png" width="96" alt="TOK" style="display:block;max-width:100%%;height:auto"><p style="color:#ea580c;font-weight:bold">TOK ÉQUIPE · INVITATION</p><h1 style="font-size:26px">Bienvenue dans votre équipe</h1><p>Bonjour %s,</p><p><strong>%s</strong> vous invite à accéder à votre espace collaborateur TOK.</p><p>Votre vue d’ensemble réunit votre planning, vos heures, la badgeuse, vos compteurs et vos demandes.</p><p style="margin:28px 0"><a href="%s" style="display:inline-block;background:#ea580c;color:#ffffff;border-radius:10px;padding:14px 22px;text-decoration:none;font-weight:bold">Rejoindre mon équipe</a></p><p>Connectez-vous ou créez votre compte avec <strong>%s</strong>. Vérifiez votre adresse e-mail, puis acceptez l’invitation.</p><p style="font-size:13px;color:#57534e">Invitation valable jusqu’au %s. Votre espace est personnel ; les données des autres établissements restent privées.</p><p style="font-size:13px;color:#57534e">L’équipe TOK</p></td></tr></table></td></tr></table></body></html>',
      v_name_html, v_restaurant_html, v_link, v_email_html,
      to_char(v_expires AT TIME ZONE 'Europe/Zurich', 'DD.MM.YYYY "à" HH24:MI')),
    'queued',
    jsonb_build_object('type', 'tok_workforce_invitation',
      'restaurant_id', p_restaurant_id, 'employee_id', p_employee_id, 'invited_by', v_actor)
  ) RETURNING id INTO v_queue_id;

  INSERT INTO public.tok_workforce_invitations(
    restaurant_id, employee_id, email, invited_by, invited_at, expires_at, email_queue_id)
  VALUES (p_restaurant_id, p_employee_id, v_email, v_actor, v_now, v_expires, v_queue_id)
  ON CONFLICT (employee_id) DO UPDATE SET
    email = EXCLUDED.email, invited_by = EXCLUDED.invited_by,
    invited_at = EXCLUDED.invited_at, expires_at = EXCLUDED.expires_at,
    email_queue_id = EXCLUDED.email_queue_id,
    accepted_at = NULL, accepted_by = NULL, revoked_at = NULL, revoked_by = NULL
  RETURNING * INTO v_invite;
  RETURN jsonb_build_object('invitation_id', v_invite.id,
    'employee_id', p_employee_id, 'email', v_email, 'expires_at', v_expires,
    'delivery_status', 'queued', 'reused', false);
END $$;

CREATE FUNCTION public.tok_workforce_list_invitations(p_restaurant_id uuid)
RETURNS TABLE(invitation_id uuid, employee_id uuid, email text,
  invited_at timestamptz, expires_at timestamptz, accepted_at timestamptz,
  revoked_at timestamptz, delivery_status text, provider_status text, sent_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.tok_workforce_can_manage(p_restaurant_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Accès aux invitations de cette équipe refusé.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT i.id, i.employee_id, i.email, i.invited_at, i.expires_at,
    i.accepted_at, i.revoked_at, COALESCE(q.status, 'unknown'), q.provider_status, q.sent_at
  FROM public.tok_workforce_invitations i
  JOIN public.tok_workforce_employees e
    ON e.id = i.employee_id AND e.restaurant_id = i.restaurant_id
  LEFT JOIN public.email_queue q ON q.id = i.email_queue_id
  WHERE i.restaurant_id = p_restaurant_id
  ORDER BY e.last_name, e.id LIMIT 200;
END $$;

CREATE FUNCTION public.tok_workforce_revoke_invitation(p_restaurant_id uuid, p_employee_id uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_employee public.tok_workforce_employees%ROWTYPE; v_queue_id uuid;
BEGIN
  IF auth.uid() IS NULL OR public.tok_workforce_can_manage(p_restaurant_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Accès à la gestion de cette équipe refusé.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_employee FROM public.tok_workforce_employees
    WHERE id = p_employee_id AND restaurant_id = p_restaurant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Collaborateur introuvable.' USING ERRCODE = '42501'; END IF;
  IF v_employee.user_id IS NOT NULL THEN
    RAISE EXCEPTION 'L’accès est déjà activé. Désactivez la fiche pour retirer l’accès.';
  END IF;
  UPDATE public.tok_workforce_invitations SET revoked_at = now(), revoked_by = auth.uid()
    WHERE restaurant_id = p_restaurant_id AND employee_id = p_employee_id
      AND accepted_at IS NULL AND revoked_at IS NULL
    RETURNING email_queue_id INTO v_queue_id;
  UPDATE public.email_queue SET status = 'cancelled'
    WHERE id = v_queue_id AND status IN ('queued', 'failed');
END $$;

-- Existing linked accounts keep their access. Unlinked personnel files now
-- require an explicit, current invitation before they can be claimed.
CREATE OR REPLACE FUNCTION public.tok_workforce_my_restaurants()
RETURNS TABLE(restaurant_id uuid, employee_id uuid, restaurant_name text, linked boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT e.restaurant_id, e.id, r.name, COALESCE(e.user_id = u.id, false)
  FROM public.tok_workforce_employees e
  JOIN public.restaurants r ON r.id = e.restaurant_id
  JOIN public.tok_workforce_settings s ON s.restaurant_id = e.restaurant_id AND s.enabled
  JOIN auth.users u ON u.id = (SELECT auth.uid())
  LEFT JOIN public.tok_workforce_invitations i
    ON i.employee_id = e.id AND i.restaurant_id = e.restaurant_id
  WHERE e.is_active AND (
    e.user_id = u.id OR (
      e.user_id IS NULL AND u.email_confirmed_at IS NOT NULL
      AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now()
      AND i.email = lower(btrim(u.email)) AND i.email = lower(btrim(e.email))
    )
  )
  ORDER BY r.name, e.id LIMIT 50;
$$;

CREATE OR REPLACE FUNCTION public.tok_workforce_claim_employee(p_restaurant_id uuid)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid(); v_email text;
  v_employee public.tok_workforce_employees%ROWTYPE;
  v_invite public.tok_workforce_invitations%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Connexion requise.' USING ERRCODE = '42501'; END IF;
  SELECT lower(btrim(email)) INTO v_email FROM auth.users
    WHERE id = v_actor AND email_confirmed_at IS NOT NULL;
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Confirmez votre adresse e-mail avant d’accepter l’invitation.' USING ERRCODE = '42501';
  END IF;
  IF public.tok_workforce_enabled(p_restaurant_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Cet espace collaborateur est désactivé.' USING ERRCODE = '42501';
  END IF;
  -- Serialize claims by the same account as well as by the personnel file.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('tok_workforce_claim:' || p_restaurant_id::text || ':' || v_actor::text, 0));
  SELECT * INTO v_employee FROM public.tok_workforce_employees
    WHERE restaurant_id = p_restaurant_id AND user_id = v_actor AND is_active
    ORDER BY id LIMIT 1 FOR UPDATE;
  IF FOUND THEN RETURN v_employee.id; END IF;
  SELECT * INTO v_employee FROM public.tok_workforce_employees
    WHERE restaurant_id = p_restaurant_id AND user_id IS NULL AND is_active
      AND lower(btrim(email)) = v_email FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aucune invitation active ne correspond à votre compte.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_invite FROM public.tok_workforce_invitations
    WHERE restaurant_id = p_restaurant_id AND employee_id = v_employee.id FOR UPDATE;
  IF NOT FOUND OR v_invite.revoked_at IS NOT NULL OR v_invite.accepted_at IS NOT NULL
    OR v_invite.expires_at <= now() OR v_invite.email IS DISTINCT FROM v_email THEN
    RAISE EXCEPTION 'Cette invitation est absente, expirée ou annulée.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.tok_workforce_employees SET user_id = v_actor, updated_at = now()
    WHERE restaurant_id = p_restaurant_id AND id = v_employee.id AND user_id IS NULL;
  UPDATE public.tok_workforce_invitations SET accepted_at = now(), accepted_by = v_actor
    WHERE id = v_invite.id;
  RETURN v_employee.id;
END $$;

REVOKE ALL ON FUNCTION
  public.tok_workforce_invite_employee(uuid, uuid, text),
  public.tok_workforce_list_invitations(uuid),
  public.tok_workforce_revoke_invitation(uuid, uuid),
  public.tok_workforce_my_restaurants(),
  public.tok_workforce_claim_employee(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.tok_workforce_invite_employee(uuid, uuid, text),
  public.tok_workforce_list_invitations(uuid),
  public.tok_workforce_revoke_invitation(uuid, uuid),
  public.tok_workforce_my_restaurants(),
  public.tok_workforce_claim_employee(uuid) TO authenticated;

COMMIT;
