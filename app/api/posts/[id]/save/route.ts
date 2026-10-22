import { q } from "@/lib/db";
import { handler, Ctx } from "@/lib/http";
export const PUT = (req: Request, { params }: Ctx<{ id: string }>) => handler(req, async me => {
  const { id } = await params;
  await q("INSERT INTO saved_posts (user_id,post_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [me.id, id]);
  return Response.json({ ok: true });
});
export const DELETE = (req: Request, { params }: Ctx<{ id: string }>) => handler(req, async me => {
  const { id } = await params;
  await q("DELETE FROM saved_posts WHERE user_id=$1 AND post_id=$2", [me.id, id]);
  return Response.json({ ok: true });
});
