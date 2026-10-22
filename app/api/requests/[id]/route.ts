import { z } from "zod";
import { pool } from "@/lib/db";
import { handler, json, err, Ctx } from "@/lib/http";
const Body = z.object({ action: z.enum(["accept", "decline", "block"]) });
export const PATCH = (req: Request, { params }: Ctx<{ id: string }>) => handler(req, async me => {
  const { id } = await params; const p = Body.safeParse(await json(req)); if (!p.success) return err("Unknown action.");
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const r = (await c.query("SELECT from_user FROM connection_requests WHERE id=$1 AND to_user=$2 AND status='pending' FOR UPDATE", [id, me.id])).rows[0];
    if (!r) { await c.query("ROLLBACK"); return err("Request not found.", 404); }
    let convo: string | null = null;
    await c.query("UPDATE connection_requests SET status=$2::req_status WHERE id=$1", [id, p.data.action === "accept" ? "accepted" : "declined"]);
    if (p.data.action === "block") await c.query("INSERT INTO blocks (blocker_id,blocked_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [me.id, r.from_user]);
    if (p.data.action === "accept") {
      convo = (await c.query("INSERT INTO conversations DEFAULT VALUES RETURNING id")).rows[0].id;
      await c.query("INSERT INTO conversation_members (conversation_id,user_id) VALUES ($1,$2),($1,$3)", [convo, me.id, r.from_user]);
      await c.query("INSERT INTO notifications (user_id,kind,ref_id) VALUES ($1,'accepted',$2)", [r.from_user, convo]);
    }
    await c.query("COMMIT");
    return Response.json({ ok: true, conversationId: convo });
  } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
});
