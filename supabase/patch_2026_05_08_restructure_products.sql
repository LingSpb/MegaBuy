-- Restructure products into raw data + metadata tables
-- =====================================================
-- This migration splits the old products table into:
-- 1. products (5 core fields: id, name, brand, price, package_quantity)
-- 2. product_metadata (category_id, description, selling_type, etc.)

-- First, add missing columns to old products table if they don't exist
-- (PostgreSQL doesn't have IF NOT EXISTS for ADD COLUMN, so we use DO block)
DO $$
BEGIN
  -- Add brand column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'products' AND column_name = 'brand') THEN
    ALTER TABLE products ADD COLUMN brand TEXT;
  END IF;
  
  -- Add code column if it doesn't exist (used as new id)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'products' AND column_name = 'code') THEN
    ALTER TABLE products ADD COLUMN code TEXT;
  END IF;
END $$;

-- 1) Create new products table with only 5 core fields
-- id = product code (e.g., "S01029")
CREATE TABLE IF NOT EXISTS products_new (
  id TEXT PRIMARY KEY,           -- product code
  name TEXT NOT NULL,
  brand TEXT,
  price NUMERIC NOT NULL,        -- unit price (per bag)
  package_quantity NUMERIC DEFAULT 1
);

-- 2) Create product_metadata table for additional info
CREATE TABLE IF NOT EXISTS product_metadata (
  product_id TEXT PRIMARY KEY REFERENCES products_new(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES categories(id),
  description TEXT DEFAULT '',
  selling_type TEXT NOT NULL DEFAULT 'package' CHECK (selling_type IN ('unit', 'package')),
  unit_label TEXT DEFAULT 'unit',
  unit_price NUMERIC,            -- computed: price (kept for compatibility)
  package_unit TEXT DEFAULT 'units',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3) Migrate existing data (if products table exists with data)
-- Uses COALESCE to handle nullable columns gracefully
INSERT INTO products_new (id, name, brand, price, package_quantity)
SELECT 
  COALESCE(code, id) as id,      -- Use code if set, otherwise fall back to old id
  name,
  brand,                          -- May be NULL
  COALESCE(unit_price, price / NULLIF(package_quantity, 0), price) as price,
  COALESCE(package_quantity, 1)
FROM products
ON CONFLICT (id) DO NOTHING;

INSERT INTO product_metadata (product_id, category_id, description, selling_type, unit_label, unit_price, package_unit, created_at)
SELECT 
  COALESCE(code, id) as product_id,
  category_id,
  COALESCE(description, ''),
  COALESCE(selling_type, 'package'),
  COALESCE(unit_label, 'unit'),
  unit_price,
  COALESCE(package_unit, 'units'),
  COALESCE(created_at, now())
FROM products
ON CONFLICT (product_id) DO NOTHING;

-- 4) Update order_items to use new product ids (code instead of old id)
-- Only update if the product had a code that differs from id
UPDATE order_items oi
SET product_id = p.code
FROM products p
WHERE oi.product_id = p.id
  AND p.code IS NOT NULL
  AND p.code != p.id;

-- 5) Drop old table and rename new one
DROP TABLE IF EXISTS products CASCADE;
ALTER TABLE products_new RENAME TO products;

-- 6) Create indexes
CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand);
CREATE INDEX IF NOT EXISTS idx_product_metadata_category_id ON product_metadata(category_id);
