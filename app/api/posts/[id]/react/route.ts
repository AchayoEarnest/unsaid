import { z } from "zod";
import { q } from "@/lib/db";
import { handler, json, err, Ctx } from "@/lib/http";
const Body = z.object({ kind: z.enum(["here", "love", "understand", "keep_going", "thinking_of_you", "you_got_this"]) });
// Reactions are supportive only. No public counts are exposed beyond the post author's own notification.
export const PUT = (req: Request, { params }: Ctx<{ id: string }>) => handler(req, async me => {
  const { id } = await params; const p = Body.safeParse(await json(req)); if (!p.success) return err("Unknown reaction.");
  await q("INSERT INTO reactions (post_id,user_id,kind) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [id, me.id, p.data.kind]);
  return Response.json({ ok: true });
}, { rate: [120, 3600_000] });
export const DELETE = (req: Request, { params }: Ctx<{ id: string }>) => handler(req, async me => {
  const { id } = await params; const k = new URL(req.url).searchParams.get("kind");
  await q("DELETE FROM reactions WHERE post_id=$1 AND user_id=$2 AND kind=$3::reaction_kind", [id, me.id, k]);
  return Response.json({ ok: true });
});
