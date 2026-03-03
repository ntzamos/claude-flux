-- Persistent message queue: survives relay restarts
CREATE TABLE IF NOT EXISTS message_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  chat_id BIGINT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_message_queue_status ON message_queue(status, created_at);
