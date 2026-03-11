-- Add Stripe Connect account ID to restaurants
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS stripe_account_id text;

-- Index for quick lookup during checkout
CREATE INDEX IF NOT EXISTS idx_restaurants_stripe_account ON restaurants(stripe_account_id) WHERE stripe_account_id IS NOT NULL;

COMMENT ON COLUMN restaurants.stripe_account_id IS 'Stripe Connected Account ID (acct_xxx) for payment routing via Stripe Connect';
