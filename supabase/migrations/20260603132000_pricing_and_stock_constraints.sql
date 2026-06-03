ALTER FUNCTION public.decrement_stock(text, uuid, integer) SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.decrement_stock(text, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_stock(text, uuid, integer) TO service_role;

UPDATE public.menu_items
SET price = 0.01
WHERE price <= 0;

UPDATE public.anti_waste_offers
SET original_price = GREATEST(original_price, discounted_price, 0.01)
WHERE original_price <= 0
   OR discounted_price <= 0
   OR discounted_price > original_price;

UPDATE public.anti_waste_offers
SET discounted_price = LEAST(GREATEST(discounted_price, 0.01), original_price)
WHERE discounted_price <= 0
   OR discounted_price > original_price;

UPDATE public.anti_waste_offers
SET quantity_available = GREATEST(quantity_available, 0)
WHERE quantity_available < 0;

UPDATE public.flash_sales
SET original_price = GREATEST(original_price, discounted_price, 0.01)
WHERE original_price <= 0
   OR discounted_price <= 0
   OR discounted_price > original_price;

UPDATE public.flash_sales
SET discounted_price = LEAST(GREATEST(discounted_price, 0.01), original_price)
WHERE discounted_price <= 0
   OR discounted_price > original_price;

UPDATE public.flash_sales
SET quantity_available = GREATEST(quantity_available, 0)
WHERE quantity_available < 0;

UPDATE public.chef_table_drops
SET price = 0.01
WHERE price <= 0;

UPDATE public.chef_table_drops
SET original_price = NULL
WHERE original_price IS NOT NULL
  AND original_price <= 0;

UPDATE public.chef_table_drops
SET total_portions = GREATEST(total_portions, 1),
    remaining_portions = LEAST(GREATEST(remaining_portions, 0), GREATEST(total_portions, 1))
WHERE total_portions <= 0
   OR remaining_portions < 0
   OR remaining_portions > total_portions;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'menu_items_price_positive_check'
      AND conrelid = 'public.menu_items'::regclass
  ) THEN
    ALTER TABLE public.menu_items
      ADD CONSTRAINT menu_items_price_positive_check
      CHECK (price > 0) NOT VALID;
    ALTER TABLE public.menu_items
      VALIDATE CONSTRAINT menu_items_price_positive_check;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'anti_waste_offers_prices_positive_check'
      AND conrelid = 'public.anti_waste_offers'::regclass
  ) THEN
    ALTER TABLE public.anti_waste_offers
      ADD CONSTRAINT anti_waste_offers_prices_positive_check
      CHECK (original_price > 0 AND discounted_price > 0 AND discounted_price <= original_price) NOT VALID;
    ALTER TABLE public.anti_waste_offers
      VALIDATE CONSTRAINT anti_waste_offers_prices_positive_check;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'anti_waste_offers_quantity_non_negative_check'
      AND conrelid = 'public.anti_waste_offers'::regclass
  ) THEN
    ALTER TABLE public.anti_waste_offers
      ADD CONSTRAINT anti_waste_offers_quantity_non_negative_check
      CHECK (quantity_available >= 0) NOT VALID;
    ALTER TABLE public.anti_waste_offers
      VALIDATE CONSTRAINT anti_waste_offers_quantity_non_negative_check;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'flash_sales_prices_positive_check'
      AND conrelid = 'public.flash_sales'::regclass
  ) THEN
    ALTER TABLE public.flash_sales
      ADD CONSTRAINT flash_sales_prices_positive_check
      CHECK (original_price > 0 AND discounted_price > 0 AND discounted_price <= original_price) NOT VALID;
    ALTER TABLE public.flash_sales
      VALIDATE CONSTRAINT flash_sales_prices_positive_check;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'flash_sales_quantity_non_negative_check'
      AND conrelid = 'public.flash_sales'::regclass
  ) THEN
    ALTER TABLE public.flash_sales
      ADD CONSTRAINT flash_sales_quantity_non_negative_check
      CHECK (quantity_available >= 0) NOT VALID;
    ALTER TABLE public.flash_sales
      VALIDATE CONSTRAINT flash_sales_quantity_non_negative_check;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chef_table_drops_price_positive_check'
      AND conrelid = 'public.chef_table_drops'::regclass
  ) THEN
    ALTER TABLE public.chef_table_drops
      ADD CONSTRAINT chef_table_drops_price_positive_check
      CHECK (price > 0 AND (original_price IS NULL OR original_price > 0)) NOT VALID;
    ALTER TABLE public.chef_table_drops
      VALIDATE CONSTRAINT chef_table_drops_price_positive_check;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chef_table_drops_portions_valid_check'
      AND conrelid = 'public.chef_table_drops'::regclass
  ) THEN
    ALTER TABLE public.chef_table_drops
      ADD CONSTRAINT chef_table_drops_portions_valid_check
      CHECK (total_portions > 0 AND remaining_portions >= 0 AND remaining_portions <= total_portions) NOT VALID;
    ALTER TABLE public.chef_table_drops
      VALIDATE CONSTRAINT chef_table_drops_portions_valid_check;
  END IF;
END $$;

INSERT INTO public.feature_flags (name, label, description, is_active)
VALUES (
  'admin-platform-config',
  'Admin: Configuration plateforme',
  'Expose le panneau de configuration plateforme et la gouvernance des feature flags.',
  true
)
ON CONFLICT (name) DO UPDATE
SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  updated_at = now();

NOTIFY pgrst, 'reload schema';
