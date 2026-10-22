import { q } from "@/lib/db";
import { handler, Ctx } from "@/lib/http";
export const DELETE = (req: Request, { params }: Ctx<{ id: string }>) => handler(req, async me => {
  const { id } = await params;
  await q("UPDATE journal_entries SET deleted_at=now() WHERE id=$1 AND user_id=$2", [id, me.id]);
  return Response.json({ ok: true });
});
