import { z } from "zod";
import { q } from "@/lib/db";
import { handler, json, err } from "@/lib/http";
const Body = z.object({ target: z.enum(["post", "comment", "user", "message", "conversation"]), targetId: z.string().uuid(), reason: z.string().trim().min(2).max(300) });
export const POST = (req: Request) => handler(req, async me => {
  const p = Body.safeParse(await json(req)); if (!p.success) return err("Please tell us briefly what's wrong.");
  const [r] = await q("INSERT INTO reports (reporter_id,target,target_id,reason) VALUES ($1,$2,$3,$4) RETURNING id", [me.id, p.data.target, p.data.targetId, p.data.reason]);
  // Message/conversation reports are higher severity; only the reported content is exposed to moderators.
  const sev = ["message", "conversation"].includes(p.data.target) ? 3 : 2;
  await q("INSERT INTO moderation_cases (report_id,target,target_id,severity) VALUES ($1,$2,$3,$4)", [r.id, p.data.target, p.data.targetId, sev]);
  return Response.json({ ok: true }, { status: 201 });
}, { rate: [20, 3600_000] });
