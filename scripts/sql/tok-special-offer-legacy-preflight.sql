-- Read-only, no personal data. Run immediately before rollout.
-- If ledger_exists=false, candidate_unpaid_unrestored_orders are all without ledger.
-- Any nonzero candidate count blocks automatic rollout pending provenance review.
SELECT to_regclass('public.order_special_offer_stock_reservations') IS NOT NULL AS ledger_exists;
WITH special AS (
 SELECT o.id,o.status,o.payment_status,o.metadata,o.restaurant_id,
   i.menu_item_id,i.quantity,i.restaurant_id AS item_restaurant_id,
   CASE
     WHEN i.metadata->>'anti_waste_offer_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN 'anti_waste'
     WHEN i.metadata->>'flash_sale_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN 'flash'
     ELSE 'invalid' END AS kind
 FROM public.orders o JOIN public.order_items i ON i.order_id=o.id
 WHERE i.metadata ? 'anti_waste_offer_id' OR i.metadata ? 'flash_sale_id'
)
SELECT count(DISTINCT id) AS all_special_orders,
 count(DISTINCT id) FILTER(WHERE menu_item_id IS NULL
   AND status IN ('pending_payment','payment_failed','cancelled')
   AND COALESCE(payment_status,'') NOT IN ('captured','paid','refunded')
   AND NULLIF(metadata->>'special_offer_stock_restored_at','') IS NULL
 ) AS candidate_unpaid_unrestored_orders,
 count(*) FILTER(WHERE menu_item_id IS NOT NULL) AS menu_metadata_not_debited_lines,
 count(*) FILTER(WHERE menu_item_id IS NULL AND
   (kind='invalid' OR quantity<=0 OR item_restaurant_id IS DISTINCT FROM restaurant_id)
 ) AS suspicious_special_lines
FROM special;
