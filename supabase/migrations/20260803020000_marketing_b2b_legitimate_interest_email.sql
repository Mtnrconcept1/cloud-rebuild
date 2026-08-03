-- Open marketing email to legitimate interest, for business contacts only.
--
-- DELIBERATE POLICY CHANGE, made on an explicit and repeated instruction from
-- the platform owner after the legal exposure was stated.
--
-- Swiss UCA art. 3(1)(o) requires prior consent for mass electronic
-- advertising, with an exception for an existing customer relationship. The
-- previous rule mirrored that literally and accepted only 'consent' and
-- 'existing_customer'. Accepting 'legitimate_interest' widens who may be
-- emailed beyond what that article describes, and the residual risk — a
-- complaint, a fine, sender-reputation damage — is accepted by the owner.
--
-- Two limits keep the change as narrow as the intent behind it:
--
--   1. Business contacts only. A prospect drawn from a public company registry
--      is a legal entity; a registered natural person is not, and never becomes
--      reachable through this basis.
--   2. Everything else still applies. Opt-out, per-contact email suppression,
--      notification preferences, quiet hours, frequency and daily caps and the
--      List-Unsubscribe header are untouched, so a recipient can still stop
--      receiving mail and be permanently honoured.

CREATE OR REPLACE FUNCTION public.marketing_contact_is_eligible(p_contact_id uuid, p_channel text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE((
    SELECT
      c.opted_out_at IS NULL
      AND CASE
        -- Consent and existing-customer remain the ordinary bases. Legitimate
        -- interest is admitted for registry-sourced businesses only.
        WHEN p_channel IN ('email','manual_email') THEN
          c.email_normalized IS NOT NULL
          AND COALESCE((c.metadata ->> 'email_suppressed')::boolean, false) IS FALSE
          AND (
            c.lawful_basis IN ('consent','existing_customer')
            OR (
              c.lawful_basis = 'legitimate_interest'
              AND c.contact_type IN ('restaurant_prospect','restaurant_lead')
            )
          )
          AND (c.user_id IS NULL OR EXISTS (
            SELECT 1 FROM public.notification_preferences p
            WHERE p.user_id = c.user_id
              AND COALESCE((p.categories ->> 'marketing')::boolean, false)
              AND COALESCE((p.channels ->> 'email')::boolean, true)
          ))
        -- Push and in-app reach a person on their own device and stay on
        -- consent or an existing relationship.
        WHEN p_channel IN ('push','in_app') THEN
          c.user_id IS NOT NULL AND c.lawful_basis IN ('consent','existing_customer')
          AND EXISTS (
            SELECT 1 FROM public.notification_preferences p
            WHERE p.user_id = c.user_id
              AND COALESCE((p.categories ->> 'marketing')::boolean, false)
              AND COALESCE((p.channels ->> p_channel)::boolean, true)
          )
        WHEN p_channel = 'manual_call' THEN
          c.phone_normalized IS NOT NULL
          AND c.lawful_basis IN ('consent','existing_customer','legitimate_interest')
        WHEN p_channel = 'manual_visit' THEN false
        -- Public/editorial channels never create individual deliveries.
        WHEN p_channel IN ('tok_news','instagram','facebook','linkedin','tiktok','youtube',
          'telegram','google_business','website') THEN false
        ELSE false
      END
    FROM public.marketing_contacts c WHERE c.id = p_contact_id
  ), false);
$$;
