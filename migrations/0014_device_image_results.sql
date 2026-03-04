-- Per-image detect results for device assessments.
-- Populated eagerly as each photo is uploaded; reused during final synthesis.
CREATE TABLE device_image_results (
  id             SERIAL      PRIMARY KEY,
  assessment_id  UUID        NOT NULL REFERENCES device_assessments(id) ON DELETE CASCADE,
  side           TEXT        NOT NULL CHECK (side IN ('front', 'back', 'frame')),
  image_path     TEXT        NOT NULL,
  clahe_path     TEXT,
  annotated_path TEXT,
  detect_result  TEXT,
  image_grade    TEXT        CHECK (image_grade IN ('A','B','C','D') OR image_grade IS NULL),
  status         TEXT        NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'processing', 'complete', 'error')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (assessment_id, image_path)
);

CREATE INDEX idx_dir_assessment_id ON device_image_results(assessment_id);
