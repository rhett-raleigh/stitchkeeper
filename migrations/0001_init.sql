-- Same schema as the original node:sqlite database (data/stitchkeeper.db), so rows copy straight across.
CREATE TABLE IF NOT EXISTS patterns (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  source_url TEXT,
  source_file TEXT,
  image_url TEXT,
  extractor TEXT NOT NULL,
  data TEXT NOT NULL,
  issues TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  source_pages TEXT
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY,
  pattern_id INTEGER NOT NULL REFERENCES patterns(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  row_index INTEGER NOT NULL DEFAULT 0,
  piece INTEGER NOT NULL DEFAULT 1,
  yarn TEXT NOT NULL DEFAULT '',
  hook TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT
);

CREATE INDEX IF NOT EXISTS patterns_source_file ON patterns(source_file);
CREATE INDEX IF NOT EXISTS projects_pattern_id ON projects(pattern_id);
