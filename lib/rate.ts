import { q } from "./db";
// Fixed-window limiter kept in Postgres (rate_limits), so limits hold across instances and restarts. Cron prunes old rows.
export async function limited(key: string, max: number, windowMs: number) {
  const [r] = await q<{ n: number }>(`INSERT INTO rate_limits (key,n,reset_at) VALUES ($1,1,now()+$2*interval '1 millisecond')
    ON CONFLICT (key) DO UPDATE SET n=CASE WHEN rate_limits.reset_at<now() THEN 1 ELSE rate_limits.n+1 END,
      reset_at=CASE WHEN rate_limits.reset_at<now() THEN excluded.reset_at ELSE rate_limits.reset_at END RETURNING n`, [key, windowMs]);
  return r.n > max;
}
/** Client IP as seen by our own proxy: the last X-Forwarded-For entry. Earlier entries are whatever the client sent. */
export const clientIp = (req: Request) => req.headers.get("x-forwarded-for")?.split(",").pop()?.trim() || "local";
