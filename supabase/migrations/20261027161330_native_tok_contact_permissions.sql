-- Isolated native consent register. No existing marketing eligibility is granted.
BEGIN;
CREATE TABLE IF NOT EXISTS public.tok_contact_permissions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 email text NOT NULL CHECK (length(email) BETWEEN 5 AND 254 AND email=lower(email) AND email !~ '[[:space:]]'),
 payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object' AND octet_length(payload::text)<=64000),
 payload_hash text NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
 document_hash text NOT NULL CHECK (document_hash ~ '^[a-f0-9]{64}$'),
 receipt_hash text UNIQUE NOT NULL CHECK (receipt_hash ~ '^[a-f0-9]{64}$'),
 request_hash text UNIQUE NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 confirmed_at timestamptz,
 withdrawn_at timestamptz,
 expires_at timestamptz NOT NULL DEFAULT (now()+interval '24 months'),
 email_status text NOT NULL DEFAULT 'pending' CHECK (email_status IN ('pending','sent','failed')),
 CHECK (payload->>'email'=email), CHECK (payload->>'id'=id::text),
 CHECK (payload ? 'email' AND payload ? 'id' AND payload ? 'signature' AND payload ? 'text' AND payload ? 'version'),
 CHECK (expires_at>created_at)
);
ALTER TABLE public.tok_contact_permissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tok_contact_permissions FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.tok_contact_permissions TO service_role;
CREATE INDEX IF NOT EXISTS tok_contact_permissions_email_idx ON public.tok_contact_permissions(email);
CREATE INDEX IF NOT EXISTS tok_contact_permissions_created_idx ON public.tok_contact_permissions(created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS tok_contact_permissions_expiry_idx ON public.tok_contact_permissions(expires_at);
CREATE TABLE IF NOT EXISTS public.tok_consent_rate_limits (scope text NOT NULL,bucket timestamptz NOT NULL,hits integer NOT NULL DEFAULT 1,PRIMARY KEY(scope,bucket));
ALTER TABLE public.tok_consent_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tok_consent_rate_limits FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.tok_consent_rate_limits TO service_role;
CREATE TABLE IF NOT EXISTS public.tok_consent_admin_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_user_id uuid NOT NULL REFERENCES auth.users(id),
 action text NOT NULL CHECK (action IN ('list','detail','export','configure')),page_offset integer NOT NULL DEFAULT 0 CHECK(page_offset>=0),created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tok_consent_admin_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tok_consent_admin_audit FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,DELETE ON public.tok_consent_admin_audit TO service_role;
CREATE INDEX IF NOT EXISTS tok_consent_admin_audit_created_idx ON public.tok_consent_admin_audit(created_at);
CREATE TABLE IF NOT EXISTS public.tok_consent_settings (
 id boolean PRIMARY KEY DEFAULT true CHECK(id IS TRUE),
 controller text NOT NULL CHECK(length(controller) BETWEEN 2 AND 200),
 address text NOT NULL CHECK(length(address) BETWEEN 8 AND 500),
 email text NOT NULL CHECK(length(email) BETWEEN 5 AND 254),
 updated_by uuid NOT NULL REFERENCES auth.users(id),updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tok_consent_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tok_consent_settings FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.tok_consent_settings TO service_role;
CREATE OR REPLACE FUNCTION public.tok_consent_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW.email IS DISTINCT FROM OLD.email OR NEW.payload IS DISTINCT FROM OLD.payload
 OR NEW.payload_hash IS DISTINCT FROM OLD.payload_hash OR NEW.document_hash IS DISTINCT FROM OLD.document_hash
 OR NEW.receipt_hash IS DISTINCT FROM OLD.receipt_hash OR NEW.request_hash IS DISTINCT FROM OLD.request_hash
 OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
 OR (OLD.confirmed_at IS NOT NULL AND NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at)
 OR (OLD.withdrawn_at IS NOT NULL AND NEW.withdrawn_at IS DISTINCT FROM OLD.withdrawn_at)
 THEN RAISE EXCEPTION 'consent_evidence_is_immutable' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.tok_consent_immutable() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS tok_consent_immutable ON public.tok_contact_permissions;
CREATE TRIGGER tok_consent_immutable BEFORE UPDATE ON public.tok_contact_permissions FOR EACH ROW EXECUTE FUNCTION public.tok_consent_immutable();
CREATE OR REPLACE FUNCTION public.tok_consent_take_slot(p_ip text,p_email text) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE n integer; day_bucket timestamptz:=date_trunc('day',now() AT TIME ZONE 'Europe/Zurich') AT TIME ZONE 'Europe/Zurich'; hour_bucket timestamptz:=date_trunc('hour',now());
BEGIN
 IF p_ip !~ '^[a-f0-9]{64}$' OR p_email !~ '^[a-f0-9]{64}$' OR p_ip IS NULL OR p_email IS NULL THEN RAISE EXCEPTION 'invalid_rate_key'; END IF;
 INSERT INTO public.tok_consent_rate_limits(scope,bucket) VALUES ('global',day_bucket)
 ON CONFLICT(scope,bucket) DO UPDATE SET hits=public.tok_consent_rate_limits.hits+1 RETURNING hits INTO n;
 IF n>100 THEN RETURN false; END IF;
 INSERT INTO public.tok_consent_rate_limits(scope,bucket) VALUES ('ip:'||p_ip,hour_bucket)
 ON CONFLICT(scope,bucket) DO UPDATE SET hits=public.tok_consent_rate_limits.hits+1 RETURNING hits INTO n;
 IF n>30 THEN RETURN false; END IF;
 INSERT INTO public.tok_consent_rate_limits(scope,bucket) VALUES ('email:'||p_email,day_bucket)
 ON CONFLICT(scope,bucket) DO UPDATE SET hits=public.tok_consent_rate_limits.hits+1 RETURNING hits INTO n;
 RETURN n<=3;
END $$;
REVOKE ALL ON FUNCTION public.tok_consent_take_slot(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tok_consent_take_slot(text,text) TO service_role;
CREATE OR REPLACE FUNCTION public.tok_consent_withdraw(p_receipt_hash text) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE recipient text;
BEGIN
 SELECT email INTO recipient FROM public.tok_contact_permissions WHERE receipt_hash=p_receipt_hash;
 IF recipient IS NULL THEN RETURN false; END IF;
 -- The capability is sent only to this mailbox; never returned by the public submission.
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(recipient,6927));
 UPDATE public.tok_contact_permissions SET withdrawn_at=now() WHERE email=recipient AND withdrawn_at IS NULL;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.tok_consent_withdraw(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tok_consent_withdraw(text) TO service_role;
COMMENT ON TABLE public.tok_contact_permissions IS 'Private native TOK contact permissions. Simple signature plus email confirmation. Never automatically grants marketing eligibility.';
-- Daily retention is restricted to the register tables introduced above.
SELECT cron.schedule('tok-consent-retention','19 3 * * *',
 $job$DELETE FROM public.tok_contact_permissions WHERE expires_at<now() OR (confirmed_at IS NULL AND created_at<now()-interval '7 days'); DELETE FROM public.tok_consent_rate_limits WHERE bucket<now()-interval '2 days'; DELETE FROM public.tok_consent_admin_audit WHERE created_at<now()-interval '24 months';$job$);
DO $$BEGIN
 IF has_table_privilege('anon','public.tok_contact_permissions','SELECT') OR has_table_privilege('authenticated','public.tok_contact_permissions','SELECT')
 OR has_function_privilege('anon','public.tok_consent_take_slot(text,text)','EXECUTE') OR has_function_privilege('authenticated','public.tok_consent_withdraw(text)','EXECUTE')
 THEN RAISE EXCEPTION 'Unexpected public access to consent register'; END IF;
END $$;
COMMIT;
