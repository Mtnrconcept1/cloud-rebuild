
-- Invoice settings table for restaurant branding
CREATE TABLE public.restaurant_invoice_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  logo_url text,
  company_name text,
  company_address text,
  company_city text,
  company_postal_code text,
  company_country text DEFAULT 'Suisse',
  siret text,
  vat_number text,
  iban text,
  bic text,
  bank_name text,
  payment_terms text DEFAULT 'Paiement à 30 jours',
  footer_note text,
  email text,
  phone text,
  website text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id)
);

ALTER TABLE public.restaurant_invoice_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Restaurant owners can manage invoice settings"
  ON public.restaurant_invoice_settings FOR ALL
  USING (EXISTS (SELECT 1 FROM restaurants r WHERE r.id = restaurant_invoice_settings.restaurant_id AND r.owner_id = auth.uid()));

CREATE POLICY "Admins can manage invoice settings"
  ON public.restaurant_invoice_settings FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Add invoice_number to restaurant_invoices
ALTER TABLE public.restaurant_invoices ADD COLUMN IF NOT EXISTS invoice_number text;

-- Storage bucket for invoice logos. Supabase preview branches may provision it
-- before replaying migrations, so preserve the existing hardened definition.
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoice-logos', 'invoice-logos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Restaurant owners can upload invoice logos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'invoice-logos' AND auth.role() = 'authenticated');

CREATE POLICY "Anyone can view invoice logos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'invoice-logos');

CREATE POLICY "Restaurant owners can delete their logos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'invoice-logos' AND auth.role() = 'authenticated');

-- Function to auto-generate monthly invoices
CREATE OR REPLACE FUNCTION public.generate_monthly_invoices(p_month text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_month date;
  period_s date;
  period_e date;
  r record;
  inv_count integer := 0;
  next_num integer;
  rev numeric;
  tva_rate numeric := 0.077; -- Swiss TVA 7.7%
BEGIN
  target_month := COALESCE(p_month::date, (date_trunc('month', now()) - interval '1 month')::date);
  period_s := target_month;
  period_e := (target_month + interval '1 month' - interval '1 day')::date;

  FOR r IN SELECT id, name FROM restaurants WHERE is_active = true LOOP
    -- Skip if invoice already exists for this period
    IF EXISTS (SELECT 1 FROM restaurant_invoices WHERE restaurant_id = r.id AND period_start = period_s AND period_end = period_e) THEN
      CONTINUE;
    END IF;

    -- Calculate revenue from orders
    SELECT COALESCE(SUM(total_amount), 0) INTO rev
    FROM orders
    WHERE restaurant_id = r.id AND status != 'cancelled'
      AND created_at >= period_s::timestamptz AND created_at < (period_e + interval '1 day')::timestamptz;

    -- Only create invoice if there was revenue
    IF rev > 0 THEN
      -- Generate sequential invoice number
      SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM '[0-9]+$') AS integer)), 0) + 1
      INTO next_num FROM restaurant_invoices WHERE restaurant_id = r.id;

      INSERT INTO restaurant_invoices (restaurant_id, period_start, period_end, amount_ht, amount_tva, amount_ttc, status, invoice_number, due_at)
      VALUES (
        r.id, period_s, period_e,
        ROUND(rev / (1 + tva_rate), 2),
        ROUND(rev - rev / (1 + tva_rate), 2),
        ROUND(rev, 2),
        'pending',
        'FAC-' || TO_CHAR(period_s, 'YYYYMM') || '-' || LPAD(next_num::text, 4, '0'),
        (period_e + interval '30 days')::timestamptz
      );
      inv_count := inv_count + 1;
    END IF;
  END LOOP;

  RETURN inv_count;
END;
$$;
