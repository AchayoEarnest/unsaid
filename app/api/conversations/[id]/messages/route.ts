import { z } from "zod";
import { pool, q } from "@/lib/db";
import { handler, json, err, Ctx } from "@/lib/http";
import { seal, open } from "@/lib/crypto";
import { assessRisk, isHarmfulReply } from "@/lib/safety";

async function member(convo: string, user: string) {
  const [m] = await q("SELECT 1 FROM conversation_members cm JOIN conversations c ON c.id=cm.conversation_id AND c.deleted_at IS NULL WHERE cm.conversation_id=$1 AND cm.user_id=$2", [convo, user]);
  return !!m;
}
export const GET = (req: Request, { params }: Ctx<{ id: string }>) => handler(req, async me => {
  const { id } = await params;
  if (!(await member(id, me.id))) return err("Not found", 404);
  const before = new URL(req.url).searchParams.get("before");
  const rows = await q<{ id: string; sender_id: string; body_enc: Buffer; created_at: string }>(
    `SELECT id,sender_id,body_enc,created_at FROM messages WHERE conversation_id=$1 AND deleted_at IS NULL AND ($2::timestamptz IS NULL OR created_at<$2) ORDER BY created_at DESC LIMIT 40`, [id, before]);
  await q("UPDATE conversation_members SET last_read_at=now() WHERE conversation_id=$1 AND user_id=$2", [id, me.id]);
  return Response.json({ items: rows.map(m => ({ id: m.id, mine: m.sender_id === me.id, body: open(m.body_enc), created_at: m.created_at })).reverse() });
});

const Body = z.object({ body: z.string().trim().min(1).max(2000) });
export const POST = (req: Request, { params }: Ctx<{ id: string }>) => handler(req, async me => {
  const { id } = await params; const p = Body.safeParse(await json(req)); if (!p.success) return err("Write a message first.");
  if (!(await member(id, me.id))) return err("Not found", 404);
  // Either side blocking ends the conversation for sending.
  const [b] = await q(`SELECT 1 FROM conversation_members o JOIN blocks bl ON (bl.blocker_id=o.user_id AND bl.blocked_id=$2) OR (bl.blocker_id=$2 AND bl.blocked_id=o.user_id)
    WHERE o.conversation_id=$1 AND o.user_id<>$2 LIMIT 1`, [id, me.id]);
  if (b) return err("This conversation is closed.", 403);
  if (isHarmfulReply(p.data.body)) return err("We can't send that. Please be gentle with each other.", 422);
  const risk = assessRisk(p.data.body);
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const m = (await c.query("INSERT INTO messages (conversation_id,sender_id,body_enc) VALUES ($1,$2,$3) RETURNING id,created_at", [id, me.id, seal(p.data.body)])).rows[0];
    if (risk === "crisis") await c.query("INSERT INTO safety_alerts (user_id,source) VALUES ($1,$2)", [me.id, `message:${m.id}`]); // pointer only, no text
    // Realtime fan-out: the ws server LISTENs on this channel. Payload carries no message text.
    await c.query("SELECT pg_notify('msg', $1)", [JSON.stringify({ convo: id, from: me.id, msg: m.id })]);
    await c.query("COMMIT");
    return Response.json({ id: m.id, showHelp: risk !== "none" }, { status: 201 }); // front end shows the calm help prompt
  } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
}, { rate: [60, 60_000] });

// Delete your own message (soft delete).
export const DELETE = (req: Request, { params }: Ctx<{ id: string }>) => handler(req, async me => {
  const { id } = await params, mid = new URL(req.url).searchParams.get("messageId");
  await q("UPDATE messages SET deleted_at=now() WHERE id=$1 AND conversation_id=$2 AND sender_id=$3", [mid, id, me.id]);
  return Response.json({ ok: true });
});
