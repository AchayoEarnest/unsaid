import { q } from "@/lib/db";
import { handler } from "@/lib/http";
import { open } from "@/lib/crypto";
// Everything we hold about you, as a download.
export const GET = (req: Request) => handler(req, async me => {
  const [account] = await q("SELECT email,is_minor,country_code,created_at FROM users WHERE id=$1", [me.id]);
  const [profile] = await q("SELECT nickname,display_name,bio,allow_requests,hide_online FROM profiles WHERE user_id=$1", [me.id]);
  const posts = await q("SELECT id,body,identity,visibility,created_at FROM posts WHERE author_id=$1 AND deleted_at IS NULL", [me.id]);
  const comments = await q("SELECT post_id,body,kind,created_at FROM comments WHERE author_id=$1 AND deleted_at IS NULL", [me.id]);
  const saved = await q("SELECT post_id,created_at FROM saved_posts WHERE user_id=$1", [me.id]);
  const j = await q<{ body_enc: Buffer; tags: string[]; created_at: string }>("SELECT body_enc,tags,created_at FROM journal_entries WHERE user_id=$1 AND deleted_at IS NULL", [me.id]);
  const body = JSON.stringify({ account, profile, posts, comments, saved, journal: j.map(e => ({ body: open(e.body_enc), tags: e.tags, created_at: e.created_at })) }, null, 2);
  return new Response(body, { headers: { "Content-Type": "application/json", "Content-Disposition": 'attachment; filename="unsaid-my-data.json"' } });
}, { rate: [3, 3600_000] });
