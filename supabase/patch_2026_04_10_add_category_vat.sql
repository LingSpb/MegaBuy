-- ============================================================
-- Patch: Add VAT column to categories table
-- Date: 2026-04-10
-- Description: Adds a VAT percentage field to categories.
--              Default value is 6 for backward compatibility.
-- ============================================================

-- Add VAT column with default value of 6 for backward compatibility
-- Note: Run this once. If column already exists, Supabase will show an error
-- which can be safely ignored.
ALTER TABLE categories ADD COLUMN vat NUMERIC DEFAULT 6;

-- Update existing categories that might have NULL VAT to use default value
UPDATE categories SET vat = 6 WHERE vat IS NULL;
