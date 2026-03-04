-- Add 'running' to scheduled_tasks status constraint
-- Migration 0011

ALTER TABLE scheduled_tasks DROP CONSTRAINT scheduled_tasks_status_check;
ALTER TABLE scheduled_tasks ADD CONSTRAINT scheduled_tasks_status_check
  CHECK (status IN ('active', 'running', 'done', 'cancelled'));
