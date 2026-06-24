import { createAdminClient } from "@/lib/supabase/admin";

// Per-user rate limiting for the AI endpoints (summary, Q&A, extract-text).
// One shared counter per user across all three routes — the cost we care about
// is total OpenAI calls per person, not per endpoint.
//
// The counter lives in Postgres (see migrations/2026-06-15-ai-rate-limit.sql),
// not in memory, because the app runs on stateless serverless functions where a
// module-scope counter would reset on every cold start.

const DEFAULT_MAX = 20;
const DEFAULT_WINDOW_SECONDS = 600; // 10 minutes

export class RateLimitExceededError extends Error {
  retryAfterSeconds: number;
  constructor(message: string, retryAfterSeconds: number) {
    super(message);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

// Turn a raw seconds count into a friendly phrase for the user-facing message.
// (The Retry-After header still uses the raw integer seconds, per the HTTP spec.)
function formatWait(seconds: number): string {
  if (seconds < 60) {
    return `about ${seconds} second${seconds === 1 ? "" : "s"}`;
  }
  const minutes = Math.ceil(seconds / 60);
  return `about ${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function getLimit() {
  const max = Number(process.env.AI_RATE_LIMIT_MAX);
  const windowSeconds = Number(process.env.AI_RATE_LIMIT_WINDOW_SECONDS);
  return {
    max: Number.isFinite(max) && max > 0 ? Math.floor(max) : DEFAULT_MAX,
    windowSeconds:
      Number.isFinite(windowSeconds) && windowSeconds > 0
        ? Math.floor(windowSeconds)
        : DEFAULT_WINDOW_SECONDS,
  };
}

/**
 * Throws RateLimitExceededError if the user has exceeded their AI call budget
 * for the current window. Otherwise returns and lets the caller proceed.
 *
 * Fails open: if the limiter's own DB call errors, we log and allow the request.
 * A limiter outage must never take down the core AI feature.
 */
export async function enforceAiRateLimit(userId: string): Promise<void> {
  const { max, windowSeconds } = getLimit();

  const admin = createAdminClient();
  const { data, error } = await admin
    .rpc("increment_ai_usage", {
      p_user_id: userId,
      p_limit: max,
      p_window_seconds: windowSeconds,
    })
    .single<{ allowed: boolean; remaining: number; reset_at: string }>();

  if (error || !data) {
    // Fail open — never block AI because the limiter itself failed.
    console.error("AI rate limit check failed (allowing request):", error);
    return;
  }

  if (!data.allowed) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((new Date(data.reset_at).getTime() - Date.now()) / 1000)
    );
    throw new RateLimitExceededError(
      `You have made too many AI requests. Please try again in ${formatWait(
        retryAfterSeconds
      )}.`,
      retryAfterSeconds
    );
  }
}
