import { z } from "zod";
import { q } from "@/lib/db";
import { handler, json, err } from "@/lib/http";
const Body = z.object({ endpoint: z.string().url(), keys: z.object({ p256dh: z.string(), auth: z.string() }) });
export const POST = (req: Request) => handler(req, async me => {
  const p = Body.safeParse(await json(req)); if (!p.success) return err("Invalid subscription.");
  await q("INSERT INTO push_subscriptions (endpoint,user_id,p256dh,auth) VALUES ($1,$2,$3,$4) ON CONFLICT (endpoint) DO UPDATE SET user_id=$2,p256dh=$3,auth=$4", [p.data.endpoint, me.id, p.data.keys.p256dh, p.data.keys.auth]);
  return Response.json({ ok: true });
});
export const DELETE = (req: Request) => handler(req, async me => {
  await q("DELETE FROM push_subscriptions WHERE user_id=$1", [me.id]);
  return Response.json({ ok: true });
});
