INSERT INTO settings (key, description) VALUES
  ('GEMINI_API_KEY', 'Google Gemini API key for Nano Banana image generation — get one at aistudio.google.com/apikey')
ON CONFLICT DO NOTHING;
