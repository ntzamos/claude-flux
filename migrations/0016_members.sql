-- Members table: tracks authorized Telegram users (owner + members)
CREATE TABLE IF NOT EXISTS members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  telegram_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add telegram_user_id column to messages (nullable for backward compat)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS telegram_user_id TEXT;

-- Auto-insert the owner from settings (if configured)
INSERT INTO members (telegram_id, name, role)
SELECT s_tid.value, COALESCE(NULLIF(s_name.value, ''), 'Owner'), 'owner'
FROM settings s_tid
LEFT JOIN settings s_name ON s_name.key = 'USER_NAME'
WHERE s_tid.key = 'TELEGRAM_USER_ID' AND s_tid.value != ''
ON CONFLICT (telegram_id) DO NOTHING;

-- Claude auth method setting (api_key or oauth)
INSERT INTO settings (key, value, description, updated_at)
VALUES ('CLAUDE_AUTH_METHOD', 'api_key', 'Authentication method for Claude CLI: api_key or oauth', NOW())
ON CONFLICT (key) DO NOTHING;
