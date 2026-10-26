import { q } from "@/lib/db";
import { handler } from "@/lib/http";
// No streaks and no scores: only gentle counts and a mood series for the last 30 days.
export const GET = (req: Request) => handler(req, async me => {
  const [a] = await q(`SELECT (SELECT count(*) FROM journal_entries WHERE user_id=$1 AND deleted_at IS NULL AND created_at>now()-interval '30 days') AS checkins,
    (SELECT count(*) FROM saved_posts WHERE user_id=$1) AS saved,
    (SELECT count(*) FROM comments c JOIN posts p ON p.id=c.post_id WHERE p.author_id=$1 AND c.mod_status='approved' AND c.deleted_at IS NULL) AS encouragement`, [me.id]);
  const moods = await q(`SELECT date_trunc('day',j.created_at) AS day, m.slug FROM journal_entries j JOIN moods m ON m.id=j.mood_id WHERE j.user_id=$1 AND j.deleted_at IS NULL AND j.created_at>now()-interval '30 days' ORDER BY 1`, [me.id]);
  return Response.json({ ...a, moods });
});
