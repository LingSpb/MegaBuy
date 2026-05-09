-- Discount products table for temporary price discounts
CREATE TABLE IF NOT EXISTS discount_products (
  id SERIAL PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  discount_price NUMERIC NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(product_id)
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_discount_products_product_id ON discount_products(product_id);

-- Allow all access (simple app without authentication)
ALTER TABLE discount_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to discount_products" ON discount_products FOR ALL USING (true) WITH CHECK (true);
