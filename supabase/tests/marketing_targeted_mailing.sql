-- Run after marketing_targeted_mailing_fixture.sql and the new migration (twice).
BEGIN;
INSERT INTO public.marketing_contacts(id,contact_type,canton,city,category,locale) VALUES
('11111111-1111-4111-8111-111111111111','restaurant_prospect','GE','Genève','Pizzeria','fr-CH'),
('22222222-2222-4222-8222-222222222222','restaurant_prospect','GE','Carouge','italian;italian_pizza','fr-CH'),
('33333333-3333-4333-8333-333333333333','restaurant_prospect','VD','Lausanne','Japonais','fr-CH'),
('44444444-4444-4444-8444-444444444444','registered_user','GE','Genève','Pizzeria','fr-CH');
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
DO $$
DECLARE v_case record; v_count integer; v_page jsonb; v_next jsonb; v_content jsonb; v_rejected boolean; v_role text;
BEGIN
  FOR v_case IN SELECT * FROM (VALUES
    ('{"audience_kind":"restaurant","selections":{"category":["Pizzeria"]}}'::jsonb,1),
    ('{"audience_kind":"restaurant","selections":{"city":["Genève","Carouge"]}}'::jsonb,2),
    ('{"audience_kind":"restaurant","selections":{"city":["Genève","Carouge"],"category":["Pizzeria","italian_pizza"]}}'::jsonb,2),
    ('{"audience_kind":"restaurant","selections":{"city":["Genève"],"category":["Japonais"]}}'::jsonb,0),
    ('{"audience_kind":"restaurant","selections":{"city":[]}}'::jsonb,0),
    ('{"audience_kind":"restaurant","selections":{}}'::jsonb,3),
    ('{"audience_kind":"restaurant","city":"Genève"}'::jsonb,1),
    ('{"audience_kind":"restaurant","selections":{"city":["genève"]}}'::jsonb,1)
  ) cases(filter,expected) LOOP
    SELECT count(*) INTO v_count FROM public.marketing_contacts WHERE public.marketing_contact_matches_filter(id,v_case.filter);
    IF v_count <> v_case.expected THEN RAISE EXCEPTION 'Targeting failed: % -> %', v_case.filter,v_count; END IF;
  END LOOP;
  FOR v_case IN SELECT * FROM (VALUES
    ('{"city":"Genève"}'::jsonb), ('{"email":["secret"]}'::jsonb), ('{"city":[1]}'::jsonb)
  ) invalid(selections) LOOP
    v_rejected := false;
    BEGIN PERFORM public.marketing_validate_audience_filter(jsonb_build_object('audience_kind','restaurant','selections',v_case.selections));
    EXCEPTION WHEN invalid_parameter_value THEN v_rejected := true; END;
    IF NOT v_rejected THEN RAISE EXCEPTION 'Invalid selection accepted'; END IF;
  END LOOP;
  v_page := public.service_marketing_mailing_facets('city','',1,NULL);
  v_next := public.service_marketing_mailing_facets('city','',1,v_page ->> 'next');
  IF jsonb_array_length(v_page -> 'items') <> 1 OR v_page ->> 'next' IS NULL
     OR v_page -> 'items' -> 0 ->> 'value' = v_next -> 'items' -> 0 ->> 'value' THEN RAISE EXCEPTION 'Facet pagination failed'; END IF;
  v_page := public.service_marketing_mailing_facets('category','pizza');
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_page -> 'items') i WHERE i ->> 'value' = 'italian_pizza') THEN RAISE EXCEPTION 'Cuisine token missing'; END IF;
  PERFORM set_config('request.jwt.claims','{"role":"authenticated"}',true);
  v_rejected := false;
  BEGIN PERFORM public.service_marketing_mailing_facets('city');
  EXCEPTION WHEN insufficient_privilege THEN v_rejected := true; END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Service guard bypassed'; END IF;
  FOREACH v_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF has_function_privilege(v_role,'public.service_marketing_mailing_facets(text,text,integer,text)','EXECUTE') THEN RAISE EXCEPTION 'Unexpected grant for %',v_role; END IF;
  END LOOP;
  v_content := '{"mailing_version":"tok-mailing-v1","subject":"Objet","headline":"Titre","body":"Texte","call_to_action":"Voir","visual_url":"https://example.org/banner.jpg","visual_status":"pending_generation"}'::jsonb;
  INSERT INTO public.marketing_calendar_items VALUES ('55555555-5555-4555-8555-555555555555','email','draft','pending',v_content);
  v_rejected := false;
  BEGIN UPDATE public.marketing_calendar_items SET approval_status='approved',status='scheduled';
  EXCEPTION WHEN invalid_parameter_value THEN v_rejected := true; END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Incomplete mailing approved'; END IF;
  v_rejected := false;
  BEGIN UPDATE public.marketing_calendar_items SET content=v_content || '{"visual_status":"ready","body":42}'::jsonb,approval_status='approved';
  EXCEPTION WHEN invalid_parameter_value THEN v_rejected := true; END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Non-text mailing approved'; END IF;
  UPDATE public.marketing_calendar_items SET content=v_content || '{"visual_status":"ready"}'::jsonb,approval_status='approved',status='scheduled';
  IF strpos(pg_get_functiondef('public.service_prepare_marketing_email_delivery(uuid,uuid)'::regprocedure),'''content'', v_item.content') = 0 THEN RAISE EXCEPTION 'Delivery content handoff missing'; END IF;
END;
$$;
ROLLBACK;
