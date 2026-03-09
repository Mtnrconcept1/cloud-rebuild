
-- Recreate triggers with IF NOT EXISTS pattern
DROP TRIGGER IF EXISTS audit_orders ON public.orders;
DROP TRIGGER IF EXISTS audit_reservations ON public.reservations;
DROP TRIGGER IF EXISTS audit_restaurants ON public.restaurants;
DROP TRIGGER IF EXISTS trigger_recompute_review_stats ON public.reviews;
DROP TRIGGER IF EXISTS trigger_order_status_notification ON public.orders;
DROP TRIGGER IF EXISTS set_updated_at_orders ON public.orders;
DROP TRIGGER IF EXISTS set_updated_at_restaurants ON public.restaurants;
DROP TRIGGER IF EXISTS set_updated_at_delivery_tracking ON public.delivery_tracking;
DROP TRIGGER IF EXISTS set_updated_at_flash_sales ON public.flash_sales;

CREATE TRIGGER audit_orders AFTER INSERT OR UPDATE OR DELETE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.log_audit();
CREATE TRIGGER audit_reservations AFTER INSERT OR UPDATE OR DELETE ON public.reservations FOR EACH ROW EXECUTE FUNCTION public.log_audit();
CREATE TRIGGER audit_restaurants AFTER INSERT OR UPDATE OR DELETE ON public.restaurants FOR EACH ROW EXECUTE FUNCTION public.log_audit();
CREATE TRIGGER trigger_recompute_review_stats AFTER INSERT OR UPDATE OR DELETE ON public.reviews FOR EACH ROW EXECUTE FUNCTION public.trigger_recompute_review_stats();
CREATE TRIGGER trigger_order_status_notification AFTER UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.trigger_order_status_notification();
CREATE TRIGGER set_updated_at_orders BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_updated_at_restaurants BEFORE UPDATE ON public.restaurants FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_updated_at_delivery_tracking BEFORE UPDATE ON public.delivery_tracking FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_updated_at_flash_sales BEFORE UPDATE ON public.flash_sales FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
