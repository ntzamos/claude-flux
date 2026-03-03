-- Lists feature: named lists with items (shopping, grocery, project to-dos, etc.)

CREATE TABLE IF NOT EXISTS lists (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS list_items (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id      UUID        NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  title        TEXT        NOT NULL,
  description  TEXT,
  deadline     DATE,
  completed    BOOLEAN     NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS list_items_list_id_idx ON list_items(list_id);
