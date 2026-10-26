import { q } from "@/lib/db";
import { handler, err, Ctx } from "@/lib/http";
// Only the post's author can mark a reply helpful; the reply's author is notified.
export const POST = (req: Request, { params }: Ctx<{ id: string }>) => handler(req, async me => {
  const { id } = await params;
  const [c] = await q<{ author_id: string; post_id: string }>(
    `UPDATE comments c SET marked_helpful_at=now() FROM posts p WHERE c.id=$1 AND p.id=c.post_id AND p.author_id=$2 AND c.deleted_at IS NULL AND c.mod_status='approved' AND c.marked_helpful_at IS NULL RETURNING c.author_id,c.post_id`, [id, me.id]);
  if (!c) {
    const [already] = await q("SELECT 1 FROM comments c JOIN posts p ON p.id=c.post_id WHERE c.id=$1 AND p.author_id=$2 AND c.marked_helpful_at IS NOT NULL", [id, me.id]);
    return already ? Response.json({ ok: true }) : err("Not allowed", 403);
  }
  await q("INSERT INTO notifications (user_id,kind,ref_id) VALUES ($1,'helpful',$2)", [c.author_id, c.post_id]);
  return Response.json({ ok: true });
});
