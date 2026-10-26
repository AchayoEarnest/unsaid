import { q } from "@/lib/db";
import { handler } from "@/lib/http";
export const GET = (req: Request) => handler(req, async () => {
  const u = new URL(req.url).searchParams, st = ["open", "in_review", "resolved", "dismissed"].includes(u.get("status") ?? "") ? u.get("status") : "open", sev = Number(u.get("severity")) || null;
  const rows = await q(`SELECT mc.id,mc.target,mc.target_id,mc.severity,mc.status,mc.created_at,r.reason,
      CASE mc.target WHEN 'post' THEN (SELECT left(body,300) FROM posts WHERE id=mc.target_id)
                     WHEN 'comment' THEN (SELECT left(body,300) FROM comments WHERE id=mc.target_id) END AS excerpt
    FROM moderation_cases mc LEFT JOIN reports r ON r.id=mc.report_id
    WHERE (mc.status=$1::case_status OR ($1='open' AND mc.status='in_review')) AND ($2::int IS NULL OR mc.severity=$2) ORDER BY mc.severity DESC, mc.created_at LIMIT 50`, [st, sev]);
  return Response.json({ items: rows }); // message bodies are NOT included; reveal flow is a separate audited step
}, { staff: "moderator" });
