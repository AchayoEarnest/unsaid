import { z } from "zod";
import { q } from "@/lib/db";
import { handler, json, err, Ctx } from "@/lib/http";
import { isHarmfulReply } from "@/lib/safety";
import { screen } from "@/lib/moderation";

export const GET = (req: Request, { params }: Ctx<{ id: string }>) => handler(req, async me => {
  const { id } = await params;
  const rows = await q(`SELECT c.id,c.kind,c.body,c.created_at,(c.marked_helpful_at IS NOT NULL) AS helpful,
      CASE WHEN c.author_id=$2 THEN true ELSE false END AS mine
    FROM comments c WHERE c.post_id=$1 AND c.deleted_at IS NULL AND c.mod_status='approved'
      AND NOT EXISTS (SELECT 1 FROM blocks b WHERE b.blocker_id=$2 AND b.blocked_id=c.author_id)
    ORDER BY c.created_at`, [id, me.id]);
  return Response.json({ items: rows }); // author ids are never returned
});

const Body = z.object({ body: z.string().trim().min(1).max(1000), kind: z.enum(["support", "advice", "experience"]).default("support") });
export const POST = (req: Request, { params }: Ctx<{ id: string }>) => handler(req, async me => {
  const { id } = await params;
  const p = Body.safeParse(await json(req)); if (!p.success) return err("Please write a reply first.");
  if (["restriction"].includes(me.sanction)) return err("Replying is paused on your account.", 403);
  if (isHarmfulReply(p.data.body)) {
    await q("INSERT INTO moderation_cases (target,target_id,severity) VALUES ('user',$1,3)", [me.id]);
    return err("We can't post that. If someone is struggling, please encourage them to reach out to a trusted person or the Get help now page.", 422);
  }
  const [post] = await q<{ author_id: string; allow_comments: boolean; allow_advice: boolean }>(
    `SELECT author_id,allow_comments,allow_advice FROM posts p WHERE id=$1 AND deleted_at IS NULL AND mod_status='approved'
     AND NOT EXISTS (SELECT 1 FROM blocks b WHERE b.blocker_id=p.author_id AND b.blocked_id=$2)`, [id, me.id]);
  if (!post) return err("This conversation isn't available.", 404);
  if (!post.allow_comments || (p.data.kind === "advice" && !post.allow_advice)) return err("This person isn't taking replies of that kind right now.", 403);
  const status = screen(p.data.body);
  const [c] = await q("INSERT INTO comments (post_id,author_id,kind,body,mod_status) VALUES ($1,$2,$3,$4,$5) RETURNING id", [id, me.id, p.data.kind, p.data.body, status]);
  if (status === "flagged") await q("INSERT INTO moderation_cases (target,target_id,severity) VALUES ('comment',$1,2)", [c.id]);
  else if (post.author_id !== me.id) await q("INSERT INTO notifications (user_id,kind,ref_id) VALUES ($1,'reply',$2)", [post.author_id, id]);
  return Response.json({ id: c.id, status: status === "approved" ? "live" : "in_review" }, { status: 201 });
}, { rate: [30, 3600_000] });
