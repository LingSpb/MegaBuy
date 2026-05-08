-- Add secret_phrase column to orders table for delete protection
ALTER TABLE orders ADD COLUMN IF NOT EXISTS secret_phrase TEXT;
