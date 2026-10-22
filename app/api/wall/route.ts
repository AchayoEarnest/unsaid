import { q } from "@/lib/db";
// Random wall: start at a random uuid and take the next N, wrapping if needed. Avoids ORDER BY random() on a big table.
export async function GET() {
  const base = `SELECT p.id,p.body,p.style,p.content_warning,p.created_at,(SELECT m.label FROM post_moods pm JOIN moods m ON m.id=pm.mood_id WHERE pm.post_id=p.id LIMIT 1) AS mood,(CASE WHEN EXISTS (SELECT 1 FROM uploads u WHERE u.id::text=p.image_key AND u.status='approved') THEN p.image_key END) AS image,
    (SELECT count(*)::int FROM comments c WHERE c.post_id=p.id AND c.deleted_at IS NULL AND c.mod_status='approved') AS replies,
    CASE p.identity WHEN 'anonymous' THEN 'Anonymous' ELSE pr.nickname END AS author
    FROM posts p JOIN profiles pr ON pr.user_id=p.author_id
    WHERE p.visibility='public' AND p.mod_status='approved' AND p.deleted_at IS NULL`;
  let rows = await q(`${base} AND p.id > gen_random_uuid() ORDER BY p.id LIMIT 12`);
  if (rows.length < 12) rows = rows.concat(await q(`${base} ORDER BY p.id LIMIT $1`, [12 - rows.length]));
  const seen = new Set<string>(); rows = rows.filter(r => !seen.has(r.id) && seen.add(r.id)); // no duplicates when the wall is small
  return Response.json({ items: rows }, { headers: { "Cache-Control": "no-store" } });
}
