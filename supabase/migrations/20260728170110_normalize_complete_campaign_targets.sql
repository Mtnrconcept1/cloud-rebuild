-- Selecting every value in a finite targeting family means no restriction.
-- Keep the strict raw implementations from the previous migration and expose
-- normalized wrappers under the public RPC names used by the application.

CREATE OR REPLACE FUNCTION public.normalize_campaign_target_criteria(p_criteria jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_criteria jsonb := CASE
    WHEN jsonb_typeof(p_criteria) = 'object' THEN p_criteria
    ELSE '{}'::jsonb
  END;
  v_journeys jsonb;
  v_moments jsonb;
  v_genders jsonb;
BEGIN
  v_journeys := CASE
    WHEN jsonb_typeof(v_criteria->'journeyTypes') = 'array' THEN v_criteria->'journeyTypes'
    ELSE '[]'::jsonb
  END;
  v_moments := CASE
    WHEN jsonb_typeof(v_criteria->'serviceMoments') = 'array' THEN v_criteria->'serviceMoments'
    ELSE '[]'::jsonb
  END;
  v_genders := CASE
    WHEN jsonb_typeof(v_criteria->'genders') = 'array' THEN v_criteria->'genders'
    ELSE '["all"]'::jsonb
  END;

  IF v_journeys ? 'delivery'
    AND v_journeys ? 'takeaway'
    AND v_journeys ? 'reservation'
    AND (v_journeys ? 'zero_attente' OR v_journeys ? 'zero-attente' OR v_journeys ? 'zero attente') THEN
    v_criteria := jsonb_set(v_criteria, '{journeyTypes}', '[]'::jsonb, true);
  END IF;

  IF v_moments ? 'lunch'
    AND v_moments ? 'dinner'
    AND v_moments ? 'weekend' THEN
    v_criteria := jsonb_set(v_criteria, '{serviceMoments}', '[]'::jsonb, true);
  END IF;

  IF v_genders ? 'all' THEN
    v_criteria := jsonb_set(v_criteria, '{genders}', '["all"]'::jsonb, true);
  END IF;

  IF NULLIF(trim(COALESCE(v_criteria->>'customerSegment', '')), '') IS NULL THEN
    v_criteria := jsonb_set(v_criteria, '{customerSegment}', '"all"'::jsonb, true);
  END IF;

  RETURN v_criteria;
END;
$function$;

REVOKE ALL ON FUNCTION public.normalize_campaign_target_criteria(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.normalize_campaign_target_criteria(jsonb) TO anon, authenticated, service_role;

ALTER FUNCTION public.social_campaign_targeting_score(jsonb, uuid, text, text)
  RENAME TO social_campaign_targeting_score_strict_raw;

CREATE OR REPLACE FUNCTION public.social_campaign_targeting_score(
  p_target_criteria jsonb,
  p_restaurant_id uuid,
  p_restaurant_city text DEFAULT NULL::text,
  p_restaurant_cuisine text DEFAULT NULL::text
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_criteria jsonb := public.normalize_campaign_target_criteria(p_target_criteria);
  v_user_id uuid := auth.uid();
  v_profile_city text := '';
  v_profile_gender text := '';
  v_cities text[] := ARRAY[]::text[];
  v_genders text[] := ARRAY[]::text[];
BEGIN
  SELECT COALESCE(array_agg(public.normalize_search_text(value)), ARRAY[]::text[])
  INTO v_cities
  FROM jsonb_array_elements_text(
    CASE WHEN jsonb_typeof(v_criteria->'cities') = 'array' THEN v_criteria->'cities' ELSE '[]'::jsonb END
  ) AS value;

  SELECT COALESCE(array_agg(
    CASE public.normalize_search_text(value)
      WHEN 'femme' THEN 'female'
      WHEN 'f' THEN 'female'
      WHEN 'homme' THEN 'male'
      WHEN 'm' THEN 'male'
      ELSE public.normalize_search_text(value)
    END
  ), ARRAY[]::text[])
  INTO v_genders
  FROM jsonb_array_elements_text(
    CASE WHEN jsonb_typeof(v_criteria->'genders') = 'array' THEN v_criteria->'genders' ELSE '[]'::jsonb END
  ) AS value;

  IF cardinality(v_cities) > 0 OR (cardinality(v_genders) > 0 AND NOT ('all' = ANY(v_genders))) THEN
    IF v_user_id IS NULL THEN
      RETURN 0;
    END IF;

    SELECT
      COALESCE(public.normalize_search_text(p.city), ''),
      COALESCE(CASE public.normalize_search_text(p.gender)
        WHEN 'femme' THEN 'female'
        WHEN 'f' THEN 'female'
        WHEN 'homme' THEN 'male'
        WHEN 'm' THEN 'male'
        ELSE public.normalize_search_text(p.gender)
      END, '')
    INTO v_profile_city, v_profile_gender
    FROM public.profiles p
    WHERE p.user_id = v_user_id
    LIMIT 1;
  END IF;

  IF cardinality(v_cities) > 0
    AND (v_profile_city = '' OR NOT (v_profile_city = ANY(v_cities))) THEN
    RETURN 0;
  END IF;

  IF cardinality(v_genders) > 0
    AND NOT ('all' = ANY(v_genders))
    AND (v_profile_gender = '' OR NOT (v_profile_gender = ANY(v_genders))) THEN
    RETURN 0;
  END IF;

  RETURN public.social_campaign_targeting_score_strict_raw(
    v_criteria,
    p_restaurant_id,
    p_restaurant_city,
    p_restaurant_cuisine
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.social_campaign_targeting_score(jsonb, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.social_campaign_targeting_score(jsonb, uuid, text, text) TO anon, authenticated, service_role;

ALTER FUNCTION public.estimate_campaign_audience(uuid, jsonb)
  RENAME TO estimate_campaign_audience_strict_raw;

CREATE OR REPLACE FUNCTION public.estimate_campaign_audience(
  p_restaurant_id uuid,
  p_criteria jsonb DEFAULT '{}'::jsonb
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.estimate_campaign_audience_strict_raw(
    p_restaurant_id,
    public.normalize_campaign_target_criteria(p_criteria)
  );
$function$;

REVOKE ALL ON FUNCTION public.estimate_campaign_audience(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.estimate_campaign_audience(uuid, jsonb) TO authenticated, service_role;
