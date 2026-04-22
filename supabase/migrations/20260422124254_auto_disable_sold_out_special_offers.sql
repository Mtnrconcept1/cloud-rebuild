CREATE OR REPLACE FUNCTION public.auto_disable_sold_out_special_offer()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO public
AS $function$
BEGIN
  NEW.quantity_available := GREATEST(COALESCE(NEW.quantity_available, 0), 0);

  IF NEW.quantity_available = 0 THEN
    NEW.is_active := false;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS auto_disable_sold_out_anti_waste_offers ON public.anti_waste_offers;
CREATE TRIGGER auto_disable_sold_out_anti_waste_offers
BEFORE INSERT OR UPDATE OF quantity_available, is_active
ON public.anti_waste_offers
FOR EACH ROW
EXECUTE FUNCTION public.auto_disable_sold_out_special_offer();

DROP TRIGGER IF EXISTS auto_disable_sold_out_flash_sales ON public.flash_sales;
CREATE TRIGGER auto_disable_sold_out_flash_sales
BEFORE INSERT OR UPDATE OF quantity_available, is_active
ON public.flash_sales
FOR EACH ROW
EXECUTE FUNCTION public.auto_disable_sold_out_special_offer();

UPDATE public.anti_waste_offers
SET is_active = false
WHERE COALESCE(quantity_available, 0) <= 0
  AND COALESCE(is_active, true) = true;

UPDATE public.flash_sales
SET is_active = false
WHERE COALESCE(quantity_available, 0) <= 0
  AND COALESCE(is_active, true) = true;
