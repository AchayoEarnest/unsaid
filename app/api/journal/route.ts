import { z } from "zod";
import { q } from "@/lib/db";
import { handler, json, err } from "@/lib/http";
import { seal, open } from "@/lib/crypto";
// Journal is encrypted at rest and only ever readable by its owner. Text search runs client-side after decrypting.
export const GET = (req: Request) => handler(req, async me => {
  const u = new URL(req.url).searchParams, mood = u.get("mood"), tag = u.get("tag"), before = u.get("before");
  const rows = await q<{ id: string; body_enc: Buffer; slug: string; tags: string[]; created_at: string }>(
    `SELECT j.id,j.body_enc,m.slug,j.tags,j.created_at FROM journal_entries j LEFT JOIN moods m ON m.id=j.mood_id
     WHERE j.user_id=$1 AND j.deleted_at IS NULL AND ($2::text IS NULL OR m.slug=$2) AND ($3::text IS NULL OR $3=ANY(j.tags))
       AND ($4::timestamptz IS NULL OR j.created_at<$4) ORDER BY j.created_at DESC LIMIT 30`, [me.id, mood, tag, before]);
  return Response.json({ items: rows.map(r => ({ id: r.id, body: open(r.body_enc), mood: r.slug, tags: r.tags, created_at: r.created_at })) });
});
const Body = z.object({ body: z.string().trim().min(1).max(10000), mood: z.string().optional(), tags: z.array(z.string().max(24)).max(8).default([]) });
export const POST = (req: Request) => handler(req, async me => {
  const p = Body.safeParse(await json(req)); if (!p.success) return err("Write something first.");
  const [r] = await q("INSERT INTO journal_entries (user_id,body_enc,mood_id,tags) VALUES ($1,$2,(SELECT id FROM moods WHERE slug=$3),$4) RETURNING id", [me.id, seal(p.data.body), p.data.mood ?? null, p.data.tags]);
  return Response.json({ id: r.id }, { status: 201 });
});
