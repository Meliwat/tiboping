CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  encrypted INTEGER NOT NULL DEFAULT 0 CHECK (encrypted IN (0, 1)),
  updated_at TEXT NOT NULL
);

CREATE TABLE source_cursors (
  source TEXT PRIMARY KEY,
  latest_post_id TEXT NOT NULL CHECK (
    length(latest_post_id) > 0 AND latest_post_id NOT GLOB '*[^0-9]*'
  ),
  updated_at TEXT NOT NULL
);

CREATE TABLE posts (
  id TEXT PRIMARY KEY CHECK (length(id) > 0 AND id NOT GLOB '*[^0-9]*'),
  author_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_username TEXT NOT NULL,
  text TEXT NOT NULL,
  url TEXT NOT NULL,
  created_at TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('post', 'reply', 'quote')),
  in_reply_to_post_id TEXT,
  quoted_post_id TEXT,
  classifier_version INTEGER NOT NULL,
  categories_json TEXT NOT NULL,
  matched_rule_ids_json TEXT NOT NULL,
  ingested_at TEXT NOT NULL
);

CREATE INDEX posts_created_at_idx ON posts (created_at DESC);

CREATE TABLE destinations (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('slack', 'discord', 'generic')),
  name TEXT NOT NULL,
  encrypted_config TEXT NOT NULL,
  routing_mode TEXT NOT NULL CHECK (routing_mode IN ('everything', 'categories')),
  categories_json TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('active', 'paused')),
  pause_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX destinations_state_idx ON destinations (state, deleted_at);

CREATE TABLE deliveries (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts (id) ON DELETE RESTRICT,
  destination_id TEXT NOT NULL REFERENCES destinations (id) ON DELETE RESTRICT,
  state TEXT NOT NULL CHECK (state IN ('pending', 'sending', 'delivered', 'failed', 'cancelled')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at TEXT NOT NULL,
  lease_owner TEXT,
  lease_expires_at TEXT,
  last_error_code TEXT,
  last_error_message TEXT,
  delivered_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (post_id, destination_id)
);

CREATE INDEX deliveries_due_idx ON deliveries (state, next_attempt_at);
CREATE INDEX deliveries_destination_idx ON deliveries (destination_id, created_at DESC);
