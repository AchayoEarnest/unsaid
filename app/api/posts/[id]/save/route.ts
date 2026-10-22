import { z } from "zod";
import { q } from "@/lib/db";
import { handler, err, Ctx } from "@/lib/http";
const Id = z.string().uuid();
const gone = () => err("This conversation isn't available.", 404);
export const GET = (req: Request, { params }: Ctx<{ id: string }>) => handler(req, async me => {
  const { id } = await params; if (!Id.safeParse(id).success) return gone();
  const [s] = await q("SELECT 1 FROM saved_posts WHERE user_id=$1 AND post_id=$2", [me.id, id]);
  return Response.json({ saved: !!s });
});
export const PUT = (req: Request, { params }: Ctx<{ id: string }>) => handler(req, async me => {
  const { id } = await params; if (!Id.safeParse(id).success) return gone();
  const [p] = await q("SELECT 1 FROM posts WHERE id=$1 AND visibility='public' AND mod_status='approved' AND deleted_at IS NULL", [id]);
  if (!p) return gone();
  await q("INSERT INTO saved_posts (user_id,post_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [me.id, id]);
  return Response.json({ ok: true });
});
export const DELETE = (req: Request, { params }: Ctx<{ id: string }>) => handler(req, async me => {
  const { id } = await params; if (!Id.safeParse(id).success) return gone();
  await q("DELETE FROM saved_posts WHERE user_id=$1 AND post_id=$2", [me.id, id]);
  return Response.json({ ok: true });
});
