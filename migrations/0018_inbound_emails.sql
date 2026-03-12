-- Inbound emails received via Resend webhook
CREATE TABLE IF NOT EXISTS inbound_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  from_email TEXT NOT NULL,
  from_name TEXT,
  to_email TEXT NOT NULL,
  subject TEXT,
  body_text TEXT,
  body_html TEXT,
  attachments JSONB DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, replied, dismissed
  reply_text TEXT,
  replied_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_inbound_emails_status ON inbound_emails (status);
CREATE INDEX IF NOT EXISTS idx_inbound_emails_created ON inbound_emails (created_at DESC);

-- RLS
ALTER TABLE inbound_emails ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for service role" ON inbound_emails;
CREATE POLICY "Allow all for service role" ON inbound_emails FOR ALL USING (true) WITH CHECK (true);
