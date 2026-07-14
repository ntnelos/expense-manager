-- Migration: 007_ignored_expense_rules.sql

CREATE TABLE IF NOT EXISTS public.ignored_expense_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    description_pattern TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.ignored_expense_rules ENABLE ROW LEVEL SECURITY;

-- Allow public access (assuming we are not enforcing strict auth yet like other tables)
CREATE POLICY "Enable all actions for public users on ignored_expense_rules"
    ON public.ignored_expense_rules
    FOR ALL
    USING (true)
    WITH CHECK (true);
