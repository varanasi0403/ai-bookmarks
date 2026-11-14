CREATE TABLE source_checks (
  name TEXT PRIMARY KEY,
  checked TEXT,
  last_success TEXT,
  ok INTEGER NOT NULL DEFAULT 0,
  items INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  next_attempt TEXT NOT NULL DEFAULT '',
  trigger TEXT
);
