-- =============================================================================
-- PATCH: Sync Categories from Product Codes
-- Date: 2026-05-09
-- =============================================================================
-- 
-- CATEGORY SYSTEM
-- ================
-- Categories are auto-derived from product codes (first letter).
-- 
-- Mapping:
--   C = Chinese
--   D = Frozen (Đông lạnh)
--   F = Fruits & Desserts
--   H = H
--   I = I
--   J = Japanese
--   K = Korean
--   L = Lee Kum Kee
--   M = Monika
--   N = Dairy & Non-Food
--   P = Philippines
--   T = Thai
--   U = UK/European
--   V = Vietnamese
-- 
-- This script:
-- 1. Creates categories with proper names based on the mapping
-- 2. Links all products to their corresponding category via product_metadata
-- 
-- Run this in Supabase SQL Editor to sync existing products.
-- =============================================================================

-- Step 1: Create categories with proper names using CASE expression
INSERT INTO categories (id, name, description, created_at)
SELECT DISTINCT 
  UPPER(LEFT(id, 1)) as id,
  CASE UPPER(LEFT(id, 1))
    WHEN 'C' THEN 'Chinese'
    WHEN 'D' THEN 'Frozen (Đông lạnh)'
    WHEN 'F' THEN 'Fruits & Desserts'
    WHEN 'H' THEN 'H'
    WHEN 'I' THEN 'I'
    WHEN 'J' THEN 'Japanese'
    WHEN 'K' THEN 'Korean'
    WHEN 'L' THEN 'Lee Kum Kee'
    WHEN 'M' THEN 'Monika'
    WHEN 'N' THEN 'Dairy & Non-Food'
    WHEN 'P' THEN 'Philippines'
    WHEN 'T' THEN 'Thai'
    WHEN 'U' THEN 'UK/European'
    WHEN 'V' THEN 'Vietnamese'
    ELSE UPPER(LEFT(id, 1))
  END as name,
  '' as description,
  NOW() as created_at
FROM products
WHERE LEFT(id, 1) ~ '[A-Za-z]'
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
WHERE categories.name = categories.id;  -- Only update if name is still the default letter

-- Step 2: Upsert product_metadata with category_id from product code
INSERT INTO product_metadata (product_id, category_id, selling_type, unit_label)
SELECT 
  p.id as product_id,
  UPPER(LEFT(p.id, 1)) as category_id,
  'package' as selling_type,
  'unit' as unit_label
FROM products p
WHERE LEFT(p.id, 1) ~ '[A-Za-z]'
ON CONFLICT (product_id) 
DO UPDATE SET category_id = EXCLUDED.category_id;

-- Step 3: Verify results - shows category distribution
SELECT 
  c.id as category_id,
  c.name as category_name,
  COUNT(pm.product_id) as product_count
FROM categories c
LEFT JOIN product_metadata pm ON pm.category_id = c.id
WHERE LENGTH(c.id) = 1
GROUP BY c.id, c.name
ORDER BY c.id;

-- Example output:
-- | category_id | category_name | product_count |
-- |-------------|---------------|---------------|
-- | C           | C             | 245           |
-- | D           | D             | 312           |
-- | T           | T             | 456           |
-- | ...         | ...           | ...           |
