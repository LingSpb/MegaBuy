-- MegaBuy production patch
-- Purpose: Add delivered_at column to track when orders are delivered
-- Date: 2026-04-03
-- Safe to run multiple times.

BEGIN;

DO $$
BEGIN
  -- Add the delivered_at column if it doesn't exist (nullable for backward compatibility)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'orders'
      AND column_name = 'delivered_at'
  ) THEN
    ALTER TABLE orders ADD COLUMN delivered_at TIMESTAMPTZ;
  END IF;
END
$$;

-- Backfill existing Delivered and Closed orders with fallback timestamp
-- Using 2026-04-02 21:29:00 as the fallback for all existing delivered orders
UPDATE orders 
SET delivered_at = '2026-04-02T21:29:00.000Z'
WHERE state IN ('Delivered', 'Closed') 
  AND delivered_at IS NULL;

COMMIT;
