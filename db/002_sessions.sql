CREATE TABLE sessions (
  token_hash bytea PRIMARY KEY,                 -- sha256 of the cookie value; raw token never stored
  user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions (user_id);
