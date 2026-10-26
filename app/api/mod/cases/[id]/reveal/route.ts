import { z } from "zod";
import { q } from "@/lib/db";
import { handler, json, err, Ctx } from "@/lib/http";
import { audit } from "@/lib/audit";
import { open } from "@/lib/crypto";
import { SUBJECT, Subject } from "@/lib/modcase";

// Reading a reported private conversation. Only for cases a participant reported, only messages sent before the report,
// and only with a written reason. Every reveal goes to the append-only audit log with that reason.
const Body = z.object({ reason: z.string().trim().min(10).max(300) });
export const POST = (req: Request, { params }: Ctx<{ id: string }>) => handler(req, async me => {
  const { id } = await params; const p = Body.safeParse(await json(req));
  if (!p.success) return err("Write down why you need to read this (at least 10 characters).");
  const [k] = await q<Subject>(SUBJECT, [id]);
  if (!k || !["message", "conversation"].includes(k.target) || !k.report_id) return err("Only reported private conversations can be opened.", 404);
  // A reported message is shown with the messages around it; a reported conversation with its last 30 messages.
  const rows = await q<{ id: string; sender_id: string; body_enc: Buffer; created_at: string; deleted: boolean }>(k.target === "message"
    ? `WITH t AS (SELECT conversation_id, created_at FROM messages WHERE id=$1)
       SELECT * FROM (SELECT m.id,m.sender_id,m.body_enc,m.created_at,(m.deleted_at IS NOT NULL) AS deleted FROM messages m, t
         WHERE m.conversation_id=t.conversation_id AND m.created_at<=$2 AND m.created_at BETWEEN t.created_at-interval '1 day' AND t.created_at+interval '1 hour'
         ORDER BY abs(extract(epoch FROM m.created_at-t.created_at)) LIMIT 21) x ORDER BY created_at`
    : `SELECT * FROM (SELECT id,sender_id,body_enc,created_at,(deleted_at IS NOT NULL) AS deleted FROM messages
         WHERE conversation_id=$1 AND created_at<=$2 ORDER BY created_at DESC LIMIT 30) x ORDER BY created_at`, [k.target_id, k.created_at]);
  await q("UPDATE moderation_cases SET status='in_review', assigned_to=$2 WHERE id=$1 AND status='open'", [id, me.id]);
  await audit(me.id, "case.reveal", id, { reason: p.data.reason, messages: rows.length });
  return Response.json({ items: rows.map(m => ({
    id: m.id, reported: m.id === k.target_id, deleted: m.deleted, created_at: m.created_at, body: open(m.body_enc),
    from: m.sender_id === k.reporter_id ? "Reporter" : m.sender_id === k.subject ? "Reported person" : "Other member" })) });
}, { staff: "moderator", rate: [30, 3600_000] });
