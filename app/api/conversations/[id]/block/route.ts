import { q } from "@/lib/db";
import { handler, err, Ctx } from "@/lib/http";
// Block by conversation, so ids of other users are never exposed to the client.
export const POST = (req: Request, { params }: Ctx<{ id: string }>) => handler(req, async me => {
  const { id } = await params;
  const rows = await q("INSERT INTO blocks (blocker_id,blocked_id) SELECT $2,o.user_id FROM conversation_members o WHERE o.conversation_id=$1 AND o.user_id<>$2 AND EXISTS (SELECT 1 FROM conversation_members x WHERE x.conversation_id=$1 AND x.user_id=$2) ON CONFLICT DO NOTHING RETURNING blocked_id", [id, me.id]);
  if (!rows.length) return err("Not found", 404);
  return Response.json({ ok: true });
});
export const DELETE = (req: Request, { params }: Ctx<{ id: string }>) => handler(req, async me => {
  const { id } = await params;
  await q("UPDATE conversations SET deleted_at=now() WHERE id=$1 AND EXISTS (SELECT 1 FROM conversation_members WHERE conversation_id=$1 AND user_id=$2)", [id, me.id]);
  return Response.json({ ok: true });
});
