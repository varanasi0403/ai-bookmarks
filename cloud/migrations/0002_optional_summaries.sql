CREATE TABLE summaries (
  article_id TEXT PRIMARY KEY,
  summary TEXT,
  model TEXT NOT NULL,
  status TEXT NOT NULL,
  updated TEXT NOT NULL
);
CREATE TABLE summary_usage (day TEXT PRIMARY KEY, used INTEGER NOT NULL);
