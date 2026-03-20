-- ============================================================
-- MegaBuy Seed Data
-- Run this AFTER migration.sql in Supabase SQL Editor
-- ============================================================

-- Insert categories
INSERT INTO categories (id, name, description, created_at) VALUES
  ('cat_meat', 'Meat & Poultry', 'Fresh and frozen meat, poultry products', '2026-03-19T08:00:00.000Z'),
  ('cat_seafood', 'Seafood', 'Fresh and frozen seafood products', '2026-03-19T08:00:00.000Z'),
  ('cat_rice', 'Rice & Grains', 'Rice, sticky rice and grain products', '2026-03-19T08:00:00.000Z'),
  ('cat_noodles', 'Noodles & Pasta', 'Dried and fresh noodles', '2026-03-19T08:00:00.000Z'),
  ('cat_sauce', 'Sauces & Condiments', 'Fish sauce, oyster sauce, seasoning', '2026-03-19T08:00:00.000Z'),
  ('cat_snacks', 'Snacks', 'Chips, crackers and snack items', '2026-03-19T08:00:00.000Z'),
  ('cat_vegetables', 'Vegetables & Pickled', 'Fresh vegetables and pickled products', '2026-03-19T08:00:00.000Z'),
  ('cat_drinks', 'Drinks & Beverages', 'Water, coconut drinks and beverages', '2026-03-19T08:00:00.000Z'),
  ('cat_frozen', 'Frozen Foods', 'Frozen meats, vegetables and ready meals', '2026-03-19T08:00:00.000Z'),
  ('cat_drygoods', 'Dry Goods', 'Peanuts, seaweed, dried ingredients', '2026-03-19T08:00:00.000Z')
ON CONFLICT (id) DO NOTHING;

-- Insert products
INSERT INTO products (id, name, category_id, description, selling_type, unit_label, unit_price, price, package_quantity, package_unit, created_at) VALUES
  ('prod_001', 'Whole Duck', 'cat_meat', 'Sold per piece', 'unit', 'piece', NULL, 163, 1, NULL, '2026-03-19T08:00:00.000Z'),
  ('prod_002', 'Squid', 'cat_seafood', '115.36 kr/kg. Sold by carton (10 kg per carton)', 'package', 'kg', 115.36, 1153.6, 10, 'kg', '2026-03-19T08:00:00.000Z'),
  ('prod_003', 'ST25 Rice 18kg', 'cat_rice', 'Premium ST25 rice, 18 kg bag', 'unit', 'bag', NULL, 358, 1, NULL, '2026-03-19T08:00:00.000Z'),
  ('prod_004', 'Sushi Rice 20kg', 'cat_rice', 'Sushi rice, 20 kg bag', 'unit', 'bag', NULL, 487.2, 1, NULL, '2026-03-19T08:00:00.000Z'),
  ('prod_005', 'Fish Sauce 500ml', 'cat_sauce', '38 kr/bottle. Sold by carton (12 bottles per carton)', 'package', 'bottle', 38, 456, 12, 'bottles', '2026-03-19T08:00:00.000Z'),
  ('prod_006', 'Oyster Sauce', 'cat_sauce', '29 kr/bottle. Sold by carton (12 bottles per carton)', 'package', 'bottle', 29, 348, 12, 'bottles', '2026-03-19T08:00:00.000Z'),
  ('prod_007', 'Duck Fillet', 'cat_meat', '76 kr/pack. Sold by carton (12 packs per carton)', 'package', 'pack', 76, 912, 12, 'packs', '2026-03-19T08:00:00.000Z'),
  ('prod_008', 'Rice Noodles', 'cat_noodles', '16.7 kr/pack. Sold by carton (30 packs per carton)', 'package', 'pack', 16.7, 501, 30, 'packs', '2026-03-19T08:00:00.000Z'),
  ('prod_009', 'Coconut Water', 'cat_drinks', '21.2 kr/bottle. Sold by carton (12 bottles per carton)', 'package', 'bottle', 21.2, 254.4, 12, 'bottles', '2026-03-19T08:00:00.000Z'),
  ('prod_010', 'Lotus Pickled Cucumbers', 'cat_vegetables', '11.8 kr/pack. Sold by carton (36 packs per carton)', 'package', 'pack', 11.8, 424.8, 36, 'packs', '2026-03-19T08:00:00.000Z'),
  ('prod_011', 'Magi Mild Flavor', 'cat_sauce', '21.3 kr/bottle. Sold by carton (12 bottles per carton)', 'package', 'bottle', 21.3, 255.6, 12, 'bottles', '2026-03-19T08:00:00.000Z'),
  ('prod_012', 'Corn with Husk', 'cat_vegetables', '39.1 kr/pack. Sold by carton (10 packs per carton)', 'package', 'pack', 39.1, 391, 10, 'packs', '2026-03-19T08:00:00.000Z'),
  ('prod_013', 'Hanami Chips', 'cat_snacks', '16 kr/pack. Sold by carton (24 packs per carton)', 'package', 'pack', 16, 384, 24, 'packs', '2026-03-19T08:00:00.000Z'),
  ('prod_014', 'Frozen Beef Shank', 'cat_frozen', '112 kr/kg. Sold by carton (10 kg per carton)', 'package', 'kg', 112, 1120, 10, 'kg', '2026-03-19T08:00:00.000Z'),
  ('prod_015', 'Old Chicken 1.8kg', 'cat_meat', '74 kr/chicken. Sold by carton (8 chickens, 14.4 kg per carton)', 'package', 'chicken', 74, 592, 8, 'chickens', '2026-03-19T08:00:00.000Z'),
  ('prod_016', 'Thai Hot Pot Noodles', 'cat_noodles', 'Sold by carton (price per carton)', 'package', 'carton', NULL, 140, 1, 'carton', '2026-03-19T08:00:00.000Z'),
  ('prod_017', 'Pink Peanuts', 'cat_drygoods', 'Sold per 500g bag', 'unit', 'bag', NULL, 38, 1, NULL, '2026-03-19T08:00:00.000Z'),
  ('prod_018', 'Mixed Seaweed', 'cat_drygoods', '32 kr/pack. Sold by carton (20 packs per carton)', 'package', 'pack', 32, 640, 20, 'packs', '2026-03-19T08:00:00.000Z'),
  ('prod_019', 'Sticky Rice 5kg', 'cat_rice', 'Sold per 5 kg bag', 'unit', 'bag', NULL, 153, 1, NULL, '2026-03-19T08:00:00.000Z'),
  ('prod_020', 'Frozen Young Coconut', 'cat_frozen', 'Sold per bag', 'unit', 'bag', NULL, 20, 1, NULL, '2026-03-19T08:00:00.000Z')
ON CONFLICT (id) DO NOTHING;
