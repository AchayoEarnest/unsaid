-- Unsaid: PostgreSQL schema (v1). Run: psql $DATABASE_URL -f db/schema.sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TYPE identity_mode AS ENUM ('anonymous','nickname','real_name');
CREATE TYPE visibility AS ENUM ('public','community','private');
CREATE TYPE mod_status AS ENUM ('pending','approved','flagged','removed');
CREATE TYPE reaction_kind AS ENUM ('here','love','understand','keep_going','thinking_of_you','you_got_this');
CREATE TYPE comment_kind AS ENUM ('support','advice','experience');
CREATE TYPE req_status AS ENUM ('pending','accepted','declined','expired');
CREATE TYPE report_target AS ENUM ('post','comment','user','message','conversation');
CREATE TYPE case_status AS ENUM ('open','in_review','resolved','dismissed');
CREATE TYPE sanction AS ENUM ('none','warning','restriction','suspension');
CREATE TYPE staff_role AS ENUM ('moderator','admin');

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,         -- never exposed by any API
  password_hash text,                                  -- argon2id; null for social-only
  google_sub text UNIQUE,
  is_minor boolean NOT NULL DEFAULT false,             -- set at onboarding; drives protections
  country_code char(2),
  sanction sanction NOT NULL DEFAULT 'none',
  sanction_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE profiles (
  user_id uuid PRIMARY KEY REFERENCES users ON DELETE CASCADE,
  nickname text NOT NULL,
  display_name text,
  bio text CHECK (length(bio) <= 300),
  avatar_key text,
  -- privacy controls
  allow_requests boolean NOT NULL DEFAULT true,
  hide_online boolean NOT NULL DEFAULT false,
  topics_only_feed boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE moods (id smallint PRIMARY KEY, slug text UNIQUE NOT NULL, emoji text NOT NULL, label text NOT NULL);
CREATE TABLE topics (id smallint PRIMARY KEY, slug text UNIQUE NOT NULL, label text NOT NULL);
CREATE TABLE user_topics (user_id uuid REFERENCES users ON DELETE CASCADE, topic_id smallint REFERENCES topics, PRIMARY KEY (user_id, topic_id));

CREATE TABLE posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES users,            -- server-side only; public DTOs never include it for anonymous posts
  identity identity_mode NOT NULL DEFAULT 'anonymous',
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  style text NOT NULL DEFAULT 'auto',                  -- sticker style
  content_warning text,
  image_key text,                                      -- only moderator-approved uploads
  visibility visibility NOT NULL DEFAULT 'public',
  allow_comments boolean NOT NULL DEFAULT true,
  allow_advice boolean NOT NULL DEFAULT true,
  allow_requests boolean NOT NULL DEFAULT true,
  mod_status mod_status NOT NULL DEFAULT 'pending',
  search tsvector GENERATED ALWAYS AS (to_tsvector('english', body)) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX posts_feed_idx ON posts (created_at DESC) WHERE visibility='public' AND mod_status='approved' AND deleted_at IS NULL;
CREATE INDEX posts_search_idx ON posts USING gin (search);
CREATE INDEX posts_author_idx ON posts (author_id, created_at DESC);
CREATE TABLE post_moods (post_id uuid REFERENCES posts ON DELETE CASCADE, mood_id smallint REFERENCES moods, PRIMARY KEY (post_id, mood_id));
CREATE INDEX post_moods_mood_idx ON post_moods (mood_id, post_id);
CREATE TABLE post_topics (post_id uuid REFERENCES posts ON DELETE CASCADE, topic_id smallint REFERENCES topics, PRIMARY KEY (post_id, topic_id));

CREATE TABLE comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES posts ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES users,
  kind comment_kind NOT NULL DEFAULT 'support',
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 1000),
  marked_helpful_at timestamptz,                       -- set by the post author only
  mod_status mod_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX comments_post_idx ON comments (post_id, created_at);

