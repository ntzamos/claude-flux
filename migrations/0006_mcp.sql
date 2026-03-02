-- MCP Servers
-- Migration 0006
-- Stores MCP server configurations synced to the relay's ~/.claude.json

CREATE TABLE IF NOT EXISTS mcp_servers (
  id          SERIAL PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  name        TEXT NOT NULL UNIQUE,
  type        TEXT NOT NULL DEFAULT 'stdio' CHECK (type IN ('stdio', 'sse')),
  command     TEXT,
  args        JSONB NOT NULL DEFAULT '[]',
  env         JSONB NOT NULL DEFAULT '{}',
  url         TEXT,
  enabled     BOOLEAN NOT NULL DEFAULT true
);

ALTER TABLE mcp_servers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for service role" ON mcp_servers FOR ALL USING (true);

-- Default MCP Servers
-- Migration 0007
-- Seeds built-in MCP servers so they are available on first boot without manual configuration.

INSERT INTO mcp_servers (name, type, command, args, env)
VALUES ('claude-skills', 'stdio', 'npx', '["-y", "claude-skills-mcp"]', '{}')
ON CONFLICT (name) DO NOTHING;
