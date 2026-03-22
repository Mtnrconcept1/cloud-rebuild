-- Add disabled_payment_methods column to restaurants
-- Stores an array of payment method IDs that the restaurant has disabled
-- e.g. ['twint', 'postfinance_card']
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS disabled_payment_methods text[] DEFAULT '{}';
