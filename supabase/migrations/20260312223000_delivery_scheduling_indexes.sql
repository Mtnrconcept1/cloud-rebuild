CREATE INDEX IF NOT EXISTS idx_orders_scheduled_delivery_dispatch
ON public.orders (scheduled_at)
WHERE scheduled_at IS NOT NULL AND delivery_address IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dispatch_jobs_order_status
ON public.dispatch_jobs (order_id, status);
