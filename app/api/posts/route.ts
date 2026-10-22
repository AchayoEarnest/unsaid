import { z } from "zod";
import { pool, q } from "@/lib/db";
import { currentUser, sameOrigin } from "@/lib/session";
import { limited } from "@/lib/rate";
import { assessRisk } from "@/lib/safety";
import { screen, reasons } from "@/lib/moderation";

// Public DTO: author_id is never selected, so anonymous posts can't leak identity.
const FEED = `SELECT p.id, p.body, p.style, p.content_warning, p.created_at,
  CASE p.identity WHEN 'anonymous' THEN 'Anonymous' WHEN 'nickname' THEN pr.nickname ELSE coalesce(pr.display_name,pr.nickname) END AS author,
  coalesce(array_agg(DISTINCT m.slug) FILTER (WHERE m.slug IS NOT NULL),'{}') AS moods,
  (SELECT count(*)::int FROM comments c WHERE c.post_id=p.id AND c.deleted_at IS NULL AND c.mod_status='approved') AS replies
  FROM posts p JOIN profiles pr ON pr.user_id=p.author_id
  LEFT JOIN post_moods pm ON pm.post_id=p.id LEFT JOIN moods m ON m.id=pm.mood_id
  WHERE p.visibility='public' AND p.mod_status='approved' AND p.deleted_at IS NULL`;

export async function GET(req: Request) {
  const u = new URL(req.url).searchParams;
  const limit = Math.min(Number(u.get("limit") ?? 20) || 20, 30);
  const mood = u.get("mood"), before = u.get("before"); // cursor = created_at of last item
  const rows = await q(`${FEED} AND ($1::text IS NULL OR EXISTS (SELECT 1 FROM post_moods x JOIN moods mm ON mm.id=x.mood_id WHERE x.post_id=p.id AND mm.slug=$1))
    AND ($2::timestamptz IS NULL OR p.created_at < $2) GROUP BY p.id, pr.nickname, pr.display_name ORDER BY p.created_at DESC LIMIT $3`, [mood, before, limit]);
  return Response.json({ items: rows, next: rows.length === limit ? rows[rows.length - 1].created_at : null });
}

const Body = z.object({
  body: z.string().trim().min(1).max(2000),
  identity: z.enum(["anonymous", "nickname", "real_name"]).default("anonymous"),
  moods: z.array(z.string()).max(5).default([]),
  visibility: z.enum(["public", "community", "private"]).default("public"),
  contentWarning: z.string().max(80).optional(), imageId: z.string().uuid().optional(),
  allowComments: z.boolean().default(true), allowAdvice: z.boolean().default(true), allowRequests: z.boolean().default(true),
});

export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({ error: "Bad origin" }, { status: 403 });
  const me = await currentUser();
  if (!me) return Response.json({ error: "Please sign in." }, { status: 401 });
  if (["restriction","suspension"].includes(me.sanction)) return Response.json({ error: "Posting is paused on your account." }, { status: 403 });
  if (limited(`post:${me.id}`, 10, 60 * 60_000)) return Response.json({ error: "You're posting quickly. Take a breath and try again soon." }, { status: 429 });
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: "Please check what you wrote.", fields: p.error.flatten().fieldErrors }, { status: 400 });
  const d = p.data;

  const risk = assessRisk(d.body);
  const status = d.visibility === "private" ? "approved" : screen(d.body); // clean posts go live, flagged ones wait for a human
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    // Posts wait for the automated + human review pipeline before reaching the public wall.
    const r = await c.query(`INSERT INTO posts (author_id,identity,body,content_warning,visibility,allow_comments,allow_advice,allow_requests,mod_status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [me.id, d.identity, d.body, d.contentWarning ?? null, d.visibility, d.allowComments, d.allowAdvice, d.allowRequests, status]);
    if (status === "flagged") await c.query("INSERT INTO moderation_cases (target,target_id,severity) VALUES ('post',$1,2)", [r.rows[0].id]);
    if (d.imageId) await c.query("UPDATE posts SET image_key=u.id::text FROM uploads u WHERE posts.id=$1 AND u.id=$2 AND u.user_id=$3", [r.rows[0].id, d.imageId, me.id]);
    if (d.moods.length) await c.query("INSERT INTO post_moods SELECT $1, id FROM moods WHERE slug = ANY($2)", [r.rows[0].id, d.moods]);
    // Alert stores only a pointer, never the text.
    if (risk === "crisis") await c.query("INSERT INTO safety_alerts (user_id,source) VALUES ($1,$2)", [me.id, `post:${r.rows[0].id}`]);
    await c.query("COMMIT");
    return Response.json({ id: r.rows[0].id, status: status === "approved" ? "live" : "in_review", showHelp: risk !== "none" }, { status: 201 });
  } catch { await c.query("ROLLBACK"); return Response.json({ error: "Something went wrong. Your words weren't lost, so please try again." }, { status: 500 }); }
  finally { c.release(); }
}
