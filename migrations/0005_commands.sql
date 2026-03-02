-- Custom Telegram Commands
-- Migration 0005
-- Stores user-defined bot commands that trigger specific Claude prompts.

CREATE TABLE IF NOT EXISTS telegram_commands (
  id            SERIAL PRIMARY KEY,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  command       TEXT NOT NULL UNIQUE,
  description   TEXT NOT NULL,
  action_prompt TEXT NOT NULL,
  enabled       BOOLEAN NOT NULL DEFAULT true
);

ALTER TABLE telegram_commands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for service role" ON telegram_commands FOR ALL USING (true);
