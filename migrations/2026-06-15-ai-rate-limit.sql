-- Migration: per-user rate limiting for the AI endpoints.
-- Run this in the Supabase SQL editor before deploying the rate-limit code.
--
-- Why: the AI routes (ai-summary, ai-chat, extract-text) call OpenAI, which the
-- project pays for. Without a limit, a runaway client loop or an abusive user can
-- burn the OpenAI budget. We cap the number of AI calls per user per time window.
--
-- Why in Postgres (not in-memory): the app runs on stateless serverless functions
-- (Vercel). A module-scope counter resets on every cold start and is not shared
-- across concurrent instances, so it would not actually limit anything. A shared,
-- durable Postgres counter does — and the rows are auditable.
--
-- Strategy: atomic fixed-window counter. One row per (user_id, window_start). The
-- increment_ai_usage() function does the check-and-increment in a single statement
-- so two concurrent requests can't both read "4" and both decide they're under 5.
-- Trade-off: a fixed window allows a burst across the window boundary (up to ~2x
-- the limit at the seam). A sliding-window log would be more precise but needs
-- per-request rows + cleanup; fixed-window is the standard pragmatic choice here.

-- 1. The counter table. One row per user per window.
CREATE TABLE IF NOT EXISTS ai_rate_limits (
  user_id      uuid        NOT NULL,
  window_start timestamptz NOT NULL,
  count        integer     NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, window_start)
);

-- RLS on, no policies: only the service-role client and the SECURITY DEFINER
-- function below may touch this table. Users cannot read or forge their counters.
ALTER TABLE ai_rate_limits ENABLE ROW LEVEL SECURITY;

-- 2. Atomic check-and-increment.
--    Buckets time into windows of p_window_seconds. Increments the current
--    window's count, then reports whether this call is within p_limit and how
--    many calls remain in the window.
--    Returns one row: (allowed boolean, remaining integer, reset_at timestamptz).
CREATE OR REPLACE FUNCTION increment_ai_usage(
  p_user_id        uuid,
  p_limit          integer,
  p_window_seconds integer
)
RETURNS TABLE (allowed boolean, remaining integer, reset_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start timestamptz;
  v_count        integer;
BEGIN
  -- Floor now() to the start of the current fixed window.
  v_window_start := to_timestamp(
    floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds
  );

  INSERT INTO ai_rate_limits (user_id, window_start, count)
  VALUES (p_user_id, v_window_start, 1)
  ON CONFLICT (user_id, window_start)
  DO UPDATE SET count = ai_rate_limits.count + 1
  RETURNING count INTO v_count;

  allowed   := v_count <= p_limit;
  remaining := greatest(p_limit - v_count, 0);
  reset_at  := v_window_start + make_interval(secs => p_window_seconds);
  RETURN NEXT;
END;
$$;
