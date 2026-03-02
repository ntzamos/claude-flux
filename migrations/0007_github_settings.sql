-- GitHub Settings
-- Migration 0007
-- Adds GitHub credentials for repo access (pull, push, manage).

INSERT INTO settings (key, description) VALUES
  ('GITHUB_TOKEN',    'GitHub Personal Access Token (repo scope) — create at github.com/settings/tokens'),
  ('GITHUB_USERNAME', 'Your GitHub username')
ON CONFLICT DO NOTHING;
