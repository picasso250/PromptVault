CREATE TABLE prompts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  prompt_text TEXT NOT NULL,
  description TEXT,
  tags TEXT,
  image_key TEXT NOT NULL,
  image_type TEXT NOT NULL,
  image_size INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  moderated_at TEXT
);

CREATE INDEX idx_prompts_status_created_at ON prompts(status, created_at DESC);

CREATE TABLE admin_sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX idx_admin_sessions_expires_at ON admin_sessions(expires_at);
