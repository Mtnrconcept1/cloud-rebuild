-- Lock scheduler-only maintenance RPCs and direct payment lifecycle mutations
-- out of the public API surface. These paths mutate global reservation/group
-- lifecycle state or Stripe-backed member orders and must not be callable by
-- ordinary signed-in users through PostgREST.

BEGIN;

REVOKE EXECUTE ON FUNCTION public.mark_noshow_reservations() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_noshow_reservations() FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_noshow_reservations() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.mark_noshow_reservations() TO service_role;

REVOKE EXECUTE ON FUNCTION public.cleanup_expired_groups() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_groups() FROM anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_groups() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_groups() TO service_role;

REVOKE EXECUTE ON FUNCTION public.close_due_match_groups() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.close_due_match_groups() FROM anon;
REVOKE EXECUTE ON FUNCTION public.close_due_match_groups() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.close_due_match_groups() TO service_role;

REVOKE EXECUTE ON FUNCTION public.generate_tok_payable_invoice(uuid, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_tok_payable_invoice(uuid, date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_tok_payable_invoice(uuid, date) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.generate_tok_payable_invoice(uuid, date) TO service_role;

REVOKE EXECUTE ON FUNCTION public.generate_tok_payable_invoices_all(date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_tok_payable_invoices_all(date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_tok_payable_invoices_all(date) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.generate_tok_payable_invoices_all(date) TO service_role;

REVOKE EXECUTE ON FUNCTION public.generate_tok_reservation_fee_invoice(uuid, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_tok_reservation_fee_invoice(uuid, date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_tok_reservation_fee_invoice(uuid, date) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.generate_tok_reservation_fee_invoice(uuid, date) TO service_role;

REVOKE EXECUTE ON FUNCTION public.generate_tok_reservation_fee_invoices_all(date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_tok_reservation_fee_invoices_all(date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_tok_reservation_fee_invoices_all(date) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.generate_tok_reservation_fee_invoices_all(date) TO service_role;

DROP POLICY IF EXISTS "group_member_orders_update_own_draft" ON public.group_member_orders;
DROP POLICY IF EXISTS "group_member_orders_update_admin_only" ON public.group_member_orders;

CREATE POLICY "group_member_orders_update_admin_only"
  ON public.group_member_orders
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Restaurant owners can update orders" ON public.orders;
DROP POLICY IF EXISTS "orders_admin_update_only" ON public.orders;

CREATE POLICY "orders_admin_update_only"
  ON public.orders
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users can cancel their reservations" ON public.reservations;
DROP POLICY IF EXISTS "Restaurant owners can update reservations" ON public.reservations;
DROP POLICY IF EXISTS "reservations_admin_update_only" ON public.reservations;

CREATE POLICY "reservations_admin_update_only"
  ON public.reservations
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

NOTIFY pgrst, 'reload schema';

COMMIT;
