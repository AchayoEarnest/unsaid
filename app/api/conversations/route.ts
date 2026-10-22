import { q } from "@/lib/db";
import { handler } from "@/lib/http";
export const GET = (req: Request) => handler(req, async me => {
  const rows = await q(`SELECT cm.conversation_id AS id, cm.muted,
      (SELECT pr.nickname FROM conversation_members o JOIN profiles pr ON pr.user_id=o.user_id WHERE o.conversation_id=cm.conversation_id AND o.user_id<>$1 LIMIT 1) AS with_nickname,
      (SELECT count(*) FROM messages m WHERE m.conversation_id=cm.conversation_id AND m.sender_id<>$1 AND m.deleted_at IS NULL AND m.created_at>coalesce(cm.last_read_at,'-infinity')) AS unread
    FROM conversation_members cm JOIN conversations c ON c.id=cm.conversation_id AND c.deleted_at IS NULL WHERE cm.user_id=$1 ORDER BY 1`, [me.id]);
  return Response.json({ items: rows });
});
