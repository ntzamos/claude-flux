-- Device assessments and collection state machine
-- Migration 0012

CREATE TABLE IF NOT EXISTS device_assessments (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  imei           TEXT,
  device_info    JSONB       DEFAULT '{}',
  front_images   TEXT[]      NOT NULL DEFAULT '{}',
  back_images    TEXT[]      NOT NULL DEFAULT '{}',
  frame_images   TEXT[]      NOT NULL DEFAULT '{}',
  grading_result JSONB       DEFAULT NULL,
  overall_grade  TEXT        CHECK (overall_grade IN ('A','B','C','D') OR overall_grade IS NULL),
  status         TEXT        NOT NULL DEFAULT 'pending_imei'
                             CHECK (status IN (
                               'pending_imei','pending_info',
                               'collecting_front','collecting_back','collecting_frame',
                               'processing','complete','cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_device_assessments_status     ON device_assessments(status);
CREATE INDEX IF NOT EXISTS idx_device_assessments_created_at ON device_assessments(created_at DESC);

CREATE TABLE IF NOT EXISTS device_assessment_state (
  chat_id       BIGINT      PRIMARY KEY,
  assessment_id UUID        NOT NULL REFERENCES device_assessments(id) ON DELETE CASCADE,
  current_step  TEXT        NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
