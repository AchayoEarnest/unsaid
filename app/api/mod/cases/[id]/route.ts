import { z } from "zod";
import { pool } from "@/lib/db";
import { handler, json, err, Ctx } from "@/lib/http";
import { audit } from "@/lib/audit";
const Body = z.object({ action: z.enum(["dismiss", "approve", "remove", "warn", "restrict", "suspend"]), days: z.number().int().min(1).max(365).optional() });

export const POST = (req: Request, { params }: Ctx<{ id: string }>) => handler(req, async me => {
  const { id } = await params; const p = Body.safeParse(await json(req)); if (!p.success) return err("Unknown action.");
  const { action, days } = p.data, c = await pool.connect();
  try {
    await c.query("BEGIN");
    const k = (await c.query("SELECT target,target_id FROM moderation_cases WHERE id=$1 AND status IN ('open','in_review') FOR UPDATE", [id])).rows[0];
    if (!k) { await c.query("ROLLBACK"); return err("Case not found or already closed.", 404); }
    const tbl = k.target === "post" ? "posts" : k.target === "comment" ? "comments" : null;
    if (tbl && action === "approve") await c.query(`UPDATE ${tbl} SET mod_status='approved' WHERE id=$1`, [k.target_id]);
    if (tbl && action === "remove") await c.query(`UPDATE ${tbl} SET mod_status='removed', deleted_at=now() WHERE id=$1`, [k.target_id]);
    if (["warn", "restrict", "suspend"].includes(action)) {
      const owner = k.target === "user" ? k.target_id : tbl ? (await c.query(`SELECT author_id FROM ${tbl} WHERE id=$1`, [k.target_id])).rows[0]?.author_id : null;
      if (owner) await c.query("UPDATE users SET sanction=$2::sanction, sanction_until=now()+($3||' days')::interval WHERE id=$1",
        [owner, action === "warn" ? "warning" : action === "restrict" ? "restriction" : "suspension", String(days ?? (action === "warn" ? 7 : 14))]);
    }
    await c.query("UPDATE moderation_cases SET status=$2::case_status, action=$3::sanction, assigned_to=$4, resolved_at=now() WHERE id=$1",
      [id, action === "dismiss" || action === "approve" ? "dismissed" : "resolved", action === "warn" ? "warning" : action === "restrict" ? "restriction" : action === "suspend" ? "suspension" : "none", me.id]);
    await c.query("COMMIT");
    await audit(me.id, `case.${action}`, id, { target: k.target, targetId: k.target_id });
    return Response.json({ ok: true });
  } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
}, { staff: "moderator" });
