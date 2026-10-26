import { z } from "zod";
import { q } from "@/lib/db";
import { handler, json, err } from "@/lib/http";
import { audit } from "@/lib/audit";
export const GET = (req: Request) => handler(req, async () => Response.json({ items: await q("SELECT id,mime,bytes,created_at FROM uploads WHERE status='pending' ORDER BY created_at LIMIT 50") }), { staff: "moderator" });
export const POST = (req: Request) => handler(req, async me => {
  const p = z.object({ id: z.string().uuid(), action: z.enum(["approve", "remove"]) }).safeParse(await json(req)); if (!p.success) return err("Invalid request.");
  await q("UPDATE uploads SET status=$2::mod_status WHERE id=$1", [p.data.id, p.data.action === "approve" ? "approved" : "removed"]);
  await audit(me.id, `upload.${p.data.action}`, p.data.id);
  return Response.json({ ok: true });
}, { staff: "moderator" });
