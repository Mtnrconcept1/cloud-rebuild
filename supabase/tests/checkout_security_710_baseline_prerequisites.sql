-- Disposable replay ONLY: satisfy the explicit data precondition of the
-- historical 20260909133500 migration without importing any real prospects.
-- No email, phone, external site or production dataset is copied.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.marketing_contacts
             WHERE source_system='commercial_prospect_catalog'
             AND source_objectid BETWEEN 2600000001 AND 2600000520) THEN
    RAISE EXCEPTION 'Expected empty disposable prospect fixture range';
  END IF;
END $$;
INSERT INTO public.marketing_contacts
 (contact_type,source_system,source_objectid,source_reference,display_name,
  branch,city,postal_code,street_address,metadata)
SELECT 'restaurant_prospect','commercial_prospect_catalog',2600000000+n,
       (2600000000+n)::text,'Synthetic replay restaurant ' || n,
       'Restaurant référencé sur TheFork','Geneve','1201',
       n || ' Rue Synthetic, 1201 Geneve','{"fixture":"security710-baseline"}'::jsonb
FROM generate_series(1,520) n WHERE n NOT BETWEEN 121 AND 200;
COMMIT;
