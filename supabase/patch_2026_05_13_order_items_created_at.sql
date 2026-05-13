-- Add created_at and updated_at to order_items table
-- This allows tracking when each product was added to an order

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Set created_at for existing items to match their order's created_at
UPDATE order_items oi
SET created_at = o.created_at, updated_at = o.created_at
FROM orders o
WHERE oi.order_id = o.id AND oi.created_at IS NULL;
