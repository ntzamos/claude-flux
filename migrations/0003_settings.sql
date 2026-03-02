-- Settings Table
-- Migration 0003
-- Stores user-facing credentials and preferences managed via the Settings UI.
-- The relay reads these at startup and injects them into process.env.

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON settings FOR ALL USING (true);

-- Pre-populate rows so the UI shows all fields even before the user fills them in
INSERT INTO settings (key, description) VALUES
  ('TELEGRAM_BOT_TOKEN',        'Bot token from @BotFather on Telegram'),
  ('TELEGRAM_USER_ID',          'Your Telegram user ID (message @userinfobot to get it)'),
  ('ANTHROPIC_API_KEY',         'API key from console.anthropic.com'),
  ('WHISPER_MODEL_PATH',        'Path to whisper model .bin file (auto-discovered if left blank)'),
  ('WHISPER_BINARY',            'Whisper binary name or path (default: whisper-cpp)'),
  ('ELEVENLABS_API_KEY',        'ElevenLabs API key for text-to-speech'),
  ('ELEVENLABS_VOICE_ID',       'ElevenLabs voice ID'),
  ('ELEVENLABS_AGENT_ID',       'ElevenLabs conversational agent ID (for /callme command)'),
  ('ELEVENLABS_PHONE_NUMBER_ID','ElevenLabs phone number ID for outbound calls'),
  ('MY_PHONE_NUMBER',           'Your phone number for AI calls (E.164 format, e.g. +12025551234)'),
  ('OPENAI_API_KEY',            'OpenAI API key for semantic memory search (platform.openai.com)'),
  ('USER_NAME',                 'Your first name (used by the bot when addressing you)'),
  ('USER_TIMEZONE',             'Your timezone (e.g. America/New_York, Europe/Berlin, Asia/Tokyo)')
ON CONFLICT DO NOTHING;
