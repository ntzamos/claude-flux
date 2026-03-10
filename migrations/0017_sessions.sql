CREATE TABLE IF NOT EXISTS sessions (
  token    TEXT PRIMARY KEY,
  expires_at BIGINT NOT NULL
);
