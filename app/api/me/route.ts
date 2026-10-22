import { z } from "zod";
import { q } from "@/lib/db";
import { handler, json, err } from "@/lib/http";

export const GET = (req: Request) => handler(req, async me => {
  const [r] = await q(`SELECT pr.nickname,pr.display_name,pr.bio,pr.allow_requests,pr.hide_online,pr.topics_only_feed,u.is_minor,u.age_confirmed
    FROM profiles pr JOIN users u ON u.id=pr.user_id WHERE pr.user_id=$1`, [me.id]);   // email is never returned
  return Response.json(r);
});

const Patch = z.object({
  nickname: z.string().trim().min(2).max(24).optional(), displayName: z.string().max(40).optional(), bio: z.string().max(300).optional(),
  allowRequests: z.boolean().optional(), hideOnline: z.boolean().optional(), topicsOnlyFeed: z.boolean().optional(),
  isMinor: z.boolean().optional(), topics: z.array(z.string()).max(12).optional(),
});
export const PATCH = (req: Request) => handler(req, async me => {
  const p = Patch.safeParse(await json(req)); if (!p.success) return err("Please check your settings.");
  const d = p.data;
  // Minors can never turn private requests on.
  const minor = d.isMinor ?? me.is_minor;
  const allow = minor ? false : d.allowRequests;
  if (d.isMinor !== undefined) await q("UPDATE users SET is_minor=$2, age_confirmed=true, updated_at=now() WHERE id=$1", [me.id, d.isMinor]);
  await q(`UPDATE profiles SET nickname=coalesce($2,nickname), display_name=coalesce($3,display_name), bio=coalesce($4,bio),
    allow_requests=coalesce($5,allow_requests), hide_online=coalesce($6,hide_online), topics_only_feed=coalesce($7,topics_only_feed), updated_at=now() WHERE user_id=$1`,
    [me.id, d.nickname, d.displayName, d.bio, minor && d.isMinor !== undefined ? false : allow, d.hideOnline, d.topicsOnlyFeed]);
  if (d.topics) {
    await q("DELETE FROM user_topics WHERE user_id=$1", [me.id]);
    await q("INSERT INTO user_topics SELECT $1,id FROM topics WHERE slug=ANY($2)", [me.id, d.topics]);
  }
  return Response.json({ ok: true });
});
