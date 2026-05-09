-- Payment status table to track if a person has paid for their order
CREATE TABLE IF NOT EXISTS payment_status (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    mega_order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    child_order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    paid BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(mega_order_id, child_order_id)
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_payment_status_mega_order ON payment_status(mega_order_id);
CREATE INDEX IF NOT EXISTS idx_payment_status_child_order ON payment_status(child_order_id);

-- Enable RLS
ALTER TABLE payment_status ENABLE ROW LEVEL SECURITY;

-- Allow all operations for now (adjust based on your auth requirements)
CREATE POLICY "Allow all operations on payment_status" ON payment_status
    FOR ALL
    USING (true)
    WITH CHECK (true);
