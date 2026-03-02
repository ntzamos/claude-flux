-- Scheduled Tasks
-- Migration 0002
-- Supports one-time reminders, interval timers, and daily recurring tasks.

CREATE TABLE IF NOT EXISTS scheduled_tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  description TEXT NOT NULL,
  action_prompt TEXT NOT NULL,
  schedule_type TEXT NOT NULL CHECK (schedule_type IN ('once', 'interval', 'daily')),
  next_run_at TIMESTAMPTZ NOT NULL,
  interval_minutes INTEGER,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'done', 'cancelled')),
  run_count INTEGER DEFAULT 0,
  last_run_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_due
  ON scheduled_tasks(next_run_at)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_status
  ON scheduled_tasks(status);

ALTER TABLE scheduled_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for service role" ON scheduled_tasks FOR ALL USING (true);
