-- Enforce one active progressive reservation offer per restaurant and service day.
-- Older duplicates are kept as drafts so historical configuration is not deleted.

WITH ranked_active_offers AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY restaurant_id, service_date
      ORDER BY booking_cutoff_at ASC, countdown_ends_at ASC, created_at ASC, id ASC
    ) AS daily_rank
  FROM public.reservation_progressive_offers
  WHERE status = 'active'
)
UPDATE public.reservation_progressive_offers offers
SET status = 'draft',
    metadata = COALESCE(offers.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'auto_hidden_reason', 'daily_progressive_offer_limit',
        'auto_hidden_at', now()
      ),
    updated_at = now()
FROM ranked_active_offers ranked
WHERE offers.id = ranked.id
  AND ranked.daily_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_reservation_progressive_offers_one_active_per_day
  ON public.reservation_progressive_offers(restaurant_id, service_date)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_reservation_progressive_offers_recurrence_lookup
  ON public.reservation_progressive_offers(restaurant_id, status, service_date, booking_cutoff_at);
