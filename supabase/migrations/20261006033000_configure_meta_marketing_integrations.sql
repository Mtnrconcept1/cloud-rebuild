-- Configure the production Meta publishing adapter without activating it blindly.
-- Facebook and Instagram remain disconnected until the Edge Function secrets
-- META_SYSTEM_USER_TOKEN and META_APP_SECRET are installed and a live credential
-- probe confirms the Page and linked professional Instagram account.

UPDATE public.marketing_integrations
SET
  status = 'disconnected',
  capabilities = capabilities || jsonb_build_object(
    'publish', true,
    'adapter_deployed', true,
    'provider', 'meta',
    'requires_human_approval', true
  ),
  public_configuration = public_configuration || jsonb_build_object(
    'page_id', '1409554725565734',
    'ig_user_id', '17841447348180505',
    'graph_version', 'v26.0'
  ),
  secret_ref = 'META_SYSTEM_USER_TOKEN',
  configured_at = NULL,
  last_checked_at = now(),
  last_error = 'meta_credentials_not_yet_probed',
  description = 'Adaptateur Meta prêt. Activation uniquement après validation du system user token, de l''App Secret et des droits de publication.'
WHERE channel IN ('facebook', 'instagram');

DO $$
DECLARE
  v_configured integer;
BEGIN
  SELECT count(*) INTO v_configured
  FROM public.marketing_integrations
  WHERE channel IN ('facebook', 'instagram')
    AND status = 'disconnected'
    AND secret_ref = 'META_SYSTEM_USER_TOKEN'
    AND capabilities ->> 'provider' = 'meta'
    AND COALESCE((capabilities ->> 'adapter_deployed')::boolean, false) IS TRUE
    AND public_configuration ->> 'page_id' = '1409554725565734'
    AND public_configuration ->> 'ig_user_id' = '17841447348180505'
    AND public_configuration ->> 'graph_version' = 'v26.0';

  IF v_configured <> 2 THEN
    RAISE EXCEPTION 'Meta marketing integrations were not configured as expected';
  END IF;
END;
$$;
