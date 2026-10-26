import { createHmac } from "crypto";
// Who a moderation case is about. Reported conversations are about the member who isn't the reporter.
export const SUBJECT = `SELECT mc.target, mc.target_id, mc.report_id, mc.created_at, r.reporter_id, CASE mc.target
    WHEN 'post' THEN (SELECT author_id FROM posts WHERE id=mc.target_id)
    WHEN 'comment' THEN (SELECT author_id FROM comments WHERE id=mc.target_id)
    WHEN 'user' THEN mc.target_id
    WHEN 'message' THEN (SELECT sender_id FROM messages WHERE id=mc.target_id)
    WHEN 'conversation' THEN (SELECT cm.user_id FROM conversation_members cm WHERE cm.conversation_id=mc.target_id AND cm.user_id IS DISTINCT FROM r.reporter_id LIMIT 1)
  END AS subject
  FROM moderation_cases mc LEFT JOIN reports r ON r.id=mc.report_id WHERE mc.id=$1`;
export type Subject = { target: string; target_id: string; report_id: string | null; created_at: string; reporter_id: string | null; subject: string | null };

/** Stable pseudonym for staff screens, so moderators can recognise a repeat subject without seeing user ids. */
export const handle = (userId: string) => "U-" + createHmac("sha256", process.env.DATA_KEY ?? "").update(userId).digest("hex").slice(0, 8).toUpperCase();
