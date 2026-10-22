import { z } from "zod";
import { q } from "@/lib/db";
import { handler, json, err, Ctx } from "@/lib/http";
const Kind = z.enum(["here", "love", "understand", "keep_going", "thinking_of_you", "you_got_this"]);
const Body = z.object({ kind: Kind });
const Id = z.string().uuid();
// Reactions are supportive only. No public counts are exposed beyond the post author's own notification.
// GET returns only the caller's own reactions, so the UI can show which ones they've already sent.
export const GET = (req: Request, { params }: Ctx<{ id: string }>) => handler(req, async me => {
  const { id } = await params; if (!Id.safeParse(id).success) return err("This conversation isn't available.", 404);
  const rows = await q<{ kind: string }>("SELECT kind FROM reactions WHERE post_id=$1 AND user_id=$2", [id, me.id]);
  return Response.json({ kinds: rows.map(r => r.kind) });
});
export const PUT = (req: Request, { params }: Ctx<{ id: string }>) => handler(req, async me => {
  const { id } = await params; const p = Body.safeParse(await json(req)); if (!p.success) return err("Unknown reaction.");
  if (!Id.safeParse(id).success) return err("This conversation isn't available.", 404);
  const r = await q(`INSERT INTO reactions (post_id,user_id,kind) SELECT p.id,$2,$3 FROM posts p
    WHERE p.id=$1 AND p.visibility='public' AND p.mod_status='approved' AND p.deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id=p.author_id AND b.blocked_id=$2) OR (b.blocker_id=$2 AND b.blocked_id=p.author_id))
    ON CONFLICT DO NOTHING RETURNING 1`, [id, me.id, p.data.kind]);
  if (!r.length) {
    const [had] = await q("SELECT 1 FROM reactions WHERE post_id=$1 AND user_id=$2 AND kind=$3", [id, me.id, p.data.kind]);
    if (!had) return err("This conversation isn't available.", 404);
  }
  return Response.json({ ok: true });
}, { rate: [120, 3600_000] });
export const DELETE = (req: Request, { params }: Ctx<{ id: string }>) => handler(req, async me => {
  const { id } = await params; const k = Kind.safeParse(new URL(req.url).searchParams.get("kind"));
  if (!k.success) return err("Unknown reaction.");
  if (!Id.safeParse(id).success) return err("This conversation isn't available.", 404);
  await q("DELETE FROM reactions WHERE post_id=$1 AND user_id=$2 AND kind=$3", [id, me.id, k.data]);
  return Response.json({ ok: true });
}, { rate: [120, 3600_000] });
