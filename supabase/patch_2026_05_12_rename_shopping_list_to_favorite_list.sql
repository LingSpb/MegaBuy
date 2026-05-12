-- Rename shopping_list table to favorite_list (idempotent)
DO $$
BEGIN
  -- Only rename if shopping_list exists and favorite_list doesn't
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shopping_list')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'favorite_list') THEN
    ALTER TABLE shopping_list RENAME TO favorite_list;
  END IF;
  
  -- Rename index only if old exists and new doesn't
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_shopping_list_product_id')
     AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_favorite_list_product_id') THEN
    ALTER INDEX idx_shopping_list_product_id RENAME TO idx_favorite_list_product_id;
  END IF;
END $$;
