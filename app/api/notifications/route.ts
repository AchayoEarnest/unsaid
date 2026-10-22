import { q } from "@/lib/db";
import { handler } from "@/lib/http";
const TEXT: Record<string, string> = { reply: "Someone responded to your post.", helpful: "Someone found your story helpful.", request: "Someone would like to talk privately.", accepted: "Someone accepted your conversation request." };
export const GET = (req: Request) => handler(req, async me => {
  const rows = await q("SELECT id,kind,ref_id,read_at,created_at FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30", [me.id]);
  return Response.json({ items: rows.map(r => ({ ...r, text: TEXT[r.kind] ?? "You have an update." })) });
});
export const PATCH = (req: Request) => handler(req, async me => { // mark all read
  await q("UPDATE notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL", [me.id]);
  return Response.json({ ok: true });
});
