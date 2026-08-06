PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS ritual_users (
  id TEXT PRIMARY KEY,
  merit INTEGER NOT NULL DEFAULT 0 CHECK (merit >= 0),
  release INTEGER NOT NULL DEFAULT 0 CHECK (release >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ritual_totals (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  merit INTEGER NOT NULL DEFAULT 0 CHECK (merit >= 0),
  release INTEGER NOT NULL DEFAULT 0 CHECK (release >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ritual_events (
  event_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('merit', 'release')),
  applied INTEGER NOT NULL DEFAULT 0 CHECK (applied IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES ritual_users (id)
);

CREATE INDEX IF NOT EXISTS ritual_events_user_created
  ON ritual_events (user_id, created_at);

INSERT OR IGNORE INTO ritual_totals (id, merit, release) VALUES (1, 0, 0);
