import { z } from "zod";
import { pool, q } from "@/lib/db";
import { handler, json, err, Ctx } from "@/lib/http";
import { audit } from "@/lib/audit";
import { SUBJECT, Subject, handle } from "@/lib/modcase";

// Case detail with the subject's moderation history. Ids are replaced by a pseudonym; no email, no message text.
export const GET = (req: Request, { params }: Ctx<{ id: string }>) => handler(req, async me => {
  const { id } = await params;
  const [k] = await q<Subject>(SUBJECT, [id]);
  if (!k) return err("Case not found.", 404);
  if (!k.subject) return Response.json({ subject: null, history: [] });
  const [acct] = await q(`SELECT date_trunc('month',u.created_at) AS joined, u.is_minor, u.sanction, u.sanction_until, (u.deleted_at IS NOT NULL) AS deleted,
      (SELECT count(*)::int FROM posts WHERE author_id=u.id) AS posts,
      (SELECT count(*)::int FROM posts WHERE author_id=u.id AND mod_status='removed') AS posts_removed,
      (SELECT count(*)::int FROM comments WHERE author_id=u.id) AS replies,
      (SELECT count(*)::int FROM comments WHERE author_id=u.id AND mod_status='removed') AS replies_removed
    FROM users u WHERE u.id=$1`, [k.subject]);
  const history = await q(`SELECT mc.id, mc.target, mc.severity, mc.status, mc.action, mc.created_at, r.reason
    FROM moderation_cases mc LEFT JOIN reports r ON r.id=mc.report_id
    WHERE mc.id<>$2 AND ((mc.target='user' AND mc.target_id=$1)
      OR (mc.target='post' AND mc.target_id IN (SELECT id FROM posts WHERE author_id=$1))
      OR (mc.target='comment' AND mc.target_id IN (SELECT id FROM comments WHERE author_id=$1))
      OR (mc.target='message' AND mc.target_id IN (SELECT id FROM messages WHERE sender_id=$1))
      OR (mc.target='conversation' AND r.reporter_id IS DISTINCT FROM $1 AND mc.target_id IN (SELECT conversation_id FROM conversation_members WHERE user_id=$1)))
    ORDER BY mc.created_at DESC LIMIT 50`, [k.subject, id]);
  await audit(me.id, "case.history", id);
  return Response.json({ subject: { handle: handle(k.subject), ...acct }, history, canReveal: ["message", "conversation"].includes(k.target) && !!k.report_id });
}, { staff: "moderator" });

const Body = z.object({ action: z.enum(["dismiss", "approve", "remove", "warn", "restrict", "suspend"]), days: z.number().int().min(1).max(365).optional() });
const SANCTION = { warn: "warning", restrict: "restriction", suspend: "suspension" } as const;

export const POST = (req: Request, { params }: Ctx<{ id: string }>) => handler(req, async me => {
  const { id } = await params; const p = Body.safeParse(await json(req)); if (!p.success) return err("Unknown action.");
  const { action, days } = p.data, c = await pool.connect();
  try {
    await c.query("BEGIN");
    const open = (await c.query("SELECT 1 FROM moderation_cases WHERE id=$1 AND status IN ('open','in_review') FOR UPDATE", [id])).rows[0];
    if (!open) { await c.query("ROLLBACK"); return err("Case not found or already closed.", 404); }
    const k: Subject = (await c.query(SUBJECT, [id])).rows[0];
    const tbl = ({ post: "posts", comment: "comments" } as Record<string, string>)[k.target];
    if (tbl && action === "approve") await c.query(`UPDATE ${tbl} SET mod_status='approved' WHERE id=$1`, [k.target_id]);
    if (tbl && action === "remove") await c.query(`UPDATE ${tbl} SET mod_status='removed', deleted_at=now() WHERE id=$1`, [k.target_id]);
    if (k.target === "message" && action === "remove") await c.query("UPDATE messages SET deleted_at=now() WHERE id=$1", [k.target_id]);
    if (k.target === "conversation" && action === "remove") await c.query("UPDATE conversations SET deleted_at=now() WHERE id=$1", [k.target_id]); // closes it for both people
    if (action === "warn" || action === "restrict" || action === "suspend") {
      if (!k.subject) { await c.query("ROLLBACK"); return err("There's no account to act on for this case.", 409); }
      await c.query("UPDATE users SET sanction=$2::sanction, sanction_until=now()+($3||' days')::interval WHERE id=$1",
        [k.subject, SANCTION[action], String(days ?? (action === "warn" ? 7 : 14))]);
      if (action === "suspend") await c.query("DELETE FROM sessions WHERE user_id=$1", [k.subject]); // signs them out now, not at next request
    }
    await c.query("UPDATE moderation_cases SET status=$2::case_status, action=$3::sanction, assigned_to=$4, resolved_at=now() WHERE id=$1",
      [id, action === "dismiss" || action === "approve" ? "dismissed" : "resolved", action in SANCTION ? SANCTION[action as keyof typeof SANCTION] : "none", me.id]);
    await c.query("COMMIT");
    await audit(me.id, `case.${action}`, id, { target: k.target, targetId: k.target_id, subject: k.subject ? handle(k.subject) : null });
    return Response.json({ ok: true });
  } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
}, { staff: "moderator" });
