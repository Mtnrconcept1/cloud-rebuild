-- Disposable local PostgreSQL fixture; NEVER run against TOK production.
BEGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS
$$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
CREATE TABLE public.marketing_contacts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), contact_type text NOT NULL,
 source_objectid bigint, lead_score integer, canton text, website text,
 email_normalized text, lawful_basis text NOT NULL DEFAULT 'none',
 consent_at timestamptz, opted_out_at timestamptz, suppression_reason text,
 last_contact_at timestamptz, lifecycle_status text NOT NULL DEFAULT 'new'
);
CREATE TABLE public.marketing_automations(
 automation_key text NOT NULL UNIQUE, status text NOT NULL, conditions jsonb NOT NULL
);
INSERT INTO public.marketing_automations VALUES ('global_runtime','active','{"global_pause":"false"}');
CREATE TABLE public.commercial_prospect_followups(source_objectid bigint PRIMARY KEY, signed_at timestamptz);
CREATE TABLE public.restaurant_leads(created_at timestamptz DEFAULT now());
CREATE TABLE public.reservations(created_at timestamptz DEFAULT now(), honored_at timestamptz);
CREATE TABLE public.marketing_acquisition_touches(touched_at timestamptz DEFAULT now());
CREATE TABLE public.marketing_attribution_facts(observed_at timestamptz DEFAULT now(),fact_type text,campaign_id uuid);
CREATE OR REPLACE FUNCTION public.marketing_require_service_role()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF COALESCE(auth.jwt()->>'role','') <> 'service_role' THEN
  RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
 END IF;
END;
$$;
-- Historical eligibility semantics intentionally include B2B legitimate_interest.
-- The new migration must tighten bulk email while leaving manual_email unchanged.
CREATE OR REPLACE FUNCTION public.marketing_contact_is_eligible(p_contact_id uuid,p_channel text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT COALESCE((SELECT c.opted_out_at IS NULL AND c.suppression_reason IS NULL
  AND CASE WHEN p_channel IN ('email','manual_email') THEN
    c.email_normalized IS NOT NULL
    AND (c.lawful_basis IN ('consent','existing_customer') OR (c.lawful_basis = 'legitimate_interest' AND c.contact_type IN ('restaurant_prospect','restaurant_lead')))
    ELSE false END
 FROM public.marketing_contacts c WHERE c.id=p_contact_id),false);
$$;
INSERT INTO public.marketing_contacts(id,contact_type,source_objectid,lead_score,canton,website,email_normalized,lawful_basis,consent_at)
VALUES
 ('00000000-0000-4000-8000-000000000001','restaurant_prospect',1,60,'GE','https://consented.example.invalid','consented@example.invalid','consent',now()),
 ('00000000-0000-4000-8000-000000000002','restaurant_prospect',2,40,'GE','https://cold.example.invalid','cold@example.invalid','legitimate_interest',NULL),
 ('00000000-0000-4000-8000-000000000003','restaurant_lead',3,10,NULL,NULL,NULL,'none',NULL);
INSERT INTO public.marketing_contacts(id,contact_type,source_objectid,lead_score,canton,email_normalized,lawful_basis,consent_at,opted_out_at)
VALUES
 ('00000000-0000-4000-8000-000000000004','restaurant_prospect',4,80,'GE','blocked@example.invalid','consent',now(),now());
INSERT INTO public.reservations(created_at,honored_at) VALUES (now()-interval '1 day',now()-interval '2 hours');
INSERT INTO public.marketing_acquisition_touches DEFAULT VALUES;
COMMIT;
