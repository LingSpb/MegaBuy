-- Rename shopping_list table to favorite_list
ALTER TABLE IF EXISTS shopping_list RENAME TO favorite_list;

-- Rename index
ALTER INDEX IF EXISTS idx_shopping_list_product_id RENAME TO idx_favorite_list_product_id;
