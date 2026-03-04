-- Grading rulebook for device defect detection
-- Rules are loaded into the detect prompt at runtime, allowing adjustments without code changes.
-- Migration 0013

CREATE TABLE IF NOT EXISTS grading_rulebook (
  id          SERIAL      PRIMARY KEY,
  category    TEXT        NOT NULL,
  rule        TEXT        NOT NULL,
  active      BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default rules
INSERT INTO grading_rulebook (category, rule) VALUES
('crack_vs_scratch', 'Cracks branch and change direction irregularly; scratches are straight or gently curved in one direction. If a mark branches, it is a crack.'),
('crack_vs_scratch', 'A starburst or spider-web pattern always indicates a crack, never a scratch.'),
('crack_vs_scratch', 'Circular or arc-shaped marks around a lens are wear scratches. Radial lines spreading outward from a point on the lens glass are cracks.'),
('crack_vs_scratch', 'When a mark catches light differently on each side (one side bright, one dark) it is likely a crack with raised edges. Scratches reflect uniformly along their length.'),
('lens', 'Inspect each camera lens individually. A cracked lens glass = Grade D regardless of all other condition.'),
('lens', 'Lens haze or micro-scratches that do not impair the glass integrity = note as scratch, not crack.'),
('grading', 'Grade what you see, not what you suspect the cause to be. A single hairline crack is still Grade D.'),
('grading', 'Surface haze or micro-scratches visible only at an angle under raking light = Grade B. Deep or overlapping scratches visible straight-on = Grade C.'),
('grading', 'Multiple Grade B defects on different areas do not automatically add up to Grade C — consider severity, not count.');
