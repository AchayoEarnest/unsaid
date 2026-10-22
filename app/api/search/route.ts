import { q } from "@/lib/db";
// Full-text search over approved public posts. Swap for a dedicated engine later without changing the response shape.
export async function GET(req: Request) {
  const term = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 100);
  if (term.length < 2) return Response.json({ items: [] });
  const rows = await q(`SELECT p.id,left(p.body,300) AS body,p.created_at,(SELECT m.label FROM post_moods pm JOIN moods m ON m.id=pm.mood_id WHERE pm.post_id=p.id LIMIT 1) AS mood,
      CASE p.identity WHEN 'anonymous' THEN 'Anonymous' ELSE pr.nickname END AS author, ts_rank(p.search,plainto_tsquery('english',$1)) AS rank
    FROM posts p JOIN profiles pr ON pr.user_id=p.author_id
    WHERE p.visibility='public' AND p.mod_status='approved' AND p.deleted_at IS NULL AND p.search @@ plainto_tsquery('english',$1)
    ORDER BY rank DESC, p.created_at DESC LIMIT 20`, [term]);
  return Response.json({ items: rows });
}
