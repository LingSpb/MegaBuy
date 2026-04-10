-- ============================================================
-- Patch: Change package_quantity from INTEGER to NUMERIC
-- Date: 2026-04-10
-- Description: Allows package_quantity to have decimal values
--              (e.g., 3.45 instead of just whole numbers).
-- ============================================================

-- Change package_quantity column type from INTEGER to NUMERIC
-- This allows decimal values like 3.45
ALTER TABLE products ALTER COLUMN package_quantity TYPE NUMERIC USING package_quantity::NUMERIC;

-- Set default to 1 (as NUMERIC)
ALTER TABLE products ALTER COLUMN package_quantity SET DEFAULT 1;
