-- MegaBuy production patch
-- Purpose: allow `Delivered` as a valid value for `orders.state`
-- Safe to run multiple times.

BEGIN;

DO $$
DECLARE
  constraint_name text;
BEGIN
  -- Drop existing state check constraint(s) that only allow Draft/Locked/Closed.
  FOR constraint_name IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = current_schema()
      AND t.relname = 'orders'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%state%'
      AND pg_get_constraintdef(c.oid) ILIKE '%Draft%'
      AND pg_get_constraintdef(c.oid) ILIKE '%Locked%'
      AND pg_get_constraintdef(c.oid) ILIKE '%Closed%'
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I DROP CONSTRAINT IF EXISTS %I',
      current_schema(),
      'orders',
      constraint_name
    );
  END LOOP;

  -- Recreate canonical constraint including Delivered.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = current_schema()
      AND t.relname = 'orders'
      AND c.conname = 'orders_state_check'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_state_check
      CHECK (state IN ('Draft', 'Locked', 'Delivered', 'Closed'));
  END IF;
END
$$;

COMMIT;
