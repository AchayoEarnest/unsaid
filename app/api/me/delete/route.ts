import { z } from "zod";
import argon2 from "argon2";
import { cookies } from "next/headers";
import { pool, q } from "@/lib/db";
import { handler, json, err } from "@/lib/http";
import { audit } from "@/lib/audit";
// Deletes the account and removes personal data. Posts and comments are taken down; the journal is erased.
export const POST = (req: Request) => handler(req, async me => {
  const p = z.object({ password: z.string().optional() }).safeParse(await json(req));
  const [u] = await q<{ password_hash: string | null }>("SELECT password_hash FROM users WHERE id=$1", [me.id]);
  if (u?.password_hash && !(p.success && p.data.password && await argon2.verify(u.password_hash, p.data.password).catch(() => false))) return err("Please enter your password to confirm.", 403);
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("UPDATE users SET deleted_at=now(), email='deleted+'||id||'@invalid', password_hash=NULL, google_sub=NULL WHERE id=$1", [me.id]);
    await c.query("UPDATE profiles SET nickname='Deleted user', display_name=NULL, bio=NULL, avatar_key=NULL WHERE user_id=$1", [me.id]);
    await c.query("UPDATE posts SET deleted_at=now() WHERE author_id=$1", [me.id]);
    await c.query("UPDATE comments SET deleted_at=now() WHERE author_id=$1", [me.id]);
    await c.query("UPDATE messages SET deleted_at=now() WHERE sender_id=$1", [me.id]);
    await c.query("DELETE FROM journal_entries WHERE user_id=$1", [me.id]);
    await c.query("UPDATE connection_requests SET status='expired' WHERE (from_user=$1 OR to_user=$1) AND status='pending'", [me.id]);
    await c.query("UPDATE conversations SET deleted_at=now() WHERE deleted_at IS NULL AND id IN (SELECT conversation_id FROM conversation_members WHERE user_id=$1)", [me.id]);
    await c.query("DELETE FROM sessions WHERE user_id=$1", [me.id]);
    await c.query("DELETE FROM push_subscriptions WHERE user_id=$1", [me.id]);
    await c.query("COMMIT");
  } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
  await audit(me.id, "account.deleted");
  (await cookies()).delete("sid");
  return Response.json({ ok: true });
});
