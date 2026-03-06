-- Twilio SMS and Resend email settings
INSERT INTO settings (key, value, description) VALUES
  ('TWILIO_ACCOUNT_SID', '', 'Twilio Account SID for SMS sending'),
  ('TWILIO_AUTH_TOKEN',  '', 'Twilio Auth Token for SMS sending'),
  ('TWILIO_FROM_NUMBER', '', 'Twilio phone number to send SMS from (e.g. +12025551234)'),
  ('RESEND_API_KEY',     '', 'Resend API key for email sending'),
  ('RESEND_FROM_EMAIL',  '', 'Sender email address for Resend (e.g. you@yourdomain.com)')
ON CONFLICT (key) DO NOTHING;
