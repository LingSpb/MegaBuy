-- Shopping list table for products people want to buy in current mega buy
CREATE TABLE IF NOT EXISTS shopping_list (
  id SERIAL PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  added_by TEXT,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(product_id)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_shopping_list_product_id ON shopping_list(product_id);
