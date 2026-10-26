import { z } from "zod";
import { q } from "@/lib/db";
import { handler, json, err } from "@/lib/http";
import { canRequestPrivate } from "@/lib/safety";

const Body = z.object({ postId: z.string().uuid() });
// Users never see each other's ids: a request is made against a post, and the server resolves the author.
export const POST = (req: Request) => handler(req, async me => {
  const p = Body.safeParse(await json(req)); if (!p.success) return err("Choose a post first.");
  const [t] = await q<{ author_id: string; is_minor: boolean; allow_requests: boolean; post_allows: boolean }>(
    `SELECT p.author_id,u.is_minor,pr.allow_requests,p.allow_requests AS post_allows FROM posts p
     JOIN users u ON u.id=p.author_id JOIN profiles pr ON pr.user_id=p.author_id
     WHERE p.id=$1 AND p.deleted_at IS NULL AND p.mod_status='approved' AND p.visibility='public'
       AND NOT EXISTS (SELECT 1 FROM blocks b WHERE b.blocker_id=p.author_id AND b.blocked_id=$2)`, [p.data.postId, me.id]);
  // Same neutral answer for every refusal, so nobody can probe another person's settings.
  const neutral = () => Response.json({ ok: true, note: "If they're open to it, they'll see your request." }, { status: 202 });
  if (!t || t.author_id === me.id || !t.post_allows || !canRequestPrivate({ isMinor: me.is_minor }, { isMinor: t.is_minor, allowRequests: t.allow_requests })) return neutral();
  const made = await q("INSERT INTO connection_requests (from_user,to_user,post_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING 1", [me.id, t.author_id, p.data.postId]);
  if (made.length) await q("INSERT INTO notifications (user_id,kind) VALUES ($1,'request')", [t.author_id]);
  return neutral();
}, { rate: [10, 3600_000] });

export const GET = (req: Request) => handler(req, async me => {
  const rows = await q(`SELECT cr.id,cr.created_at,left(p.body,120) AS post_excerpt FROM connection_requests cr
    LEFT JOIN posts p ON p.id=cr.post_id WHERE cr.to_user=$1 AND cr.status='pending'
      AND NOT EXISTS (SELECT 1 FROM blocks b WHERE b.blocker_id=$1 AND b.blocked_id=cr.from_user) ORDER BY cr.created_at DESC`, [me.id]);
  return Response.json({ items: rows }); // requester identity stays hidden until accepted
});
