-- Delivery status table to track which products have been delivered to which person
CREATE TABLE IF NOT EXISTS delivery_status (
  id SERIAL PRIMARY KEY,
  mega_order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  child_order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'none' CHECK (status IN ('none', 'delivered')),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(mega_order_id, child_order_id, product_id)
);

-- Create index for fast lookups by mega order
CREATE INDEX IF NOT EXISTS idx_delivery_status_mega_order_id ON delivery_status(mega_order_id);

-- Allow all access (simple app without authentication)
ALTER TABLE delivery_status ENABLE ROW LEVEL SECURITY;

-- Create policy only if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'delivery_status' AND policyname = 'Allow all access to delivery_status'
  ) THEN
    CREATE POLICY "Allow all access to delivery_status" ON delivery_status FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
