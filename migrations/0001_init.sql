CREATE TABLE IF NOT EXISTS features (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  project       TEXT NOT NULL,
  name          TEXT NOT NULL,
  type          TEXT NOT NULL DEFAULT 'feature',   -- feature | pattern | decision | fix | refactor
  importance    INTEGER NOT NULL DEFAULT 2,        -- 1 low, 2 normal, 3 high
  library       TEXT,                              -- e.g. wrapped third-party library, nullable
  summary       TEXT NOT NULL,
  sections_json TEXT NOT NULL,                     -- JSON array of {title, content}
  files_json    TEXT NOT NULL DEFAULT '[]',        -- JSON array of strings
  tags_json     TEXT NOT NULL DEFAULT '[]',        -- JSON array of strings
  content_hash  TEXT NOT NULL,                     -- SHA-256 hex of canonical input
  chunk_count   INTEGER NOT NULL DEFAULT 0,
  indexed_at    TEXT,                              -- null until vectors are confirmed written in Vectorize
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (project, name)
);

CREATE TABLE IF NOT EXISTS chunks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  feature_id  INTEGER NOT NULL REFERENCES features(id) ON DELETE CASCADE,
  project     TEXT NOT NULL,
  idx         INTEGER NOT NULL,
  section     TEXT NOT NULL,
  text        TEXT NOT NULL,                       -- Contextualized text: "{project} | {name} | {section}\n{body}"
  vector_id   TEXT NOT NULL UNIQUE,                -- "f{featureId}-c{idx}" (always < 64 bytes)
  UNIQUE (feature_id, idx)
);

CREATE INDEX IF NOT EXISTS idx_features_project ON features(project, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_features_type ON features(type);
CREATE INDEX IF NOT EXISTS idx_chunks_feature ON chunks(feature_id);

-- FTS5 Virtual Table for fast BM25 keyword / symbol / file-path retrieval
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
  vector_id UNINDEXED,
  feature_id UNINDEXED,
  project,
  section,
  text,
  tokenize='porter unicode61'
);
