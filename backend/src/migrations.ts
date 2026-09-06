export const migrations = [{ version: 1, sql: `
CREATE TABLE admins (
  id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY, admin_id TEXT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL, expires_at TEXT NOT NULL
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE artifacts (
  id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, external_id TEXT UNIQUE,
  title TEXT NOT NULL, summary TEXT NOT NULL, content TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('article','guide','person','event','glossary')),
  category TEXT NOT NULL DEFAULT '', aliases TEXT NOT NULL DEFAULT '[]',
  author TEXT NOT NULL DEFAULT '', source_url TEXT NOT NULL DEFAULT '', source_title TEXT NOT NULL DEFAULT '', source_thread_id TEXT NOT NULL DEFAULT '',
  cover_url TEXT NOT NULL DEFAULT '', cover_media_id TEXT NOT NULL DEFAULT '', cover_alt TEXT NOT NULL DEFAULT '', cover_credit TEXT NOT NULL DEFAULT '', event_date TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK(status IN ('draft','published','archived')), version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, published_at TEXT
);
CREATE INDEX artifacts_feed ON artifacts(status, published_at DESC, id DESC);
CREATE INDEX artifacts_category ON artifacts(status, category);
CREATE TABLE tags (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE);
CREATE TABLE artifact_tags (
  artifact_id TEXT NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id), PRIMARY KEY (artifact_id, tag_id)
);
CREATE TABLE media (
  id TEXT PRIMARY KEY, original_name TEXT NOT NULL, filename TEXT NOT NULL UNIQUE, mime_type TEXT NOT NULL,
  size INTEGER NOT NULL, sha256 TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL
);
CREATE TABLE artifact_media (
  artifact_id TEXT NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  media_id TEXT NOT NULL REFERENCES media(id), position INTEGER NOT NULL,
  PRIMARY KEY (artifact_id, media_id)
);
CREATE INDEX artifacts_cover ON artifacts(cover_media_id, status);
CREATE TABLE revisions (
  id INTEGER PRIMARY KEY, artifact_id TEXT NOT NULL REFERENCES artifacts(id), version INTEGER NOT NULL,
  action TEXT NOT NULL, actor TEXT NOT NULL, snapshot TEXT NOT NULL, created_at TEXT NOT NULL,
  UNIQUE(artifact_id, version)
);
CREATE TABLE import_batches (
  id TEXT PRIMARY KEY, admin_id TEXT NOT NULL REFERENCES admins(id), plan TEXT NOT NULL,
  created_at TEXT NOT NULL, expires_at TEXT NOT NULL, committed_at TEXT
);
CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, target_id TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
);
` }];
