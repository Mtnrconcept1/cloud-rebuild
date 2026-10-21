-- Capture only missing business events. No HTTP, payment mutation, historical
-- backfill or secret is involved. Existing channel preferences and workers remain
-- authoritative. Capturing an intent is atomic with the business mutation;
-- materializing a notification is isolated and retryable after commit.
CREATE TABLE IF NOT EXISTS public.notification_business_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_role text NOT NULL CHECK (recipient_role IN ('admin','restaurateur','applicant','client')),
  title text NOT NULL,
  body text NOT NULL,
  type text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(data) = 'object'),
  legacy_email_kind text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','retrying','processed','failed','skipped')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  next_attempt_at timestamptz DEFAULT now(),
  notification_id uuid REFERENCES public.notifications(id) ON DELETE SET NULL,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (event_key,user_id)
);
CREATE INDEX IF NOT EXISTS notification_business_events_pending_idx
  ON public.notification_business_events(next_attempt_at,created_at,id)
  WHERE status IN ('queued','retrying');
ALTER TABLE public.notification_business_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_business_events FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.notification_business_events TO service_role;
COMMENT ON TABLE public.notification_business_events IS
  'Private durable notification intents; processed means enqueued, not email delivered. Inspect notification_deliveries for provider results.';

CREATE OR REPLACE FUNCTION public.queue_business_notification(
  p_event_key text,p_user_id uuid,p_recipient_role text,p_title text,p_body text,
  p_type text,p_data jsonb,p_legacy_email_kind text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_id uuid;
BEGIN
  IF p_user_id IS NULL OR public.commercial_demo_user_is_restricted(p_user_id) THEN RETURN NULL; END IF;
  INSERT INTO public.notification_business_events(event_key,user_id,recipient_role,title,body,type,data,legacy_email_kind)
  VALUES(p_event_key,p_user_id,p_recipient_role,left(p_title,200),left(p_body,1000),p_type,
    COALESCE(p_data,'{}'::jsonb) || jsonb_build_object('recipient_role',p_recipient_role),p_legacy_email_kind)
  ON CONFLICT(event_key,user_id) DO NOTHING RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.queue_business_notification(text,uuid,text,text,text,text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.queue_business_notification(text,uuid,text,text,text,text,jsonb,text) TO service_role;

CREATE OR REPLACE FUNCTION public.process_notification_business_events(p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  e public.notification_business_events%ROWTYPE;
  v_data jsonb;
  v_notification uuid;
  v_email boolean;
  v_processed integer := 0;
  v_retrying integer := 0;
  v_failed integer := 0;
  v_skipped integer := 0;
BEGIN
  -- pg_cron runs as the migration owner; API callers require service_role.
  -- Do not use current_user here: SECURITY DEFINER changes it to the owner.
  IF COALESCE(auth.role(),'') <> 'service_role'
     AND session_user NOT IN ('postgres','supabase_admin') THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE='42501';
  END IF;
  FOR e IN
    SELECT * FROM public.notification_business_events
    WHERE status IN ('queued','retrying') AND attempts < 5 AND next_attempt_at <= now()
    ORDER BY next_attempt_at,created_at,id
    FOR UPDATE SKIP LOCKED LIMIT GREATEST(1,LEAST(COALESCE(p_limit,50),200))
  LOOP
    UPDATE public.notification_business_events SET attempts=attempts+1 WHERE id=e.id;
    BEGIN
      -- A delayed notification must not leak to a demoted admin, former owner
      -- or a recipient who has since become a restricted demo account.
      IF public.commercial_demo_user_is_restricted(e.user_id)
        OR (e.recipient_role='admin' AND NOT EXISTS(
          SELECT 1 FROM public.user_roles r WHERE r.user_id=e.user_id AND r.role='admin'))
        OR (e.data ? 'restaurant_id' AND NOT EXISTS(
          SELECT 1 FROM public.restaurants r WHERE r.id=(e.data->>'restaurant_id')::uuid
            AND r.is_demo IS FALSE
            AND (e.recipient_role<>'restaurateur' OR r.owner_id=e.user_id)))
        OR (e.type IN ('support_reply','support_status') AND NOT EXISTS(
          SELECT 1 FROM public.support_incidents i
          LEFT JOIN public.restaurants r ON r.id=i.restaurant_id
          WHERE i.id=(e.data->>'support_incident_id')::uuid
            AND COALESCE(i.user_id,r.owner_id)=e.user_id))
      THEN
        UPDATE public.notification_business_events
        SET status='skipped',next_attempt_at=NULL,processed_at=now(),last_error='recipient_access_changed'
        WHERE id=e.id;
        v_skipped:=v_skipped+1;
        CONTINUE;
      END IF;
      v_email:=true;
      -- Legacy signup RPCs still queue email in the SAME transaction. Process
      -- after commit, and add email only when that exact transition has none.
      -- Preserve their existing text, while filling in-app/push and the
      -- confirmed-before-dossier registration path that had no admin email.
      IF e.legacy_email_kind IS NOT NULL THEN
        SELECT NOT EXISTS(
          SELECT 1 FROM public.email_queue q JOIN auth.users u ON u.id=e.user_id
          WHERE lower(q.to_email)=lower(u.email)
            AND q.metadata->>'kind'=e.legacy_email_kind
            AND q.metadata->>'application_id'=e.data->>'application_id'
            AND q.created_at>=e.created_at
            AND (e.legacy_email_kind<>'signup_decision' OR q.metadata->>'status'=e.data->>'event')
        ) INTO v_email;
      END IF;
      v_data:=e.data || jsonb_build_object('business_event_id',e.id,
        'requested_channels',jsonb_build_object('in_app',true,'push',true,'email',v_email));
      v_notification:=public.enqueue_notification(e.user_id,e.title,e.body,e.type,'transactional',v_data::json);
      IF v_notification IS NULL THEN RAISE EXCEPTION 'Notification was not persisted'; END IF;
      UPDATE public.notification_business_events
      SET status='processed',notification_id=v_notification,next_attempt_at=NULL,last_error=NULL,processed_at=now()
      WHERE id=e.id;
      v_processed:=v_processed+1;
    EXCEPTION WHEN OTHERS THEN
      -- The subtransaction rolls back a partial enqueue, not the business
      -- mutation or successful recipients. Do not persist SQLERRM/PII.
      UPDATE public.notification_business_events
      SET status=CASE WHEN e.attempts+1>=5 THEN 'failed' ELSE 'retrying' END,
        next_attempt_at=CASE WHEN e.attempts+1>=5 THEN NULL
          ELSE now()+make_interval(secs=>LEAST(900,30*(2^e.attempts)::integer)) END,
        last_error='enqueue_sqlstate:'||SQLSTATE
      WHERE id=e.id;
      IF e.attempts+1>=5 THEN v_failed:=v_failed+1; ELSE v_retrying:=v_retrying+1; END IF;
    END;
  END LOOP;
  RETURN jsonb_build_object('processed',v_processed,'retrying',v_retrying,'failed',v_failed,'skipped',v_skipped);
END;
$$;
REVOKE ALL ON FUNCTION public.process_notification_business_events(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.process_notification_business_events(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.capture_notification_business_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  n jsonb:=to_jsonb(NEW);
  o jsonb:=CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  v_restaurant uuid;
  v_owner uuid;
  v_source uuid;
  v_admin uuid;
  v_key text;
  v_event text;
  v_title text;
  v_body text;
  v_type text;
  v_owner_role text:='restaurateur';
  v_owner_url text:='/dashboard/notifications';
  v_admin_url text:='/admin/notifications';
  v_admins boolean:=false;
  v_owner_alert boolean:=true;
  v_legacy text;
  v_data jsonb:='{}'::jsonb;
BEGIN
  IF TG_TABLE_NAME IN ('golden_tok_accreditations','restaurant_ai_subscriptions') THEN
    v_restaurant:=(n->>'restaurant_id')::uuid;
    SELECT r.owner_id INTO v_owner FROM public.restaurants r
      WHERE r.id=v_restaurant AND r.is_demo IS FALSE;
    IF NOT FOUND OR v_owner IS NULL OR n->>'stripe_mode'='test' THEN RETURN NEW; END IF;
    v_data:=jsonb_build_object('restaurant_id',v_restaurant);
  END IF;

  IF TG_TABLE_NAME='golden_tok_accreditations' THEN
    v_source:=v_restaurant;
    v_type:='golden_tok';
    v_owner_url:='/dashboard/formules';
    v_admin_url:='/admin/drops';
    IF n->>'status' IS DISTINCT FROM o->>'status' THEN
      v_event:=n->>'status';
      IF v_event='pending' THEN
        v_title:='Nouvelle candidature La Tok d’Or';
        v_body:='Une candidature restaurateur La Tok d’Or attend une décision dans les dossiers de l’administration.';
        v_admins:=true;
      ELSIF v_event='approved' THEN
        v_title:='Agrément La Tok d’Or approuvé';
        v_body:='Votre candidature est approuvée. Consultez La Tok d’Or pour activer votre abonnement. L’agrément seul ne confirme aucun paiement.';
      ELSIF v_event IN ('rejected','suspended') THEN
        v_title:=CASE WHEN v_event='rejected' THEN 'Candidature La Tok d’Or refusée' ELSE 'Agrément La Tok d’Or suspendu' END;
        v_body:='Le statut de votre agrément a changé. Consultez la décision dans votre espace La Tok d’Or.';
      ELSE RETURN NEW;
      END IF;
    ELSIF n->>'stripe_mode'='live' AND (
      n->>'subscription_status' IS DISTINCT FROM o->>'subscription_status'
      OR n->>'stripe_mode' IS DISTINCT FROM o->>'stripe_mode') THEN
      IF n->>'subscription_status'='active' AND (
        n->>'status'<>'approved' OR COALESCE((n->>'current_period_end')::timestamptz<=now(),true)) THEN RETURN NEW; END IF;
      IF n->>'subscription_status' NOT IN ('active','trialing','past_due','unpaid','canceled','paused','incomplete_expired') THEN RETURN NEW; END IF;
      v_event:='subscription_'||(n->>'subscription_status');
      v_title:='Abonnement La Tok d’Or mis à jour';
      v_body:=CASE n->>'subscription_status'
        WHEN 'active' THEN 'L’abonnement La Tok d’Or est actif pour la période confirmée. Consultez votre espace pour les détails.'
        WHEN 'trialing' THEN 'Une période d’essai La Tok d’Or est enregistrée. Ceci n’est pas une confirmation de paiement.'
        WHEN 'past_due' THEN 'Le règlement de l’abonnement La Tok d’Or nécessite une intervention.'
        WHEN 'unpaid' THEN 'L’abonnement La Tok d’Or est impayé. Consultez votre facturation.'
        WHEN 'canceled' THEN 'L’abonnement La Tok d’Or est terminé.'
        WHEN 'paused' THEN 'L’abonnement La Tok d’Or est en pause.'
        ELSE 'L’activation de l’abonnement La Tok d’Or a expiré sans finalisation.' END;
      v_admins:=true;
    ELSIF n->>'stripe_mode'='live' AND TG_OP='UPDATE'
      AND n->>'cancel_at_period_end' IS DISTINCT FROM o->>'cancel_at_period_end' THEN
      v_event:=CASE WHEN (n->>'cancel_at_period_end')::boolean THEN 'cancellation_scheduled' ELSE 'cancellation_reversed' END;
      v_title:='Renouvellement La Tok d’Or mis à jour';
      v_body:=CASE WHEN (n->>'cancel_at_period_end')::boolean
        THEN 'La résiliation est programmée à la fin de la période en cours. Elle n’est pas immédiate.'
        ELSE 'La résiliation programmée a été annulée. Le renouvellement est rétabli.' END;
      v_admins:=true;
    ELSE RETURN NEW;
    END IF;

  ELSIF TG_TABLE_NAME='signup_applications' THEN
    IF n->>'requested_role' NOT IN ('restaurateur','courier')
      OR n->>'status' IS NOT DISTINCT FROM o->>'status' THEN RETURN NEW; END IF;
    v_source:=(n->>'id')::uuid;
    v_owner:=(n->>'user_id')::uuid;
    IF public.commercial_demo_user_is_restricted(v_owner) THEN RETURN NEW; END IF;
    v_type:='signup_application';
    v_owner_role:='applicant';
    v_owner_url:='/auth';
    v_admin_url:='/admin/utilisateurs?tab=applications';
    v_data:=jsonb_build_object('application_id',v_source,'requested_role',n->>'requested_role');
    v_event:=n->>'status';
    IF v_event='pending_review' THEN
      v_admins:=true;
      v_owner_alert:=false;
      v_legacy:='signup_admin_alert';
      v_title:='Dossier d’inscription à vérifier';
      v_body:='Un dossier '||(CASE WHEN n->>'requested_role'='courier' THEN 'livreur' ELSE 'restaurateur' END)||' attend une revue dans l’administration.';
    ELSIF v_event IN ('approved','needs_changes','rejected') THEN
      v_legacy:='signup_decision';
      v_title:=CASE v_event WHEN 'approved' THEN 'Dossier d’inscription validé' WHEN 'needs_changes' THEN 'Corrections demandées sur votre dossier' ELSE 'Dossier d’inscription refusé' END;
      v_body:='Une décision a été enregistrée sur votre candidature. Connectez-vous pour consulter votre dossier et les prochaines étapes.';
    ELSE RETURN NEW;
    END IF;

  ELSIF TG_TABLE_NAME='restaurant_ai_subscriptions' THEN
    IF TG_OP<>'UPDATE' OR n->'metadata'->>'stripe_mode'='test' THEN RETURN NEW; END IF;
    v_source:=(n->>'id')::uuid;
    v_type:='restaurant_subscription';
    v_owner_url:='/dashboard/mon-compte-facturation';
    v_admin_url:='/admin/restaurants';
    v_admins:=true;
    IF n->>'status' IS DISTINCT FROM o->>'status'
      AND n->>'status' IN ('active','trialing','past_due','unpaid','paused','cancelled','canceled','activation_failed') THEN
      v_event:='status_'||(n->>'status');
      v_title:='Statut de l’abonnement restaurateur modifié';
      v_body:=CASE n->>'status'
        WHEN 'active' THEN 'L’abonnement restaurateur est actif. Consultez les factures pour vérifier les règlements.'
        WHEN 'trialing' THEN 'L’abonnement restaurateur est en période d’essai. Aucun encaissement n’est confirmé par cette alerte.'
        WHEN 'past_due' THEN 'Un règlement de l’abonnement restaurateur est en retard. Consultez la facturation.'
        WHEN 'unpaid' THEN 'L’abonnement restaurateur est impayé. Une intervention est nécessaire.'
        WHEN 'paused' THEN 'L’abonnement restaurateur est en pause.'
        WHEN 'activation_failed' THEN 'L’activation de l’abonnement restaurateur a échoué. Consultez votre facturation.'
        ELSE 'L’abonnement restaurateur est terminé.' END;
    ELSIF n->>'cancel_at_period_end' IS DISTINCT FROM o->>'cancel_at_period_end' THEN
      v_event:=CASE WHEN COALESCE((n->>'cancel_at_period_end')::boolean,false) THEN 'cancellation_scheduled' ELSE 'cancellation_reversed' END;
      v_title:='Renouvellement de l’abonnement restaurateur modifié';
      v_body:=CASE WHEN COALESCE((n->>'cancel_at_period_end')::boolean,false)
        THEN 'La résiliation est programmée pour la fin de la période en cours.'
        ELSE 'La résiliation programmée a été annulée. Le renouvellement est rétabli.' END;
    ELSIF COALESCE(n->'scheduled_plan_change','{}'::jsonb) IS DISTINCT FROM COALESCE(o->'scheduled_plan_change','{}'::jsonb) THEN
      v_event:='scheduled_plan_changed';
      v_title:='Changement d’offre programmé mis à jour';
      v_body:='La programmation de votre prochaine offre a changé. Consultez le détail et la date d’effet dans votre facturation.';
    ELSE RETURN NEW;
    END IF;

  ELSIF TG_TABLE_NAME='support_incident_messages' THEN
    IF TG_OP<>'INSERT' OR n->>'visibility'<>'public' OR n->>'author_role'<>'admin'
      OR NOT EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=(n->>'author_id')::uuid AND r.role='admin') THEN RETURN NEW; END IF;
    v_source:=(n->>'id')::uuid;
    SELECT COALESCE(i.user_id,r.owner_id),i.restaurant_id,
      CASE WHEN i.user_id IS NULL THEN 'restaurateur' ELSE 'client' END
    INTO v_owner,v_restaurant,v_owner_role
    FROM public.support_incidents i LEFT JOIN public.restaurants r ON r.id=i.restaurant_id
    WHERE i.id=(n->>'incident_id')::uuid AND (i.restaurant_id IS NULL OR r.is_demo IS FALSE);
    IF v_owner IS NULL OR v_owner=(n->>'author_id')::uuid THEN RETURN NEW; END IF;
    v_event:='reply';
    v_type:='support_reply';
    v_title:='Le support TOK vous a répondu';
    v_body:='Une nouvelle réponse du support est disponible dans votre conversation TOK.';
    v_owner_url:=CASE WHEN v_owner_role='restaurateur' THEN '/dashboard/support' ELSE '/?chat=open' END;
    v_data:=jsonb_build_object('support_incident_id',n->>'incident_id');

  ELSIF TG_TABLE_NAME='support_incidents' THEN
    IF TG_OP<>'UPDATE' OR n->>'status' IS NOT DISTINCT FROM o->>'status'
      OR n->>'status' NOT IN ('resolved','closed') THEN RETURN NEW; END IF;
    v_source:=(n->>'id')::uuid;
    SELECT COALESCE(i.user_id,r.owner_id),i.restaurant_id,
      CASE WHEN i.user_id IS NULL THEN 'restaurateur' ELSE 'client' END
    INTO v_owner,v_restaurant,v_owner_role
    FROM public.support_incidents i LEFT JOIN public.restaurants r ON r.id=i.restaurant_id
    WHERE i.id=v_source AND (i.restaurant_id IS NULL OR r.is_demo IS FALSE);
    IF v_owner IS NULL THEN RETURN NEW; END IF;
    v_event:=n->>'status';
    v_type:='support_status';
    v_title:='Votre dossier support a été mis à jour';
    v_body:=CASE WHEN v_event='resolved' THEN 'Votre dossier a été marqué comme résolu. Consultez votre conversation pour les détails.' ELSE 'Votre dossier support est clôturé. Consultez votre conversation pour les détails.' END;
    v_owner_url:=CASE WHEN v_owner_role='restaurateur' THEN '/dashboard/support' ELSE '/?chat=open' END;
    v_data:=jsonb_build_object('support_incident_id',v_source);
  ELSE RETURN NEW;
  END IF;

  v_key:=TG_TABLE_NAME||':'||v_source::text||':'||gen_random_uuid()::text;
  v_data:=v_data||jsonb_build_object('event',v_event,'source',TG_TABLE_NAME);
  IF v_admins THEN
    FOR v_admin IN SELECT DISTINCT user_id FROM public.user_roles WHERE role='admin' LOOP
      PERFORM public.queue_business_notification(v_key,v_admin,'admin',v_title,v_body,v_type,
        v_data||jsonb_build_object('url',v_admin_url),v_legacy);
    END LOOP;
  END IF;
  IF v_owner_alert AND v_owner IS NOT NULL THEN
    IF v_type='golden_tok' AND v_event='pending' THEN
      v_title:='Candidature La Tok d’Or reçue';
      v_body:='Votre candidature a été enregistrée et attend la décision de TOK. Aucun abonnement ni paiement n’est activé à cette étape.';
    END IF;
    PERFORM public.queue_business_notification(v_key,v_owner,v_owner_role,v_title,v_body,v_type,
      v_data||jsonb_build_object('url',v_owner_url),v_legacy);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.capture_notification_business_event() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.capture_notification_business_event() TO service_role;

DROP TRIGGER IF EXISTS notification_business_capture ON public.golden_tok_accreditations;
CREATE TRIGGER notification_business_capture AFTER INSERT OR UPDATE ON public.golden_tok_accreditations
FOR EACH ROW EXECUTE FUNCTION public.capture_notification_business_event();
DROP TRIGGER IF EXISTS notification_business_capture ON public.signup_applications;
CREATE TRIGGER notification_business_capture AFTER INSERT OR UPDATE ON public.signup_applications
FOR EACH ROW EXECUTE FUNCTION public.capture_notification_business_event();
DROP TRIGGER IF EXISTS notification_business_capture ON public.restaurant_ai_subscriptions;
CREATE TRIGGER notification_business_capture AFTER UPDATE ON public.restaurant_ai_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.capture_notification_business_event();
DROP TRIGGER IF EXISTS notification_business_capture ON public.support_incident_messages;
CREATE TRIGGER notification_business_capture AFTER INSERT ON public.support_incident_messages
FOR EACH ROW EXECUTE FUNCTION public.capture_notification_business_event();
DROP TRIGGER IF EXISTS notification_business_capture ON public.support_incidents;
CREATE TRIGGER notification_business_capture AFTER UPDATE OF status ON public.support_incidents
FOR EACH ROW EXECUTE FUNCTION public.capture_notification_business_event();

DO $$
BEGIN
  IF to_regprocedure('cron.schedule(text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'pg_cron is required for durable business notifications';
  END IF;
  PERFORM cron.schedule('tok-process-business-notifications','* * * * *',
    'SELECT public.process_notification_business_events(100);');
END;
$$;
