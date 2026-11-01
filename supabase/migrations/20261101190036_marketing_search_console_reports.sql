-- A single private snapshot for TOK. Only the database operator imports it.
CREATE TABLE public.marketing_search_console_report (
  property text PRIMARY KEY CHECK (property = 'sc-domain:thetok.ch'),
  period_end date NOT NULL,
  snapshot jsonb NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(snapshot) = 'object' AND snapshot ?& ARRAY['property','from','to','daily','queries']),
  CHECK (snapshot->>'property' = property AND (snapshot->>'to')::date = period_end),
  CHECK (jsonb_typeof(snapshot->'daily') = 'array' AND jsonb_typeof(snapshot->'queries') = 'array'),
  CHECK (octet_length(snapshot::text) <= 800000)
);
ALTER TABLE public.marketing_search_console_report ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_search_console_report FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketing_search_console_report FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.marketing_search_console_report TO service_role;
