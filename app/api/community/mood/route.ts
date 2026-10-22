import { q } from "@/lib/db";
// "Today's community mood". Aggregate only, and small buckets are hidden so no individual can be inferred.
export async function GET() {
  const rows = await q<{ slug: string; n: string }>(`SELECT m.slug, count(*) AS n FROM post_moods pm JOIN moods m ON m.id=pm.mood_id JOIN posts p ON p.id=pm.post_id
    WHERE p.created_at>now()-interval '24 hours' AND p.visibility='public' AND p.mod_status='approved' GROUP BY m.slug HAVING count(*)>=10`);
  const total = rows.reduce((s, r) => s + Number(r.n), 0);
  return Response.json({ items: rows.map(r => ({ mood: r.slug, percent: Math.round((Number(r.n) / total) * 100) })) }, { headers: { "Cache-Control": "public, max-age=300" } });
}
