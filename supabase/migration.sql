-- ============================================================
-- MegaBuy Database Schema for Supabase
-- Run this in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/yemtivdkllpyxciexiqc/sql
-- ============================================================

-- 1) Categories table
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2) Products table
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category_id TEXT NOT NULL REFERENCES categories(id),
  description TEXT DEFAULT '',
  selling_type TEXT NOT NULL CHECK (selling_type IN ('unit', 'package')),
  unit_label TEXT DEFAULT 'piece',
  unit_price NUMERIC,
  price NUMERIC NOT NULL,
  package_quantity INTEGER DEFAULT 1,
  package_unit TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3) Orders table
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  person_name TEXT NOT NULL,
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  state TEXT NOT NULL DEFAULT 'Draft' CHECK (state IN ('Draft', 'Locked', 'Closed')),
  order_type TEXT,
  child_order_ids TEXT[],
  source_order_ids TEXT[],
  immutable_items BOOLEAN DEFAULT false,
  total_amount NUMERIC DEFAULT 0,
  locked_by_mega_order_id TEXT,
  locked_at TIMESTAMPTZ,
  placed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4) Order items table
CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  quantity NUMERIC NOT NULL,
  unit TEXT NOT NULL,
  unit_price NUMERIC,
  line_total NUMERIC,
  sort_order INTEGER DEFAULT 0
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_orders_state ON orders(state);
CREATE INDEX IF NOT EXISTS idx_orders_order_type ON orders(order_type);

-- Enable Row Level Security (but allow all for now since this is a simple app)
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- Create policies that allow all operations (using service role key / anon key)
CREATE POLICY "Allow all on categories" ON categories FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on products" ON products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on orders" ON orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on order_items" ON order_items FOR ALL USING (true) WITH CHECK (true);
