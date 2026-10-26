-- Shared rate limiter state. UNLOGGED: fast, and losing it in a crash only resets the counters.
CREATE UNLOGGED TABLE rate_limits (key text PRIMARY KEY, n int NOT NULL, reset_at timestamptz NOT NULL);
CREATE INDEX rate_limits_reset_idx ON rate_limits (reset_at);
-- Lookups behind the moderator history view.
CREATE INDEX comments_author_idx ON comments (author_id, created_at DESC);
CREATE INDEX cases_target_idx ON moderation_cases (target, target_id);
CREATE INDEX messages_sender_idx ON messages (sender_id);
