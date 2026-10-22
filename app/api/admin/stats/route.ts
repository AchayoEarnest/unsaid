import { q } from "@/lib/db";
import { handler } from "@/lib/http";
// Aggregate counts only. No user-level data leaves this endpoint.
export const GET = (req: Request) => handler(req, async () => {
  const [s] = await q(`SELECT
    (SELECT count(*) FROM users WHERE deleted_at IS NULL) AS users,
    (SELECT count(DISTINCT user_id) FROM sessions WHERE created_at>now()-interval '1 day') AS active_today,
    (SELECT count(*) FROM posts WHERE created_at>now()-interval '1 day') AS posts_today,
    (SELECT count(*) FROM posts WHERE identity='anonymous' AND created_at>now()-interval '1 day') AS anonymous_today,
    (SELECT count(*) FROM comments WHERE created_at>now()-interval '1 day') AS comments_today,
    (SELECT count(*) FROM reactions WHERE created_at>now()-interval '1 day') AS reactions_today,
    (SELECT count(*) FROM connection_requests WHERE created_at>now()-interval '1 day') AS requests_today,
    (SELECT count(*) FROM moderation_cases WHERE status='open') AS open_cases,
    (SELECT count(*) FROM safety_alerts WHERE handled_at IS NULL) AS open_alerts`);
  const daily = await q(`SELECT date_trunc('day',created_at) AS day, count(*) AS posts FROM posts WHERE created_at>now()-interval '30 days' GROUP BY 1 ORDER BY 1`);
  return Response.json({ ...s, daily });
}, { staff: "admin" });
