CREATE TABLE articles (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL,
  published TEXT,
  fetched TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  topic TEXT NOT NULL,
  score INTEGER NOT NULL
);
CREATE INDEX articles_date ON articles(COALESCE(published,fetched) DESC);
CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
