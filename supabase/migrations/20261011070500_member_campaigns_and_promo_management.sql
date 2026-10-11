BEGIN;
ALTER TABLE public.promo_codes ADD COLUMN IF NOT EXISTS required_tok_one_benefit text;
ALTER TABLE public.promo_codes ADD COLUMN IF NOT EXISTS required_miamz_tier text;

CREATE OR REPLACE FUNCTION public.promo_code_is_eligible(p_code_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_code public.promo_codes%ROWTYPE; v_tier text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND p_user_id IS DISTINCT FROM auth.uid()
    AND NOT COALESCE(public.has_role(auth.uid(),'admin'),false) THEN RETURN false; END IF;
  SELECT * INTO v_code FROM public.promo_codes WHERE id=p_code_id;
  IF NOT FOUND THEN RETURN false; END IF;
  IF EXISTS(SELECT 1 FROM public.member_benefit_campaigns c WHERE c.promo_code_id=v_code.id)
    AND NOT EXISTS(SELECT 1 FROM public.member_benefit_campaigns c WHERE c.promo_code_id=v_code.id
      AND c.is_active AND c.starts_at<=now() AND c.ends_at>now()
      AND ((c.audience='tok_one' AND public.has_tok_one_benefit(p_user_id,c.benefit))
        OR (c.audience='miamz' AND public.user_has_miamz_benefit(p_user_id,c.benefit)))) THEN RETURN false; END IF;
  IF v_code.required_tok_one_benefit IS NOT NULL
    AND NOT public.has_tok_one_benefit(p_user_id,v_code.required_tok_one_benefit) THEN RETURN false; END IF;
  IF v_code.required_miamz_tier IS NOT NULL THEN
    IF p_user_id IS NULL THEN RETURN false; END IF;
    v_tier := public.resolve_miamz_benefit_state(p_user_id)->>'tier';
    IF public.miamz_tier_rank(v_tier) < public.miamz_tier_rank(v_code.required_miamz_tier) THEN RETURN false; END IF;
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.promo_code_is_eligible(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.promo_code_is_eligible(uuid,uuid) TO anon,authenticated,service_role;
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS promo_codes_audience ON public.promo_codes;
CREATE POLICY promo_codes_audience ON public.promo_codes AS RESTRICTIVE FOR SELECT TO anon,authenticated
USING (COALESCE(public.has_role(auth.uid(),'admin'),false) OR public.promo_code_is_eligible(id));

CREATE OR REPLACE FUNCTION public.admin_save_promo_code(p_id uuid,p_payload jsonb,p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_row public.promo_codes%ROWTYPE; v_old jsonb; v_id uuid := COALESCE(p_id,gen_random_uuid());
BEGIN
  PERFORM public.assert_commercial_demo_production_rpc_allowed();
  IF NOT COALESCE(public.has_role(auth.uid(),'admin'),false) THEN RAISE EXCEPTION 'Admin access required' USING ERRCODE='42501'; END IF;
  IF length(trim(COALESCE(p_reason,'')))<6 THEN RAISE EXCEPTION 'Reason required'; END IF;
  SELECT to_jsonb(p) INTO v_old FROM public.promo_codes p WHERE id=p_id FOR UPDATE;
  IF p_id IS NOT NULL AND NOT FOUND THEN RAISE EXCEPTION 'Code not found'; END IF;
  v_row := jsonb_populate_record(NULL::public.promo_codes,p_payload);
  v_row.code := upper(trim(COALESCE(v_row.code,'')));
  IF v_row.code !~ '^[A-Z0-9_-]{3,40}$' OR v_row.type NOT IN ('percentage','fixed','free_delivery')
    OR v_row.type IS NULL OR v_row.value IS NULL OR v_row.value<0
    OR (v_row.type='percentage' AND v_row.value>100)
    OR COALESCE(v_row.min_order_amount,0)<0 OR v_row.max_discount<0
    OR v_row.max_uses<1 OR v_row.per_user_limit<1
    OR (v_row.valid_until IS NOT NULL AND v_row.valid_until<=COALESCE(v_row.valid_from,now()))
    OR (v_row.required_miamz_tier IS NOT NULL AND v_row.required_miamz_tier NOT IN ('bronze','silver','gold','platinum'))
    OR (v_row.required_tok_one_benefit IS NOT NULL AND v_row.required_tok_one_benefit <> 'surprise_offers') THEN
    RAISE EXCEPTION 'Invalid promotion';
  END IF;
  INSERT INTO public.promo_codes(id,code,type,value,min_order_amount,max_discount,max_uses,per_user_limit,
    restaurant_id,is_first_order_only,is_stackable,valid_from,valid_until,is_active,required_tok_one_benefit,required_miamz_tier)
  VALUES(v_id,v_row.code,v_row.type,v_row.value,COALESCE(v_row.min_order_amount,0),v_row.max_discount,
    v_row.max_uses,COALESCE(v_row.per_user_limit,1),v_row.restaurant_id,COALESCE(v_row.is_first_order_only,false),
    COALESCE(v_row.is_stackable,false),COALESCE(v_row.valid_from,now()),v_row.valid_until,
    COALESCE(v_row.is_active,false),v_row.required_tok_one_benefit,v_row.required_miamz_tier)
  ON CONFLICT(id) DO UPDATE SET code=excluded.code,type=excluded.type,value=excluded.value,
    min_order_amount=excluded.min_order_amount,max_discount=excluded.max_discount,max_uses=excluded.max_uses,
    per_user_limit=excluded.per_user_limit,restaurant_id=excluded.restaurant_id,
    is_first_order_only=excluded.is_first_order_only,is_stackable=excluded.is_stackable,
    valid_from=excluded.valid_from,valid_until=excluded.valid_until,is_active=excluded.is_active,
    required_tok_one_benefit=excluded.required_tok_one_benefit,required_miamz_tier=excluded.required_miamz_tier;
  INSERT INTO public.audit_log(user_id,action,entity_type,entity_id,old_data,new_data)
  VALUES(auth.uid(),'admin_save_promo_code','promo_code',v_id,v_old,p_payload||jsonb_build_object('reason',p_reason));
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_save_promo_code(uuid,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_save_promo_code(uuid,jsonb,text) TO authenticated;

CREATE TABLE IF NOT EXISTS public.member_benefit_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK(length(title) BETWEEN 3 AND 160),
  description text NOT NULL CHECK(length(description) BETWEEN 3 AND 3000),
  benefit text NOT NULL CHECK(benefit IN ('surprise_offers','early_deals','exclusive_partner_events','restaurant_gifts')),
  audience text NOT NULL CHECK(audience IN ('tok_one','miamz')),
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL,
  promo_code_id uuid REFERENCES public.promo_codes(id),
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(ends_at>starts_at),
  CHECK((audience='tok_one' AND benefit='surprise_offers') OR (audience='miamz' AND benefit<>'surprise_offers'))
);
CREATE TABLE IF NOT EXISTS public.member_benefit_claims (
  campaign_id uuid NOT NULL REFERENCES public.member_benefit_campaigns(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  claimed_at timestamptz NOT NULL DEFAULT now(),
  claim_reference uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  fulfilled_at timestamptz,
  fulfilled_by uuid REFERENCES auth.users(id),
  PRIMARY KEY(campaign_id,user_id)
);
ALTER TABLE public.member_benefit_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_benefit_claims ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS member_campaign_admin_read ON public.member_benefit_campaigns;
CREATE POLICY member_campaign_admin_read ON public.member_benefit_campaigns FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS member_claim_own_read ON public.member_benefit_claims;
CREATE POLICY member_claim_own_read ON public.member_benefit_claims FOR SELECT TO authenticated USING(user_id=auth.uid() OR public.has_role(auth.uid(),'admin'));
REVOKE ALL ON public.member_benefit_campaigns,public.member_benefit_claims FROM anon,authenticated;
GRANT SELECT ON public.member_benefit_campaigns,public.member_benefit_claims TO authenticated;
CREATE INDEX IF NOT EXISTS member_campaign_active_dates_idx ON public.member_benefit_campaigns(ends_at,starts_at) WHERE is_active;
CREATE INDEX IF NOT EXISTS member_claim_user_idx ON public.member_benefit_claims(user_id,campaign_id);

CREATE OR REPLACE FUNCTION public.get_my_benefit_campaigns()
RETURNS TABLE(id uuid,title text,description text,benefit text,ends_at timestamptz,claimed_at timestamptz,code text,claim_reference uuid,fulfilled_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT c.id,c.title,c.description,c.benefit,c.ends_at,r.claimed_at,
    CASE WHEN r.user_id IS NOT NULL AND public.promo_code_is_eligible(p.id,auth.uid()) THEN p.code ELSE NULL END,r.claim_reference,r.fulfilled_at
  FROM public.member_benefit_campaigns c
  LEFT JOIN public.member_benefit_claims r ON r.campaign_id=c.id AND r.user_id=auth.uid()
  LEFT JOIN public.promo_codes p ON p.id=c.promo_code_id AND p.is_active
  WHERE auth.uid() IS NOT NULL AND c.is_active AND c.starts_at<=now() AND c.ends_at>now()
    AND ((c.audience='tok_one' AND public.has_tok_one_benefit(auth.uid(),c.benefit))
      OR (c.audience='miamz' AND public.user_has_miamz_benefit(auth.uid(),c.benefit)))
  ORDER BY c.ends_at,c.id LIMIT 100;
$$;
CREATE OR REPLACE FUNCTION public.claim_member_benefit(p_campaign_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.assert_commercial_demo_production_rpc_allowed();
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.member_benefit_campaigns WHERE id=p_campaign_id FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM public.get_my_benefit_campaigns() WHERE id=p_campaign_id) THEN
    RAISE EXCEPTION 'Offer expired or not eligible' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.member_benefit_claims(campaign_id,user_id) VALUES(p_campaign_id,auth.uid()) ON CONFLICT DO NOTHING;
END;
$$;
CREATE OR REPLACE FUNCTION public.admin_save_member_campaign(p_id uuid,p_payload jsonb,p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_row public.member_benefit_campaigns%ROWTYPE; v_id uuid := COALESCE(p_id,gen_random_uuid()); v_old jsonb;
BEGIN
  PERFORM public.assert_commercial_demo_production_rpc_allowed();
  IF NOT COALESCE(public.has_role(auth.uid(),'admin'),false) THEN RAISE EXCEPTION 'Admin access required' USING ERRCODE='42501'; END IF;
  IF length(trim(COALESCE(p_reason,'')))<6 THEN RAISE EXCEPTION 'Reason required'; END IF;
  SELECT to_jsonb(c) INTO v_old FROM public.member_benefit_campaigns c WHERE id=p_id FOR UPDATE;
  IF p_id IS NOT NULL AND NOT FOUND THEN RAISE EXCEPTION 'Campaign not found'; END IF;
  v_row := jsonb_populate_record(NULL::public.member_benefit_campaigns,p_payload);
  INSERT INTO public.member_benefit_campaigns(id,title,description,benefit,audience,starts_at,ends_at,promo_code_id,is_active)
  VALUES(v_id,v_row.title,v_row.description,v_row.benefit,v_row.audience,COALESCE(v_row.starts_at,now()),v_row.ends_at,v_row.promo_code_id,COALESCE(v_row.is_active,false))
  ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,benefit=excluded.benefit,
    audience=excluded.audience,starts_at=excluded.starts_at,ends_at=excluded.ends_at,promo_code_id=excluded.promo_code_id,is_active=excluded.is_active;
  INSERT INTO public.audit_log(user_id,action,entity_type,entity_id,old_data,new_data)
  VALUES(auth.uid(),'admin_save_member_campaign','member_campaign',v_id,v_old,p_payload||jsonb_build_object('reason',p_reason));
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_benefit_campaigns(),public.claim_member_benefit(uuid),public.admin_save_member_campaign(uuid,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_my_benefit_campaigns(),public.claim_member_benefit(uuid),public.admin_save_member_campaign(uuid,jsonb,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.admin_member_campaign_claims(p_campaign_id uuid,p_offset integer DEFAULT 0)
RETURNS TABLE(user_id uuid,member_name text,claim_reference uuid,claimed_at timestamptz,fulfilled_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT COALESCE(public.has_role(auth.uid(),'admin'),false) THEN RAISE EXCEPTION 'Admin access required' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT c.user_id,p.full_name,c.claim_reference,c.claimed_at,c.fulfilled_at
 FROM public.member_benefit_claims c LEFT JOIN public.profiles p ON p.user_id=c.user_id
 WHERE c.campaign_id=p_campaign_id ORDER BY c.fulfilled_at NULLS FIRST,c.claimed_at,c.user_id
 LIMIT 50 OFFSET GREATEST(0,LEAST(COALESCE(p_offset,0),100000));
END;
$$;
CREATE OR REPLACE FUNCTION public.admin_fulfill_member_benefit(p_campaign_id uuid,p_user_id uuid,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.assert_commercial_demo_production_rpc_allowed();
 IF NOT COALESCE(public.has_role(auth.uid(),'admin'),false) THEN RAISE EXCEPTION 'Admin access required' USING ERRCODE='42501'; END IF;
 IF length(trim(COALESCE(p_reason,'')))<6 THEN RAISE EXCEPTION 'Reason required'; END IF;
 UPDATE public.member_benefit_claims SET fulfilled_at=now(),fulfilled_by=auth.uid()
 WHERE campaign_id=p_campaign_id AND user_id=p_user_id AND fulfilled_at IS NULL;
 IF FOUND THEN
 INSERT INTO public.audit_log(user_id,action,entity_type,entity_id,new_data)
 VALUES(auth.uid(),'fulfill_member_benefit','member_campaign',p_campaign_id,jsonb_build_object('member_id',p_user_id,'reason',p_reason));
 ELSIF NOT EXISTS(SELECT 1 FROM public.member_benefit_claims WHERE campaign_id=p_campaign_id AND user_id=p_user_id) THEN
 RAISE EXCEPTION 'Claim not found'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_member_campaign_claims(uuid,integer),public.admin_fulfill_member_benefit(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_member_campaign_claims(uuid,integer),public.admin_fulfill_member_benefit(uuid,uuid,text) TO authenticated;
GRANT ALL ON public.member_benefit_campaigns,public.member_benefit_claims TO service_role;
COMMIT;
