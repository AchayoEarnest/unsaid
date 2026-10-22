ALTER TABLE users ADD COLUMN email_verified_at timestamptz;
ALTER TABLE notifications ADD COLUMN pushed_at timestamptz;
CREATE TABLE auth_tokens (token_hash bytea PRIMARY KEY, user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE, kind text NOT NULL CHECK (kind IN ('verify','reset')), expires_at timestamptz NOT NULL, used_at timestamptz);
CREATE TABLE push_subscriptions (endpoint text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE, p256dh text NOT NULL, auth text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE uploads (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users, mime text NOT NULL, bytes int NOT NULL, status mod_status NOT NULL DEFAULT 'pending', created_at timestamptz NOT NULL DEFAULT now());