CREATE TABLE reactions (
  post_id uuid REFERENCES posts ON DELETE CASCADE,
  user_id uuid REFERENCES users ON DELETE CASCADE,
  kind reaction_kind NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id, kind)
);
CREATE TABLE saved_posts (user_id uuid REFERENCES users ON DELETE CASCADE, post_id uuid REFERENCES posts ON DELETE CASCADE, created_at timestamptz DEFAULT now(), PRIMARY KEY (user_id, post_id));
CREATE TABLE advice_requests (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users, topic_id smallint REFERENCES topics, body text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());

-- Private connection
CREATE TABLE connection_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user uuid NOT NULL REFERENCES users,
  to_user uuid NOT NULL REFERENCES users,
  post_id uuid REFERENCES posts,
  status req_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (from_user, to_user, post_id)
);
CREATE TABLE conversations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz);
CREATE TABLE conversation_members (
  conversation_id uuid REFERENCES conversations ON DELETE CASCADE,
  user_id uuid REFERENCES users ON DELETE CASCADE,
  muted boolean NOT NULL DEFAULT false, last_read_at timestamptz,
  PRIMARY KEY (conversation_id, user_id)
);
CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users,
  body_enc bytea NOT NULL,                             -- app-level AES-256-GCM; key from KMS
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX messages_conv_idx ON messages (conversation_id, created_at DESC);
CREATE TABLE blocks (blocker_id uuid REFERENCES users ON DELETE CASCADE, blocked_id uuid REFERENCES users ON DELETE CASCADE, created_at timestamptz DEFAULT now(), PRIMARY KEY (blocker_id, blocked_id));

-- Private journal (never public, body encrypted)
CREATE TABLE journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  body_enc bytea NOT NULL, mood_id smallint REFERENCES moods, tags text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);
CREATE INDEX journal_user_idx ON journal_entries (user_id, created_at DESC);

CREATE TABLE notifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE, kind text NOT NULL, ref_id uuid, read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);

-- Safety & moderation
CREATE TABLE reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES users, target report_target NOT NULL, target_id uuid NOT NULL,
  reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE moderation_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid REFERENCES reports, target report_target NOT NULL, target_id uuid NOT NULL,
  severity smallint NOT NULL DEFAULT 1 CHECK (severity BETWEEN 1 AND 4),
  status case_status NOT NULL DEFAULT 'open', assigned_to uuid REFERENCES users, action sanction NOT NULL DEFAULT 'none',
  created_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz
);
CREATE INDEX cases_queue_idx ON moderation_cases (status, severity DESC, created_at);
CREATE TABLE safety_alerts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users, source text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), handled_at timestamptz); -- stores NO message text
CREATE TABLE staff (user_id uuid PRIMARY KEY REFERENCES users, role staff_role NOT NULL);

CREATE TABLE audit_log (
  id bigserial PRIMARY KEY, actor_id uuid, action text NOT NULL, target text, meta jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION audit_immutable() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'audit_log is append-only'; END $$ LANGUAGE plpgsql;
CREATE TRIGGER audit_no_change BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION audit_immutable();

-- Configurable help resources per country
CREATE TABLE help_resources (id serial PRIMARY KEY, country_code char(2), label text NOT NULL, contact text NOT NULL, kind text NOT NULL CHECK (kind IN ('emergency','crisis','mental_health')), active boolean NOT NULL DEFAULT true);

-- Teen protection: block requests between an under-18 and an adult at the database level
CREATE FUNCTION guard_minor_requests() RETURNS trigger AS $$
DECLARE a boolean; b boolean;
BEGIN
  SELECT is_minor INTO a FROM users WHERE id = NEW.from_user;
  SELECT is_minor INTO b FROM users WHERE id = NEW.to_user;
  IF a IS DISTINCT FROM b THEN RAISE EXCEPTION 'minor/adult private requests are not allowed'; END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER connection_minor_guard BEFORE INSERT ON connection_requests FOR EACH ROW EXECUTE FUNCTION guard_minor_requests();
