-- ISOLATED TEST DATABASE ONLY. Minimal dependencies for the targeting migration.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims',true),''),'{}')::jsonb
$$;
CREATE TABLE public.marketing_contacts (
  id uuid PRIMARY KEY, contact_type text, canton text, city text, category text,
  postal_code text, commune text, branch text, company_size text, locale text,
  source_system text, lifecycle_status text, email_normalized text, phone_normalized text, website text
);
CREATE TABLE public.marketing_calendar_items (id uuid PRIMARY KEY, channel text, status text, approval_status text, content jsonb);
-- Existing service guard, identical to the operations-center migration.
CREATE FUNCTION public.marketing_require_service_role() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF COALESCE(auth.jwt() ->> 'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
END;
$$;
-- Only the additive content handoff is tested here. Real delivery eligibility is
-- covered by the existing consent/dispatch suite, not replaced with this fixture.
CREATE FUNCTION public.service_prepare_marketing_email_delivery(uuid,uuid) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_subject text; v_item record;
BEGIN RETURN jsonb_build_object(
    'subject', v_subject,
    'status','ready'); END;
$$;
